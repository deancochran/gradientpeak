export const CYCLING_NORMALIZED_POWER_REFERENCE_VERSION =
  "direct-one-second-resampling-reference-v1";

export interface ReferenceCyclingPowerSample {
  timestampSeconds: number;
  powerWatts: number | null;
  included?: boolean;
}

interface ReferenceInterval {
  startSeconds: number;
  endSeconds: number;
  powerWatts: number;
}

export interface ReferenceCyclingNormalizedPowerResult {
  status: "available" | "partial" | "unavailable";
  valueWatts: number | null;
  reason?: "source_incomplete" | "no_samples" | "no_contributing_intervals" | "insufficient_window";
  diagnostics: {
    sampleCount: number;
    acceptedSampleCount: number;
    duplicateTimestampCount: number;
    reversedTimestampCount: number;
    contributingDurationSeconds: number;
    normalizedDurationSeconds: number;
    excludedGapDurationSeconds: number;
    excludedInactiveDurationSeconds: number;
    excludedMissingDurationSeconds: number;
  };
}

function compensatedSum(values: readonly number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const compensatedValue = value - compensation;
    const next = sum + compensatedValue;
    compensation = next - sum - compensatedValue;
    sum = next;
  }
  return sum;
}

function resampleSegment(intervals: readonly ReferenceInterval[]): number[] {
  const first = intervals[0];
  const last = intervals.at(-1);
  if (first === undefined || last === undefined) return [];

  const values: number[] = [];
  let intervalIndex = 0;
  for (
    let endpointSeconds = first.startSeconds + 1;
    endpointSeconds <= last.endSeconds + 1e-9;
    endpointSeconds += 1
  ) {
    const binStartSeconds = endpointSeconds - 1;
    let cursorSeconds = binStartSeconds;
    const weightedParts: number[] = [];
    while (cursorSeconds < endpointSeconds - 1e-9) {
      const interval = intervals[intervalIndex];
      if (interval === undefined) break;
      if (interval.endSeconds <= cursorSeconds + 1e-9) {
        intervalIndex += 1;
        continue;
      }
      const overlapStart = Math.max(cursorSeconds, interval.startSeconds);
      const overlapEnd = Math.min(endpointSeconds, interval.endSeconds);
      if (overlapEnd <= overlapStart + 1e-9) break;
      weightedParts.push(interval.powerWatts * (overlapEnd - overlapStart));
      cursorSeconds = overlapEnd;
    }
    if (Math.abs(cursorSeconds - endpointSeconds) > 1e-8) {
      throw new Error("Reference resampling encountered an uncovered contributing second");
    }
    values.push(compensatedSum(weightedParts));
  }
  return values;
}

/**
 * Independent test oracle: materialize one-second bins, directly sum each
 * trailing window, then use compensated fourth-power summation. It deliberately
 * imports no production schema, accumulator, or calculation helper.
 */
export function calculateReferenceCyclingNormalizedPower(input: {
  samples: readonly ReferenceCyclingPowerSample[];
  windowSeconds?: number;
  maxGapSeconds?: number;
}): ReferenceCyclingNormalizedPowerResult {
  const windowSeconds = input.windowSeconds ?? 30;
  const maxGapSeconds = input.maxGapSeconds ?? 5;
  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
    throw new Error("Reference window must be a positive whole number of seconds");
  }
  if (!Number.isFinite(maxGapSeconds) || maxGapSeconds <= 0 || maxGapSeconds > windowSeconds) {
    throw new Error("Reference maximum gap must be positive and no longer than the window");
  }

  const segments: ReferenceInterval[][] = [];
  let currentSegment: ReferenceInterval[] = [];
  let previousTimestampSeconds: number | null = null;
  let acceptedSampleCount = 0;
  let duplicateTimestampCount = 0;
  let reversedTimestampCount = 0;
  let contributingDurationSeconds = 0;
  let excludedGapDurationSeconds = 0;
  let excludedInactiveDurationSeconds = 0;
  let excludedMissingDurationSeconds = 0;

  const finishSegment = (): void => {
    if (currentSegment.length > 0) segments.push(currentSegment);
    currentSegment = [];
  };

  for (const sample of input.samples) {
    if (!Number.isFinite(sample.timestampSeconds)) {
      throw new Error("Reference timestamps must be finite");
    }
    if (
      sample.powerWatts !== null &&
      (!Number.isFinite(sample.powerWatts) || sample.powerWatts < 0)
    ) {
      throw new Error("Reference power must be finite, nonnegative, or missing");
    }
    if (previousTimestampSeconds !== null) {
      if (sample.timestampSeconds === previousTimestampSeconds) {
        duplicateTimestampCount += 1;
        continue;
      }
      if (sample.timestampSeconds < previousTimestampSeconds) {
        reversedTimestampCount += 1;
        continue;
      }
    }

    acceptedSampleCount += 1;
    if (previousTimestampSeconds === null) {
      previousTimestampSeconds = sample.timestampSeconds;
      continue;
    }

    const intervalSeconds = sample.timestampSeconds - previousTimestampSeconds;
    const intervalStartSeconds = previousTimestampSeconds;
    previousTimestampSeconds = sample.timestampSeconds;
    if (sample.included === false) {
      excludedInactiveDurationSeconds += intervalSeconds;
      finishSegment();
      continue;
    }
    if (sample.powerWatts === null) {
      excludedMissingDurationSeconds += intervalSeconds;
      finishSegment();
      continue;
    }
    if (intervalSeconds > maxGapSeconds) {
      excludedGapDurationSeconds += intervalSeconds;
      finishSegment();
      continue;
    }

    currentSegment.push({
      startSeconds: intervalStartSeconds,
      endSeconds: sample.timestampSeconds,
      powerWatts: sample.powerWatts,
    });
    contributingDurationSeconds += intervalSeconds;
  }
  finishSegment();

  const fourthPowers: number[] = [];
  for (const segment of segments) {
    const resampled = resampleSegment(segment);
    for (
      let endpointIndex = windowSeconds - 1;
      endpointIndex < resampled.length;
      endpointIndex += 1
    ) {
      const window = resampled.slice(endpointIndex - windowSeconds + 1, endpointIndex + 1);
      const rollingAverage = compensatedSum(window) / windowSeconds;
      fourthPowers.push(rollingAverage ** 4);
    }
  }

  const diagnostics = {
    sampleCount: input.samples.length,
    acceptedSampleCount,
    duplicateTimestampCount,
    reversedTimestampCount,
    contributingDurationSeconds,
    normalizedDurationSeconds: fourthPowers.length,
    excludedGapDurationSeconds,
    excludedInactiveDurationSeconds,
    excludedMissingDurationSeconds,
  };
  if (input.samples.length === 0 || acceptedSampleCount === 0) {
    return { status: "unavailable", valueWatts: null, reason: "no_samples", diagnostics };
  }
  if (contributingDurationSeconds <= 0) {
    return {
      status: "unavailable",
      valueWatts: null,
      reason: "no_contributing_intervals",
      diagnostics,
    };
  }
  if (fourthPowers.length === 0) {
    return {
      status: "unavailable",
      valueWatts: null,
      reason: "insufficient_window",
      diagnostics,
    };
  }

  const valueWatts = (compensatedSum(fourthPowers) / fourthPowers.length) ** 0.25;
  const sourceIncomplete =
    excludedGapDurationSeconds > 0 ||
    excludedMissingDurationSeconds > 0 ||
    duplicateTimestampCount > 0 ||
    reversedTimestampCount > 0;
  return sourceIncomplete
    ? { status: "partial", valueWatts, reason: "source_incomplete", diagnostics }
    : { status: "available", valueWatts, diagnostics };
}

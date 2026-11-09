export const RUNNING_NORMALIZED_GRADED_PACE_REFERENCE_VERSION = "direct-running-ngp-reference-v1";

export interface ReferenceRunningNgpSample {
  timestampSeconds: number;
  speedMetersPerSecond: number | null;
  elevationMeters: number | null;
  included?: boolean;
}

interface ReferenceAdjustedInterval {
  startSeconds: number;
  endSeconds: number;
  adjustedSpeedMetersPerSecond: number;
}

export interface ReferenceRunningNgpResult {
  status: "available" | "partial" | "unavailable";
  valueMetersPerSecond: number | null;
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

function directCostFactor(grade: number): number {
  return (
    155.4 * grade ** 5 -
    30.4 * grade ** 4 -
    43.3 * grade ** 3 +
    46.3 * grade ** 2 +
    19.5 * grade +
    3.6
  );
}

function directAdjustedSpeed(speedMetersPerSecond: number, grade: number): number {
  const boundedGrade = Math.max(-0.45, Math.min(grade, 0.45));
  const costRatio = Math.max(
    0.5,
    Math.min(directCostFactor(boundedGrade) / directCostFactor(0), 3),
  );
  return speedMetersPerSecond * costRatio;
}

function compensatedSum(values: readonly number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const adjusted = value - compensation;
    const next = sum + adjusted;
    compensation = next - sum - adjusted;
    sum = next;
  }
  return sum;
}

function resampleSegment(intervals: readonly ReferenceAdjustedInterval[]): number[] {
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
      weightedParts.push(interval.adjustedSpeedMetersPerSecond * (overlapEnd - overlapStart));
      cursorSeconds = overlapEnd;
    }
    if (Math.abs(cursorSeconds - endpointSeconds) > 1e-8) {
      throw new Error("Running NGP reference encountered an uncovered contributing second");
    }
    values.push(compensatedSum(weightedParts));
  }
  return values;
}

/**
 * Independent clarity-first test oracle. It imports no production schema,
 * grade helper, normalized-series primitive, accumulator, or calculation.
 */
export function calculateReferenceRunningNormalizedGradedPace(input: {
  samples: readonly ReferenceRunningNgpSample[];
  windowSeconds?: number;
  maxGapSeconds?: number;
}): ReferenceRunningNgpResult {
  const windowSeconds = input.windowSeconds ?? 30;
  const maxGapSeconds = input.maxGapSeconds ?? 5;
  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
    throw new Error("Running NGP reference window must be a positive whole number");
  }
  if (!Number.isFinite(maxGapSeconds) || maxGapSeconds <= 0 || maxGapSeconds > windowSeconds) {
    throw new Error("Running NGP reference maximum gap is invalid");
  }

  const segments: ReferenceAdjustedInterval[][] = [];
  let currentSegment: ReferenceAdjustedInterval[] = [];
  let previousTimestampSeconds: number | null = null;
  let previousElevationMeters: number | null = null;
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
      throw new Error("Running NGP reference timestamps must be finite");
    }
    if (
      sample.speedMetersPerSecond !== null &&
      (!Number.isFinite(sample.speedMetersPerSecond) || sample.speedMetersPerSecond < 0)
    ) {
      throw new Error("Running NGP reference speed must be finite, nonnegative, or missing");
    }
    if (sample.elevationMeters !== null && !Number.isFinite(sample.elevationMeters)) {
      throw new Error("Running NGP reference elevation must be finite or missing");
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
      previousElevationMeters = sample.elevationMeters;
      continue;
    }

    const intervalStartSeconds = previousTimestampSeconds;
    const intervalSeconds = sample.timestampSeconds - previousTimestampSeconds;
    const priorElevationMeters = previousElevationMeters;
    previousTimestampSeconds = sample.timestampSeconds;
    previousElevationMeters = sample.elevationMeters;

    if (sample.included === false) {
      excludedInactiveDurationSeconds += intervalSeconds;
      finishSegment();
      continue;
    }
    if (
      sample.speedMetersPerSecond === null ||
      sample.elevationMeters === null ||
      priorElevationMeters === null
    ) {
      excludedMissingDurationSeconds += intervalSeconds;
      finishSegment();
      continue;
    }
    if (intervalSeconds > maxGapSeconds) {
      excludedGapDurationSeconds += intervalSeconds;
      finishSegment();
      continue;
    }

    const distanceMeters = sample.speedMetersPerSecond * intervalSeconds;
    const grade =
      distanceMeters > 0 ? (sample.elevationMeters - priorElevationMeters) / distanceMeters : 0;
    currentSegment.push({
      startSeconds: intervalStartSeconds,
      endSeconds: sample.timestampSeconds,
      adjustedSpeedMetersPerSecond: directAdjustedSpeed(sample.speedMetersPerSecond, grade),
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
    return {
      status: "unavailable",
      valueMetersPerSecond: null,
      reason: "no_samples",
      diagnostics,
    };
  }
  if (contributingDurationSeconds <= 0) {
    return {
      status: "unavailable",
      valueMetersPerSecond: null,
      reason: "no_contributing_intervals",
      diagnostics,
    };
  }
  if (fourthPowers.length === 0) {
    return {
      status: "unavailable",
      valueMetersPerSecond: null,
      reason: "insufficient_window",
      diagnostics,
    };
  }

  const valueMetersPerSecond = (compensatedSum(fourthPowers) / fourthPowers.length) ** 0.25;
  const sourceIncomplete =
    excludedGapDurationSeconds > 0 ||
    excludedMissingDurationSeconds > 0 ||
    duplicateTimestampCount > 0 ||
    reversedTimestampCount > 0;
  return sourceIncomplete
    ? {
        status: "partial",
        valueMetersPerSecond,
        reason: "source_incomplete",
        diagnostics,
      }
    : { status: "available", valueMetersPerSecond, diagnostics };
}

/**
 * Test-only clarity reference for HR duration/zones/Load inputs and pool timing.
 * It intentionally imports no production helpers or policy constants.
 */

export const SWIMMING_HEART_RATE_REFERENCE_VERSION =
  "independent-swimming-heart-rate-reference-v1" as const;

export interface ReferenceHeartRateSample {
  timestampSeconds: number;
  heartRateBpm: number | null;
  included?: boolean;
}

export interface ReferenceHeartRateDuration {
  status: "available" | "partial" | "unavailable";
  coverageSeconds: number;
  eligibleDurationSeconds: number;
  sourceTimeCoverage: number;
  timeWeightedAverageBpm: number | null;
  buckets: Array<{ bpm: number; seconds: number }>;
  diagnostics: {
    pausedDurationSeconds: number;
    excludedGapDurationSeconds: number;
    excludedMissingDurationSeconds: number;
    excludedInvalidDurationSeconds: number;
    duplicateTimestampCount: number;
    reversedTimestampCount: number;
    invalidTimestampCount: number;
  };
}

export function calculateReferenceHeartRateDuration(input: {
  samples: readonly ReferenceHeartRateSample[];
  maxGapSeconds: number;
}): ReferenceHeartRateDuration {
  let previousTimestampSeconds: number | null = null;
  let coverageSeconds = 0;
  let eligibleDurationSeconds = 0;
  let weightedHeartRate = 0;
  let pausedDurationSeconds = 0;
  let excludedGapDurationSeconds = 0;
  let excludedMissingDurationSeconds = 0;
  let excludedInvalidDurationSeconds = 0;
  let duplicateTimestampCount = 0;
  let reversedTimestampCount = 0;
  let invalidTimestampCount = 0;
  const bucketSeconds = new Map<number, number>();

  for (const sample of input.samples) {
    if (!Number.isFinite(sample.timestampSeconds)) {
      invalidTimestampCount += 1;
      continue;
    }
    const previous = previousTimestampSeconds;
    if (previous !== null && sample.timestampSeconds <= previous) {
      if (sample.timestampSeconds === previous) duplicateTimestampCount += 1;
      else reversedTimestampCount += 1;
      continue;
    }
    previousTimestampSeconds = sample.timestampSeconds;
    if (previous === null) continue;

    const durationSeconds = sample.timestampSeconds - previous;
    if (sample.included === false) {
      pausedDurationSeconds += durationSeconds;
      continue;
    }
    eligibleDurationSeconds += durationSeconds;
    if (sample.heartRateBpm === null) {
      excludedMissingDurationSeconds += durationSeconds;
      continue;
    }
    if (
      !Number.isFinite(sample.heartRateBpm) ||
      sample.heartRateBpm < 30 ||
      sample.heartRateBpm > 250
    ) {
      excludedInvalidDurationSeconds += durationSeconds;
      continue;
    }
    if (durationSeconds > input.maxGapSeconds) {
      excludedGapDurationSeconds += durationSeconds;
      continue;
    }

    coverageSeconds += durationSeconds;
    weightedHeartRate += sample.heartRateBpm * durationSeconds;
    const roundedBpm = Math.round(sample.heartRateBpm);
    bucketSeconds.set(roundedBpm, (bucketSeconds.get(roundedBpm) ?? 0) + durationSeconds);
  }

  const sourceTimeCoverage =
    eligibleDurationSeconds > 0 ? coverageSeconds / eligibleDurationSeconds : 0;
  const buckets = [...bucketSeconds.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bpm, seconds]) => ({ bpm, seconds }));
  const sourceIncomplete =
    excludedGapDurationSeconds > 0 ||
    excludedMissingDurationSeconds > 0 ||
    excludedInvalidDurationSeconds > 0 ||
    duplicateTimestampCount > 0 ||
    reversedTimestampCount > 0 ||
    invalidTimestampCount > 0;
  return {
    status: coverageSeconds <= 0 ? "unavailable" : sourceIncomplete ? "partial" : "available",
    coverageSeconds,
    eligibleDurationSeconds,
    sourceTimeCoverage,
    timeWeightedAverageBpm: coverageSeconds > 0 ? weightedHeartRate / coverageSeconds : null,
    buckets,
    diagnostics: {
      pausedDurationSeconds,
      excludedGapDurationSeconds,
      excludedMissingDurationSeconds,
      excludedInvalidDurationSeconds,
      duplicateTimestampCount,
      reversedTimestampCount,
      invalidTimestampCount,
    },
  };
}

export function calculateReferenceHeartRateZoneSeconds(input: {
  buckets: readonly { bpm: number; seconds: number }[];
  lthrBpm: number;
}): [number, number, number, number, number] {
  const zoneSeconds: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const bucket of input.buckets) {
    const ratio = bucket.bpm / input.lthrBpm;
    const zoneIndex = ratio < 0.81 ? 0 : ratio < 0.9 ? 1 : ratio < 0.94 ? 2 : ratio < 1 ? 3 : 4;
    zoneSeconds[zoneIndex] += bucket.seconds;
  }
  return zoneSeconds;
}

export function calculateReferenceHeartRateCommonLoadInputs(input: {
  evidence: Pick<
    ReferenceHeartRateDuration,
    "buckets" | "coverageSeconds" | "eligibleDurationSeconds" | "sourceTimeCoverage"
  >;
  lthrBpm: number;
}) {
  const rawLoad = input.evidence.buckets.reduce(
    (total, bucket) => total + (bucket.seconds / 3_600) * (bucket.bpm / input.lthrBpm) ** 2 * 100,
    0,
  );
  const coveredHours = input.evidence.coverageSeconds / 3_600;
  return {
    contributingDurationSeconds: input.evidence.coverageSeconds,
    eligibleDurationSeconds: input.evidence.eligibleDurationSeconds,
    coverageRatio: input.evidence.sourceTimeCoverage,
    zoneSeconds: calculateReferenceHeartRateZoneSeconds({
      buckets: input.evidence.buckets,
      lthrBpm: input.lthrBpm,
    }),
    rawLoad,
    rawEquivalentIntensityFactor:
      coveredHours > 0 ? Math.sqrt(rawLoad / (coveredHours * 100)) : null,
  };
}

export interface ReferenceSwimLength {
  lengthType?: string | null;
  totalElapsedTime?: number | null;
  totalTimerTime?: number | null;
}

function positiveFinite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function calculateReferenceSwimTiming(input: {
  elapsedDurationSeconds: number;
  lengths: readonly ReferenceSwimLength[];
  expectedActiveLengthCount?: number | null;
}) {
  let activeDurationSeconds = 0;
  let restDurationSeconds = 0;
  let activeLengthCount = 0;
  let sourceIncomplete = false;
  for (const length of input.lengths) {
    const active = length.lengthType === "active";
    const rest = length.lengthType === "rest" || length.lengthType === "idle";
    if (!active && !rest) {
      sourceIncomplete = true;
      continue;
    }
    if (active) activeLengthCount += 1;
    const durationSeconds = active
      ? (positiveFinite(length.totalTimerTime) ?? positiveFinite(length.totalElapsedTime))
      : (positiveFinite(length.totalElapsedTime) ?? positiveFinite(length.totalTimerTime));
    if (durationSeconds === null) {
      sourceIncomplete = true;
      continue;
    }
    if (active) activeDurationSeconds += durationSeconds;
    else restDurationSeconds += durationSeconds;
  }
  const knownDurationSeconds = activeDurationSeconds + restDurationSeconds;
  const tolerance =
    Number.EPSILON *
    Math.max(1, Math.abs(knownDurationSeconds), Math.abs(input.elapsedDurationSeconds)) *
    16;
  if (knownDurationSeconds - input.elapsedDurationSeconds > tolerance) {
    return {
      status: "unavailable" as const,
      reason: "invalid_timing" as const,
      activeDurationSeconds: null,
      restDurationSeconds: null,
      knownDurationSeconds,
      activeLengthCount,
    };
  }
  if (input.lengths.length === 0 || knownDurationSeconds === 0) {
    return {
      status: "unavailable" as const,
      reason: "no_length_timing" as const,
      activeDurationSeconds: null,
      restDurationSeconds: null,
      knownDurationSeconds,
      activeLengthCount,
    };
  }
  const expectedCountMatches =
    input.expectedActiveLengthCount == null ||
    input.expectedActiveLengthCount === activeLengthCount;
  const complete =
    !sourceIncomplete &&
    expectedCountMatches &&
    Math.abs(knownDurationSeconds - input.elapsedDurationSeconds) <= tolerance;
  return {
    status: complete ? ("available" as const) : ("partial" as const),
    ...(complete ? {} : { reason: "source_incomplete" as const }),
    activeDurationSeconds: activeDurationSeconds > 0 ? activeDurationSeconds : null,
    restDurationSeconds: restDurationSeconds > 0 ? restDurationSeconds : null,
    knownDurationSeconds,
    activeLengthCount,
  };
}

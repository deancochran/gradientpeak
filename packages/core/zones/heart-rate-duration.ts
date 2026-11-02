import { z } from "zod";

export const HEART_RATE_ZONE_DURATION_CALCULATION_VERSION = "heart-rate-zone-duration-v1" as const;
export const DEFAULT_HEART_RATE_MAX_GAP_SECONDS = 5;
export const MAX_HEART_RATE_DURATION_SAMPLES = 1_000_000;
export const MIN_QUALIFIED_HEART_RATE_BPM = 30;
export const MAX_QUALIFIED_HEART_RATE_BPM = 250;

export const LTHR_ZONE_UPPER_RATIOS = [0.81, 0.9, 0.94, 1, Number.POSITIVE_INFINITY] as const;

const heartRateBucketSchema = z
  .object({
    bpm: z.number().int().min(MIN_QUALIFIED_HEART_RATE_BPM).max(MAX_QUALIFIED_HEART_RATE_BPM),
    seconds: z.number().finite().positive(),
  })
  .strict();

const heartRateDurationDiagnosticsSchema = z
  .object({
    sourceSampleCount: z.number().int().nonnegative(),
    acceptedTimestampCount: z.number().int().nonnegative(),
    contributingIntervalCount: z.number().int().nonnegative(),
    observedSpanSeconds: z.number().finite().nonnegative(),
    pausedDurationSeconds: z.number().finite().nonnegative(),
    excludedGapDurationSeconds: z.number().finite().nonnegative(),
    excludedMissingDurationSeconds: z.number().finite().nonnegative(),
    excludedInvalidDurationSeconds: z.number().finite().nonnegative(),
    duplicateTimestampCount: z.number().int().nonnegative(),
    reversedTimestampCount: z.number().int().nonnegative(),
    invalidTimestampCount: z.number().int().nonnegative(),
  })
  .strict();

const heartRateDurationCommonShape = {
  calculationVersion: z.literal(HEART_RATE_ZONE_DURATION_CALCULATION_VERSION),
  coverageSeconds: z.number().finite().nonnegative(),
  eligibleDurationSeconds: z.number().finite().nonnegative(),
  sourceTimeCoverage: z.number().finite().min(0).max(1),
  diagnostics: heartRateDurationDiagnosticsSchema,
};

const numericHeartRateDurationShape = {
  ...heartRateDurationCommonShape,
  coverageSeconds: z.number().finite().positive(),
  eligibleDurationSeconds: z.number().finite().positive(),
  timeWeightedAverageBpm: z
    .number()
    .finite()
    .min(MIN_QUALIFIED_HEART_RATE_BPM)
    .max(MAX_QUALIFIED_HEART_RATE_BPM),
  buckets: z.array(heartRateBucketSchema).min(1).max(221),
};

function validateNumericHeartRateDuration(
  result: {
    coverageSeconds: number;
    eligibleDurationSeconds: number;
    sourceTimeCoverage: number;
    buckets: readonly { bpm: number; seconds: number }[];
  },
  context: z.RefinementCtx,
): void {
  const bucketSeconds = result.buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
  const expectedCoverage = result.coverageSeconds / result.eligibleDurationSeconds;
  const tolerance =
    Number.EPSILON *
    Math.max(
      1,
      Math.abs(bucketSeconds),
      Math.abs(result.coverageSeconds),
      Math.abs(result.sourceTimeCoverage),
    ) *
    16;
  if (Math.abs(bucketSeconds - result.coverageSeconds) > tolerance) {
    context.addIssue({
      code: "custom",
      path: ["buckets"],
      message: "HR buckets must equal coverage",
    });
  }
  if (result.coverageSeconds > result.eligibleDurationSeconds + tolerance) {
    context.addIssue({
      code: "custom",
      path: ["coverageSeconds"],
      message: "HR coverage cannot exceed eligible duration",
    });
  }
  if (Math.abs(expectedCoverage - result.sourceTimeCoverage) > tolerance) {
    context.addIssue({
      code: "custom",
      path: ["sourceTimeCoverage"],
      message: "HR coverage ratio must use eligible duration",
    });
  }
}

const availableHeartRateDurationSchema = z
  .object({
    status: z.literal("available"),
    ...numericHeartRateDurationShape,
  })
  .strict()
  .superRefine((result, context) => {
    validateNumericHeartRateDuration(result, context);
    if (result.sourceTimeCoverage !== 1) {
      context.addIssue({
        code: "custom",
        path: ["sourceTimeCoverage"],
        message: "Available HR duration requires complete eligible-time coverage",
      });
    }
  });

const partialHeartRateDurationSchema = z
  .object({
    status: z.literal("partial"),
    reason: z.literal("source_incomplete"),
    ...numericHeartRateDurationShape,
  })
  .strict()
  .superRefine(validateNumericHeartRateDuration);

const unavailableHeartRateDurationSchema = z
  .object({
    status: z.literal("unavailable"),
    reason: z.enum(["no_samples", "no_contributing_intervals"]),
    ...heartRateDurationCommonShape,
    coverageSeconds: z.literal(0),
    sourceTimeCoverage: z.literal(0),
    timeWeightedAverageBpm: z.null(),
    buckets: z.tuple([]),
  })
  .strict();

export const heartRateDurationEvidenceSchema = z.discriminatedUnion("status", [
  availableHeartRateDurationSchema,
  partialHeartRateDurationSchema,
  unavailableHeartRateDurationSchema,
]);

export type HeartRateDurationEvidence = z.infer<typeof heartRateDurationEvidenceSchema>;

export interface HeartRateDurationSample {
  timestampSeconds: number;
  heartRateBpm: number | null;
  /** The current sample describes (previous timestamp, current timestamp]. */
  included?: boolean;
}

export interface HeartRateDurationAccumulator {
  addSample(sample: HeartRateDurationSample): void;
  getResult(): HeartRateDurationEvidence;
  reset(): void;
}

interface HeartRateDurationState {
  previousAcceptedTimestampSeconds: number | null;
  sourceSampleCount: number;
  acceptedTimestampCount: number;
  contributingIntervalCount: number;
  observedSpanSeconds: number;
  eligibleDurationSeconds: number;
  coverageSeconds: number;
  weightedHeartRateSum: number;
  pausedDurationSeconds: number;
  excludedGapDurationSeconds: number;
  excludedMissingDurationSeconds: number;
  excludedInvalidDurationSeconds: number;
  duplicateTimestampCount: number;
  reversedTimestampCount: number;
  invalidTimestampCount: number;
  buckets: Map<number, number>;
}

function initialHeartRateDurationState(): HeartRateDurationState {
  return {
    previousAcceptedTimestampSeconds: null,
    sourceSampleCount: 0,
    acceptedTimestampCount: 0,
    contributingIntervalCount: 0,
    observedSpanSeconds: 0,
    eligibleDurationSeconds: 0,
    coverageSeconds: 0,
    weightedHeartRateSum: 0,
    pausedDurationSeconds: 0,
    excludedGapDurationSeconds: 0,
    excludedMissingDurationSeconds: 0,
    excludedInvalidDurationSeconds: 0,
    duplicateTimestampCount: 0,
    reversedTimestampCount: 0,
    invalidTimestampCount: 0,
    buckets: new Map(),
  };
}

function isQualifiedHeartRate(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MIN_QUALIFIED_HEART_RATE_BPM &&
    value <= MAX_QUALIFIED_HEART_RATE_BPM
  );
}

class DefaultHeartRateDurationAccumulator implements HeartRateDurationAccumulator {
  private state = initialHeartRateDurationState();

  constructor(private readonly maxGapSeconds: number) {}

  addSample(sample: HeartRateDurationSample): void {
    this.state.sourceSampleCount += 1;
    if (!Number.isFinite(sample.timestampSeconds)) {
      this.state.invalidTimestampCount += 1;
      return;
    }

    const previousTimestamp = this.state.previousAcceptedTimestampSeconds;
    if (previousTimestamp !== null && sample.timestampSeconds <= previousTimestamp) {
      if (sample.timestampSeconds === previousTimestamp) {
        this.state.duplicateTimestampCount += 1;
      } else {
        this.state.reversedTimestampCount += 1;
      }
      return;
    }

    this.state.previousAcceptedTimestampSeconds = sample.timestampSeconds;
    this.state.acceptedTimestampCount += 1;
    if (previousTimestamp === null) return;

    const seconds = sample.timestampSeconds - previousTimestamp;
    this.state.observedSpanSeconds += seconds;
    if (sample.included === false) {
      this.state.pausedDurationSeconds += seconds;
      return;
    }

    this.state.eligibleDurationSeconds += seconds;
    if (sample.heartRateBpm === null) {
      this.state.excludedMissingDurationSeconds += seconds;
      return;
    }
    if (!isQualifiedHeartRate(sample.heartRateBpm)) {
      this.state.excludedInvalidDurationSeconds += seconds;
      return;
    }
    if (seconds > this.maxGapSeconds) {
      this.state.excludedGapDurationSeconds += seconds;
      return;
    }

    this.state.coverageSeconds += seconds;
    this.state.weightedHeartRateSum += sample.heartRateBpm * seconds;
    this.state.contributingIntervalCount += 1;
    const bucket = Math.round(sample.heartRateBpm);
    this.state.buckets.set(bucket, (this.state.buckets.get(bucket) ?? 0) + seconds);
  }

  getResult(): HeartRateDurationEvidence {
    const diagnostics = {
      sourceSampleCount: this.state.sourceSampleCount,
      acceptedTimestampCount: this.state.acceptedTimestampCount,
      contributingIntervalCount: this.state.contributingIntervalCount,
      observedSpanSeconds: this.state.observedSpanSeconds,
      pausedDurationSeconds: this.state.pausedDurationSeconds,
      excludedGapDurationSeconds: this.state.excludedGapDurationSeconds,
      excludedMissingDurationSeconds: this.state.excludedMissingDurationSeconds,
      excludedInvalidDurationSeconds: this.state.excludedInvalidDurationSeconds,
      duplicateTimestampCount: this.state.duplicateTimestampCount,
      reversedTimestampCount: this.state.reversedTimestampCount,
      invalidTimestampCount: this.state.invalidTimestampCount,
    };
    const common = {
      calculationVersion: HEART_RATE_ZONE_DURATION_CALCULATION_VERSION,
      eligibleDurationSeconds: this.state.eligibleDurationSeconds,
      diagnostics,
    };
    if (this.state.coverageSeconds <= 0) {
      return heartRateDurationEvidenceSchema.parse({
        status: "unavailable",
        reason: this.state.sourceSampleCount === 0 ? "no_samples" : "no_contributing_intervals",
        ...common,
        coverageSeconds: 0,
        sourceTimeCoverage: 0,
        timeWeightedAverageBpm: null,
        buckets: [],
      });
    }

    const sourceTimeCoverage =
      this.state.eligibleDurationSeconds > 0
        ? this.state.coverageSeconds / this.state.eligibleDurationSeconds
        : 0;
    const buckets = Array.from(this.state.buckets.entries())
      .sort(([left], [right]) => left - right)
      .map(([bpm, seconds]) => ({ bpm, seconds }));
    const sourceIncomplete =
      this.state.excludedGapDurationSeconds > 0 ||
      this.state.excludedMissingDurationSeconds > 0 ||
      this.state.excludedInvalidDurationSeconds > 0 ||
      this.state.duplicateTimestampCount > 0 ||
      this.state.reversedTimestampCount > 0 ||
      this.state.invalidTimestampCount > 0;
    return heartRateDurationEvidenceSchema.parse({
      status: sourceIncomplete ? "partial" : "available",
      ...(sourceIncomplete ? { reason: "source_incomplete" } : {}),
      ...common,
      coverageSeconds: this.state.coverageSeconds,
      sourceTimeCoverage,
      timeWeightedAverageBpm: this.state.weightedHeartRateSum / this.state.coverageSeconds,
      buckets,
    });
  }

  reset(): void {
    this.state = initialHeartRateDurationState();
  }
}

function resolvedMaxGapSeconds(value: number | undefined): number {
  const resolved = value ?? DEFAULT_HEART_RATE_MAX_GAP_SECONDS;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error("Heart-rate maximum gap must be finite and greater than zero");
  }
  return resolved;
}

export function createHeartRateDurationAccumulator(
  input: { maxGapSeconds?: number } = {},
): HeartRateDurationAccumulator {
  return new DefaultHeartRateDurationAccumulator(resolvedMaxGapSeconds(input.maxGapSeconds));
}

export function calculateHeartRateDuration(input: {
  samples: readonly HeartRateDurationSample[];
  maxGapSeconds?: number;
}): HeartRateDurationEvidence {
  if (input.samples.length > MAX_HEART_RATE_DURATION_SAMPLES) {
    throw new Error(`Heart-rate duration is limited to ${MAX_HEART_RATE_DURATION_SAMPLES} samples`);
  }
  const accumulator = createHeartRateDurationAccumulator({
    ...(input.maxGapSeconds === undefined ? {} : { maxGapSeconds: input.maxGapSeconds }),
  });
  for (const sample of input.samples) accumulator.addSample(sample);
  return accumulator.getResult();
}

const heartRateZoneSecondsSchema = z.tuple([
  z.number().finite().nonnegative(),
  z.number().finite().nonnegative(),
  z.number().finite().nonnegative(),
  z.number().finite().nonnegative(),
  z.number().finite().nonnegative(),
]);

const availableHeartRateZoneDurationSchema = z
  .object({
    status: z.literal("available"),
    calculationVersion: z.literal(HEART_RATE_ZONE_DURATION_CALCULATION_VERSION),
    lthrBpm: z.number().finite().min(80).max(220),
    zoneSeconds: heartRateZoneSecondsSchema,
    evidence: availableHeartRateDurationSchema,
  })
  .strict();

const partialHeartRateZoneDurationSchema = z
  .object({
    status: z.literal("partial"),
    reason: z.literal("source_incomplete"),
    calculationVersion: z.literal(HEART_RATE_ZONE_DURATION_CALCULATION_VERSION),
    lthrBpm: z.number().finite().min(80).max(220),
    zoneSeconds: heartRateZoneSecondsSchema,
    evidence: partialHeartRateDurationSchema,
  })
  .strict();

const unavailableHeartRateZoneDurationSchema = z
  .object({
    status: z.literal("unavailable"),
    reason: z.enum(["heart_rate_unavailable", "threshold_missing", "invalid_threshold"]),
    calculationVersion: z.literal(HEART_RATE_ZONE_DURATION_CALCULATION_VERSION),
    lthrBpm: z.number().finite().nullable(),
    zoneSeconds: z.null(),
    evidence: heartRateDurationEvidenceSchema,
  })
  .strict();

export const heartRateZoneDurationResultSchema = z.discriminatedUnion("status", [
  availableHeartRateZoneDurationSchema,
  partialHeartRateZoneDurationSchema,
  unavailableHeartRateZoneDurationSchema,
]);

export type HeartRateZoneDurationResult = z.infer<typeof heartRateZoneDurationResultSchema>;

export function getHeartRateZoneIndexFromLthrRatio(ratio: number): 0 | 1 | 2 | 3 | 4 {
  if (ratio < LTHR_ZONE_UPPER_RATIOS[0]) return 0;
  if (ratio < LTHR_ZONE_UPPER_RATIOS[1]) return 1;
  if (ratio < LTHR_ZONE_UPPER_RATIOS[2]) return 2;
  if (ratio < LTHR_ZONE_UPPER_RATIOS[3]) return 3;
  return 4;
}

export function calculateHeartRateZoneDuration(input: {
  evidence: HeartRateDurationEvidence;
  lthrBpm?: number | null;
}): HeartRateZoneDurationResult {
  const evidence = heartRateDurationEvidenceSchema.parse(input.evidence);
  if (evidence.status === "unavailable") {
    return heartRateZoneDurationResultSchema.parse({
      status: "unavailable",
      reason: "heart_rate_unavailable",
      calculationVersion: HEART_RATE_ZONE_DURATION_CALCULATION_VERSION,
      lthrBpm: input.lthrBpm ?? null,
      zoneSeconds: null,
      evidence,
    });
  }
  if (input.lthrBpm === null || input.lthrBpm === undefined) {
    return heartRateZoneDurationResultSchema.parse({
      status: "unavailable",
      reason: "threshold_missing",
      calculationVersion: HEART_RATE_ZONE_DURATION_CALCULATION_VERSION,
      lthrBpm: null,
      zoneSeconds: null,
      evidence,
    });
  }
  if (!Number.isFinite(input.lthrBpm) || input.lthrBpm < 80 || input.lthrBpm > 220) {
    return heartRateZoneDurationResultSchema.parse({
      status: "unavailable",
      reason: "invalid_threshold",
      calculationVersion: HEART_RATE_ZONE_DURATION_CALCULATION_VERSION,
      lthrBpm: Number.isFinite(input.lthrBpm) ? input.lthrBpm : null,
      zoneSeconds: null,
      evidence,
    });
  }

  const zoneSeconds: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const bucket of evidence.buckets) {
    const zoneIndex = getHeartRateZoneIndexFromLthrRatio(bucket.bpm / input.lthrBpm);
    zoneSeconds[zoneIndex] += bucket.seconds;
  }
  return heartRateZoneDurationResultSchema.parse({
    status: evidence.status,
    ...(evidence.status === "partial" ? { reason: "source_incomplete" } : {}),
    calculationVersion: HEART_RATE_ZONE_DURATION_CALCULATION_VERSION,
    lthrBpm: input.lthrBpm,
    zoneSeconds,
    evidence,
  });
}

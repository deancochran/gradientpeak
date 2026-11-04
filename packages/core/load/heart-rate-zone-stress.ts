import { z } from "zod";

import {
  calculateHeartRateZoneDuration,
  type HeartRateDurationEvidence,
  heartRateDurationEvidenceSchema,
} from "../zones/heart-rate-duration";

export const HEART_RATE_COMMON_LOAD_CALCULATION_VERSION = "heart-rate-common-load-v1" as const;
export const HEART_RATE_COMMON_LOAD_MINIMUM_COVERAGE_RATIO = 0.8;
export const HEART_RATE_COMMON_LOAD_MINIMUM_DURATION_SECONDS = 30;

export interface CalculateHeartRateZoneStressInput {
  durationSeconds: number;
  lthrBpm: number | null;
  distribution: HeartRateDurationEvidence;
  minimumCoverageRatio?: number;
  minimumDurationSeconds?: number;
}

const commonCalculationShape = {
  calculationVersion: z.literal(HEART_RATE_COMMON_LOAD_CALCULATION_VERSION),
  contributingDurationSeconds: z.number().finite().nonnegative(),
  eligibleDurationSeconds: z.number().finite().nonnegative(),
  coverageRatio: z.number().finite().min(0).max(1),
};

const zoneSecondsSchema = z.tuple([
  z.number().finite().nonnegative(),
  z.number().finite().nonnegative(),
  z.number().finite().nonnegative(),
  z.number().finite().nonnegative(),
  z.number().finite().nonnegative(),
]);

const availableHeartRateCommonLoadCalculationSchema = z
  .object({
    status: z.literal("available"),
    ...commonCalculationShape,
    load: z.number().finite().nonnegative(),
    equivalentIntensityFactor: z.number().finite().min(0).max(1.5),
    rawLoad: z.number().finite().nonnegative(),
    rawEquivalentIntensityFactor: z.number().finite().min(0).max(1.5),
    zoneSeconds: zoneSecondsSchema,
  })
  .strict();

const partialHeartRateCommonLoadCalculationSchema = z
  .object({
    status: z.literal("partial"),
    reason: z.literal("source_incomplete"),
    ...commonCalculationShape,
    load: z.number().finite().nonnegative(),
    equivalentIntensityFactor: z.number().finite().min(0).max(1.5),
    rawLoad: z.number().finite().nonnegative(),
    rawEquivalentIntensityFactor: z.number().finite().min(0).max(1.5),
    zoneSeconds: zoneSecondsSchema,
  })
  .strict();

const unavailableHeartRateCommonLoadCalculationSchema = z
  .object({
    status: z.literal("unavailable"),
    reason: z.enum([
      "threshold_missing",
      "invalid_threshold",
      "activity_data_missing",
      "insufficient_coverage",
      "invalid_data",
      "intensity_out_of_range",
    ]),
    ...commonCalculationShape,
    load: z.null(),
    equivalentIntensityFactor: z.null(),
    rawLoad: z.null(),
    rawEquivalentIntensityFactor: z.null(),
    zoneSeconds: z.null(),
  })
  .strict();

export const heartRateCommonLoadCalculationResultSchema = z.discriminatedUnion("status", [
  availableHeartRateCommonLoadCalculationSchema,
  partialHeartRateCommonLoadCalculationSchema,
  unavailableHeartRateCommonLoadCalculationSchema,
]);

export type HeartRateCommonLoadCalculationResult = z.infer<
  typeof heartRateCommonLoadCalculationResultSchema
>;

function unavailable(input: {
  reason: Extract<HeartRateCommonLoadCalculationResult, { status: "unavailable" }>["reason"];
  contributingDurationSeconds: number;
  eligibleDurationSeconds: number;
}): HeartRateCommonLoadCalculationResult {
  const coverageRatio =
    input.eligibleDurationSeconds > 0
      ? input.contributingDurationSeconds / input.eligibleDurationSeconds
      : 0;
  return heartRateCommonLoadCalculationResultSchema.parse({
    status: "unavailable",
    reason: input.reason,
    calculationVersion: HEART_RATE_COMMON_LOAD_CALCULATION_VERSION,
    contributingDurationSeconds: input.contributingDurationSeconds,
    eligibleDurationSeconds: input.eligibleDurationSeconds,
    coverageRatio,
    load: null,
    equivalentIntensityFactor: null,
    rawLoad: null,
    rawEquivalentIntensityFactor: null,
    zoneSeconds: null,
  });
}

function resolveEvidence(
  input: CalculateHeartRateZoneStressInput,
): HeartRateDurationEvidence | null {
  const parsed = heartRateDurationEvidenceSchema.safeParse(input.distribution);
  if (!parsed.success) return null;
  const tolerance =
    Number.EPSILON *
    Math.max(1, Math.abs(parsed.data.eligibleDurationSeconds), Math.abs(input.durationSeconds)) *
    16;
  return Math.abs(parsed.data.eligibleDurationSeconds - input.durationSeconds) <= tolerance
    ? parsed.data
    : null;
}

/**
 * Integrates qualified HR time as `100 * hours * (HR / LTHR)^2`.
 * Zone duration is retained as a diagnostic; zone labels do not quantize Load.
 */
export function calculateHeartRateZoneStress(
  input: CalculateHeartRateZoneStressInput,
): HeartRateCommonLoadCalculationResult {
  const minimumCoverageRatio =
    input.minimumCoverageRatio ?? HEART_RATE_COMMON_LOAD_MINIMUM_COVERAGE_RATIO;
  const minimumDurationSeconds =
    input.minimumDurationSeconds ?? HEART_RATE_COMMON_LOAD_MINIMUM_DURATION_SECONDS;
  if (
    !Number.isFinite(input.durationSeconds) ||
    input.durationSeconds <= 0 ||
    !Number.isFinite(minimumCoverageRatio) ||
    minimumCoverageRatio < 0 ||
    minimumCoverageRatio > 1 ||
    !Number.isFinite(minimumDurationSeconds) ||
    minimumDurationSeconds < 0
  ) {
    return unavailable({
      reason: "invalid_data",
      contributingDurationSeconds: 0,
      eligibleDurationSeconds:
        Number.isFinite(input.durationSeconds) && input.durationSeconds > 0
          ? input.durationSeconds
          : 0,
    });
  }

  const parsedDistribution = heartRateDurationEvidenceSchema.safeParse(input.distribution);
  const parsedCoverage = parsedDistribution.success ? parsedDistribution.data.coverageSeconds : 0;
  const rawCoverage = parsedCoverage <= input.durationSeconds ? parsedCoverage : 0;
  if (input.lthrBpm === null) {
    return unavailable({
      reason: "threshold_missing",
      contributingDurationSeconds: rawCoverage,
      eligibleDurationSeconds: input.durationSeconds,
    });
  }
  if (!Number.isFinite(input.lthrBpm) || input.lthrBpm < 80 || input.lthrBpm > 220) {
    return unavailable({
      reason: "invalid_threshold",
      contributingDurationSeconds: rawCoverage,
      eligibleDurationSeconds: input.durationSeconds,
    });
  }

  const evidence = resolveEvidence(input);
  if (evidence === null) {
    return unavailable({
      reason: "invalid_data",
      contributingDurationSeconds: 0,
      eligibleDurationSeconds: input.durationSeconds,
    });
  }
  if (evidence.status === "unavailable") {
    return unavailable({
      reason: "activity_data_missing",
      contributingDurationSeconds: 0,
      eligibleDurationSeconds: evidence.eligibleDurationSeconds,
    });
  }

  const coverageRatio = evidence.sourceTimeCoverage;
  if (evidence.coverageSeconds < minimumDurationSeconds || coverageRatio < minimumCoverageRatio) {
    return unavailable({
      reason: "insufficient_coverage",
      contributingDurationSeconds: evidence.coverageSeconds,
      eligibleDurationSeconds: evidence.eligibleDurationSeconds,
    });
  }

  const lthrBpm = input.lthrBpm;
  const zoneDuration = calculateHeartRateZoneDuration({ evidence, lthrBpm });
  if (zoneDuration.status === "unavailable") {
    return unavailable({
      reason: "invalid_data",
      contributingDurationSeconds: evidence.coverageSeconds,
      eligibleDurationSeconds: evidence.eligibleDurationSeconds,
    });
  }

  const rawLoad = evidence.buckets.reduce(
    (total, bucket) => total + (bucket.seconds / 3_600) * (bucket.bpm / lthrBpm) ** 2 * 100,
    0,
  );
  const coveredHours = evidence.coverageSeconds / 3_600;
  const rawEquivalentIntensityFactor = Math.sqrt(rawLoad / (coveredHours * 100));
  if (!Number.isFinite(rawLoad) || !Number.isFinite(rawEquivalentIntensityFactor)) {
    return unavailable({
      reason: "invalid_data",
      contributingDurationSeconds: evidence.coverageSeconds,
      eligibleDurationSeconds: evidence.eligibleDurationSeconds,
    });
  }
  if (rawEquivalentIntensityFactor > 1.5) {
    return unavailable({
      reason: "intensity_out_of_range",
      contributingDurationSeconds: evidence.coverageSeconds,
      eligibleDurationSeconds: evidence.eligibleDurationSeconds,
    });
  }

  return heartRateCommonLoadCalculationResultSchema.parse({
    status: evidence.status,
    ...(evidence.status === "partial" ? { reason: "source_incomplete" } : {}),
    calculationVersion: HEART_RATE_COMMON_LOAD_CALCULATION_VERSION,
    load: Math.round(rawLoad * 100) / 100,
    equivalentIntensityFactor: Math.round(rawEquivalentIntensityFactor * 10_000) / 10_000,
    rawLoad,
    rawEquivalentIntensityFactor,
    coverageRatio,
    contributingDurationSeconds: evidence.coverageSeconds,
    eligibleDurationSeconds: evidence.eligibleDurationSeconds,
    zoneSeconds: zoneDuration.zoneSeconds,
  });
}

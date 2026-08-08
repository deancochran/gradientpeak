import { z } from "zod";

export const AEROBIC_EFFICIENCY_FACTOR_CALCULATION_VERSION = "aerobic-efficiency-factor-v1";
export const AEROBIC_DECOUPLING_CALCULATION_VERSION = "aerobic-decoupling-v1";
export const AEROBIC_ANALYSIS_POLICY_VERSION = "aerobic-analysis-qualification-v1";

export const AEROBIC_ANALYSIS_MAX_GAP_SECONDS = 5;
export const AEROBIC_EFFICIENCY_MINIMUM_DURATION_SECONDS = 600;
export const AEROBIC_DECOUPLING_MINIMUM_DURATION_SECONDS = 1_200;
export const AEROBIC_DECOUPLING_MINIMUM_HALF_DURATION_SECONDS = 600;
export const AEROBIC_ANALYSIS_MINIMUM_COVERAGE = 0.9;
export const AEROBIC_ANALYSIS_MAXIMUM_OUTPUT_COEFFICIENT_OF_VARIATION = 0.1;

const MAX_AEROBIC_ANALYSIS_SAMPLES = 1_000_000;
const MAX_AEROBIC_OUTPUT = 1_000_000;
const MAX_AEROBIC_HEART_RATE_BPM = 300;
const MAX_TIMESTAMP_SECONDS = 8_640_000_000_000;
const COMPARISON_EPSILON = 1e-12;

export const aerobicAnalysisModalitySchema = z.enum(["cycling", "running", "unsupported"]);
export const aerobicAnalysisOutputUnitSchema = z.enum([
  "watts",
  "meters_per_second",
  "unsupported",
]);
export const aerobicEfficiencyFactorUnitSchema = z.enum([
  "watts_per_bpm",
  "meters_per_second_per_bpm",
]);

export type AerobicAnalysisModality = z.infer<typeof aerobicAnalysisModalitySchema>;
export type AerobicAnalysisOutputUnit = z.infer<typeof aerobicAnalysisOutputUnitSchema>;
export type AerobicEfficiencyFactorUnit = z.infer<typeof aerobicEfficiencyFactorUnitSchema>;

function compatibleEfficiencyFactorUnit(
  modality: AerobicAnalysisModality,
  outputUnit: AerobicAnalysisOutputUnit,
): AerobicEfficiencyFactorUnit | null {
  if (modality === "cycling" && outputUnit === "watts") return "watts_per_bpm";
  if (modality === "running" && outputUnit === "meters_per_second") {
    return "meters_per_second_per_bpm";
  }
  return null;
}

/**
 * The current observation describes `(previous timestamp, current timestamp]`.
 * A null output or heart rate is missing evidence; measured zero output remains
 * distinct from missing output.
 */
export const aerobicAnalysisSampleSchema = z
  .object({
    timestampSeconds: z.number().finite().min(-MAX_TIMESTAMP_SECONDS).max(MAX_TIMESTAMP_SECONDS),
    output: z.number().finite().nonnegative().max(MAX_AEROBIC_OUTPUT).nullable(),
    heartRateBpm: z.number().finite().nonnegative().max(MAX_AEROBIC_HEART_RATE_BPM).nullable(),
    included: z.boolean().optional(),
  })
  .strict();

export type AerobicAnalysisSample = z.infer<typeof aerobicAnalysisSampleSchema>;

export interface AerobicAnalysisInput {
  readonly modality: AerobicAnalysisModality;
  readonly outputUnit: AerobicAnalysisOutputUnit;
  readonly samples: readonly AerobicAnalysisSample[];
}

const aerobicAnalysisInputSchema = z
  .object({
    modality: aerobicAnalysisModalitySchema,
    outputUnit: aerobicAnalysisOutputUnitSchema,
    samples: z.array(aerobicAnalysisSampleSchema).max(MAX_AEROBIC_ANALYSIS_SAMPLES),
  })
  .strict();

export const aerobicAnalysisUnavailableReasonSchema = z.enum([
  "invalid_input",
  "unsupported_modality",
  "unsupported_output_unit",
  "modality_mismatch",
  "no_samples",
  "missing_output",
  "missing_heart_rate",
  "zero_heart_rate",
  "no_contributing_intervals",
  "insufficient_duration",
  "insufficient_half_duration",
  "insufficient_output_coverage",
  "insufficient_heart_rate_coverage",
  "insufficient_paired_coverage",
  "zero_output",
  "unsteady_effort",
  "zero_first_half_efficiency",
]);

export type AerobicAnalysisUnavailableReason = z.infer<
  typeof aerobicAnalysisUnavailableReasonSchema
>;

export const aerobicAnalysisQualificationSchema = z
  .object({
    policyVersion: z.literal(AEROBIC_ANALYSIS_POLICY_VERSION),
    minimumContributingDurationSeconds: z.number().finite().positive(),
    minimumHalfDurationSeconds: z.number().finite().positive().nullable(),
    minimumCoverage: z.number().finite().min(0).max(1),
    maximumOutputCoefficientOfVariation: z.number().finite().nonnegative(),
    durationQualified: z.boolean(),
    firstHalfDurationQualified: z.boolean().nullable(),
    secondHalfDurationQualified: z.boolean().nullable(),
    outputCoverageQualified: z.boolean(),
    heartRateCoverageQualified: z.boolean(),
    pairedCoverageQualified: z.boolean(),
    positiveOutputQualified: z.boolean(),
    steadyEffortQualified: z.boolean(),
    qualified: z.boolean(),
  })
  .strict();

export const aerobicAnalysisDiagnosticsSchema = z
  .object({
    policyVersion: z.literal(AEROBIC_ANALYSIS_POLICY_VERSION),
    intervalConvention: z.literal("current_sample_applies_to_preceding_interval"),
    splitConvention: z.literal("cumulative_contributing_elapsed_time"),
    gapBehavior: z.literal("exclude_entire_interval_and_reset_segment"),
    missingValueBehavior: z.literal("exclude_interval_and_reset_segment"),
    inactiveBehavior: z.literal("exclude_interval_from_coverage_and_reset_segment"),
    orderingBehavior: z.literal("ignore_duplicate_or_reversed_sample"),
    zeroOutputBehavior: z.literal("measured_but_requires_positive_mean_output"),
    zeroHeartRateBehavior: z.literal("exclude_as_invalid_ratio_denominator"),
    roundingBehavior: z.literal("full_precision"),
    maxGapSeconds: z.literal(AEROBIC_ANALYSIS_MAX_GAP_SECONDS),
    sampleCount: z.number().int().nonnegative(),
    acceptedSampleCount: z.number().int().nonnegative(),
    duplicateTimestampCount: z.number().int().nonnegative(),
    reversedTimestampCount: z.number().int().nonnegative(),
    segmentCount: z.number().int().nonnegative(),
    sourceSpanSeconds: z.number().finite().nonnegative(),
    eligibleDurationSeconds: z.number().finite().nonnegative(),
    outputDurationSeconds: z.number().finite().nonnegative(),
    heartRateDurationSeconds: z.number().finite().nonnegative(),
    contributingDurationSeconds: z.number().finite().nonnegative(),
    excludedGapDurationSeconds: z.number().finite().nonnegative(),
    excludedInactiveDurationSeconds: z.number().finite().nonnegative(),
    excludedMissingOutputDurationSeconds: z.number().finite().nonnegative(),
    excludedMissingHeartRateDurationSeconds: z.number().finite().nonnegative(),
    excludedZeroHeartRateDurationSeconds: z.number().finite().nonnegative(),
    outputCoverage: z.number().finite().min(0).max(1),
    heartRateCoverage: z.number().finite().min(0).max(1),
    pairedCoverage: z.number().finite().min(0).max(1),
    averageOutput: z.number().finite().nonnegative().nullable(),
    averageHeartRateBpm: z.number().finite().positive().nullable(),
    outputCoefficientOfVariation: z.number().finite().nonnegative().nullable(),
    qualification: aerobicAnalysisQualificationSchema,
  })
  .strict();

export type AerobicAnalysisDiagnostics = z.infer<typeof aerobicAnalysisDiagnosticsSchema>;

const efficiencyIdentityShape = {
  calculationVersion: z.literal(AEROBIC_EFFICIENCY_FACTOR_CALCULATION_VERSION),
  modality: aerobicAnalysisModalitySchema,
  outputUnit: aerobicAnalysisOutputUnitSchema,
  unit: aerobicEfficiencyFactorUnitSchema.nullable(),
  diagnostics: aerobicAnalysisDiagnosticsSchema,
};

export const efficiencyFactorResultSchema = z
  .discriminatedUnion("status", [
    z
      .object({
        status: z.literal("available"),
        value: z.number().finite().nonnegative(),
        ...efficiencyIdentityShape,
      })
      .strict(),
    z
      .object({
        status: z.literal("partial"),
        value: z.number().finite().nonnegative(),
        reason: z.literal("source_incomplete"),
        ...efficiencyIdentityShape,
      })
      .strict(),
    z
      .object({
        status: z.literal("unavailable"),
        value: z.null(),
        reason: aerobicAnalysisUnavailableReasonSchema,
        ...efficiencyIdentityShape,
      })
      .strict(),
  ])
  .superRefine((result, context) => {
    const expectedUnit = compatibleEfficiencyFactorUnit(result.modality, result.outputUnit);
    if (result.unit !== expectedUnit) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: "Efficiency Factor unit must match modality and output unit identity",
      });
    }
    if (result.status !== "unavailable" && expectedUnit === null) {
      context.addIssue({
        code: "custom",
        path: ["modality"],
        message: "Numeric Efficiency Factor requires a supported modality/unit identity",
      });
    }
  });

export type EfficiencyFactorResult = z.infer<typeof efficiencyFactorResultSchema>;

/** Selects the numeric value while preserving unavailable diagnostics on the result. */
export function selectEfficiencyFactorValue(result: EfficiencyFactorResult): number | null {
  return result.status === "unavailable" ? null : result.value;
}

export const aerobicDecouplingHalfDiagnosticsSchema = z
  .object({
    contributingDurationSeconds: z.number().finite().nonnegative(),
    averageOutput: z.number().finite().nonnegative(),
    averageHeartRateBpm: z.number().finite().positive(),
    outputCoefficientOfVariation: z.number().finite().nonnegative(),
    efficiencyFactor: z.number().finite().nonnegative(),
  })
  .strict();

export const aerobicDecouplingDiagnosticsSchema = aerobicAnalysisDiagnosticsSchema
  .extend({
    targetHalfDurationSeconds: z.number().finite().nonnegative(),
    firstHalf: aerobicDecouplingHalfDiagnosticsSchema.nullable(),
    secondHalf: aerobicDecouplingHalfDiagnosticsSchema.nullable(),
  })
  .strict();

const decouplingIdentityShape = {
  calculationVersion: z.literal(AEROBIC_DECOUPLING_CALCULATION_VERSION),
  modality: aerobicAnalysisModalitySchema,
  outputUnit: aerobicAnalysisOutputUnitSchema,
  efficiencyFactorUnit: aerobicEfficiencyFactorUnitSchema.nullable(),
  unit: z.literal("ratio"),
  diagnostics: aerobicDecouplingDiagnosticsSchema,
};

export const aerobicDecouplingResultSchema = z
  .discriminatedUnion("status", [
    z
      .object({
        status: z.literal("available"),
        value: z.number().finite(),
        ...decouplingIdentityShape,
      })
      .strict(),
    z
      .object({
        status: z.literal("partial"),
        value: z.number().finite(),
        reason: z.literal("source_incomplete"),
        ...decouplingIdentityShape,
      })
      .strict(),
    z
      .object({
        status: z.literal("unavailable"),
        value: z.null(),
        reason: aerobicAnalysisUnavailableReasonSchema,
        ...decouplingIdentityShape,
      })
      .strict(),
  ])
  .superRefine((result, context) => {
    const expectedUnit = compatibleEfficiencyFactorUnit(result.modality, result.outputUnit);
    if (result.efficiencyFactorUnit !== expectedUnit) {
      context.addIssue({
        code: "custom",
        path: ["efficiencyFactorUnit"],
        message: "Decoupling EF unit must match modality and output unit identity",
      });
    }
    if (result.status !== "unavailable" && expectedUnit === null) {
      context.addIssue({
        code: "custom",
        path: ["modality"],
        message: "Numeric decoupling requires a supported modality/unit identity",
      });
    }
  });

export type AerobicDecouplingResult = z.infer<typeof aerobicDecouplingResultSchema>;

/** Selects the numeric value while preserving unavailable diagnostics on the result. */
export function selectAerobicDecouplingValue(result: AerobicDecouplingResult): number | null {
  return result.status === "unavailable" ? null : result.value;
}

export interface AerobicAnalysisAccumulatorResult {
  efficiencyFactorResult: EfficiencyFactorResult;
  aerobicDecouplingResult: AerobicDecouplingResult;
}

/** Incremental counterpart to the final timestamp-aligned aerobic calculations. */
export interface AerobicAnalysisAccumulator {
  addSample(sample: AerobicAnalysisSample): void;
  getResult(): AerobicAnalysisAccumulatorResult;
  reset(): void;
}

interface SupportedAerobicIdentity {
  modality: "cycling" | "running";
  outputUnit: "watts" | "meters_per_second";
  efficiencyFactorUnit: AerobicEfficiencyFactorUnit;
}

interface WeightedInterval {
  durationSeconds: number;
  output: number;
  heartRateBpm: number;
}

interface WeightedStatistics {
  durationSeconds: number;
  averageOutput: number;
  averageHeartRateBpm: number;
  outputCoefficientOfVariation: number;
  efficiencyFactor: number;
}

interface PreparedAerobicAnalysis {
  intervals: WeightedInterval[];
  sampleCount: number;
  acceptedSampleCount: number;
  duplicateTimestampCount: number;
  reversedTimestampCount: number;
  segmentCount: number;
  sourceSpanSeconds: number;
  eligibleDurationSeconds: number;
  outputDurationSeconds: number;
  heartRateDurationSeconds: number;
  contributingDurationSeconds: number;
  excludedGapDurationSeconds: number;
  excludedInactiveDurationSeconds: number;
  excludedMissingOutputDurationSeconds: number;
  excludedMissingHeartRateDurationSeconds: number;
  excludedZeroHeartRateDurationSeconds: number;
  outputCoverage: number;
  heartRateCoverage: number;
  pairedCoverage: number;
  statistics: WeightedStatistics | null;
  sourceIncomplete: boolean;
}

interface CompensatedAccumulator {
  sum: number;
  compensation: number;
}

function addCompensated(accumulator: CompensatedAccumulator, value: number): void {
  const adjusted = value - accumulator.compensation;
  const next = accumulator.sum + adjusted;
  accumulator.compensation = next - accumulator.sum - adjusted;
  accumulator.sum = next;
}

function calculateWeightedStatisticsFromSums(input: {
  durationSeconds: number;
  weightedOutput: number;
  weightedHeartRate: number;
  weightedOutputSquared: number;
}): WeightedStatistics | null {
  if (input.durationSeconds <= 0) return null;
  const averageOutput = input.weightedOutput / input.durationSeconds;
  const averageHeartRateBpm = input.weightedHeartRate / input.durationSeconds;
  if (averageHeartRateBpm <= 0) return null;
  const variance = Math.max(
    0,
    input.weightedOutputSquared / input.durationSeconds - averageOutput ** 2,
  );
  return {
    durationSeconds: input.durationSeconds,
    averageOutput,
    averageHeartRateBpm,
    outputCoefficientOfVariation: averageOutput > 0 ? Math.sqrt(variance) / averageOutput : 0,
    efficiencyFactor: averageOutput / averageHeartRateBpm,
  };
}

function resolveSupportedIdentity(
  input: Pick<AerobicAnalysisInput, "modality" | "outputUnit">,
):
  | { status: "supported"; identity: SupportedAerobicIdentity }
  | { status: "unsupported"; reason: AerobicAnalysisUnavailableReason } {
  if (input.modality === "unsupported") {
    return { status: "unsupported", reason: "unsupported_modality" };
  }
  if (input.outputUnit === "unsupported") {
    return { status: "unsupported", reason: "unsupported_output_unit" };
  }
  if (input.modality === "cycling" && input.outputUnit === "watts") {
    return {
      status: "supported",
      identity: {
        modality: "cycling",
        outputUnit: "watts",
        efficiencyFactorUnit: "watts_per_bpm",
      },
    };
  }
  if (input.modality === "running" && input.outputUnit === "meters_per_second") {
    return {
      status: "supported",
      identity: {
        modality: "running",
        outputUnit: "meters_per_second",
        efficiencyFactorUnit: "meters_per_second_per_bpm",
      },
    };
  }
  return { status: "unsupported", reason: "modality_mismatch" };
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function calculateWeightedStatistics(
  weightedParts: readonly WeightedInterval[],
): WeightedStatistics | null {
  const duration = { sum: 0, compensation: 0 };
  const output = { sum: 0, compensation: 0 };
  const heartRate = { sum: 0, compensation: 0 };
  const outputSquared = { sum: 0, compensation: 0 };

  for (const part of weightedParts) {
    addCompensated(duration, part.durationSeconds);
    addCompensated(output, part.output * part.durationSeconds);
    addCompensated(heartRate, part.heartRateBpm * part.durationSeconds);
    addCompensated(outputSquared, part.output ** 2 * part.durationSeconds);
  }

  return calculateWeightedStatisticsFromSums({
    durationSeconds: duration.sum,
    weightedOutput: output.sum,
    weightedHeartRate: heartRate.sum,
    weightedOutputSquared: outputSquared.sum,
  });
}

function prepareAerobicAnalysis(
  samples: readonly AerobicAnalysisSample[],
): PreparedAerobicAnalysis {
  const intervals: WeightedInterval[] = [];
  let previousTimestampSeconds: number | null = null;
  let firstAcceptedTimestampSeconds: number | null = null;
  let latestAcceptedTimestampSeconds: number | null = null;
  let acceptedSampleCount = 0;
  let duplicateTimestampCount = 0;
  let reversedTimestampCount = 0;
  let segmentCount = 0;
  let inContributingSegment = false;
  let eligibleDurationSeconds = 0;
  let outputDurationSeconds = 0;
  let heartRateDurationSeconds = 0;
  let contributingDurationSeconds = 0;
  let excludedGapDurationSeconds = 0;
  let excludedInactiveDurationSeconds = 0;
  let excludedMissingOutputDurationSeconds = 0;
  let excludedMissingHeartRateDurationSeconds = 0;
  let excludedZeroHeartRateDurationSeconds = 0;

  for (const sample of samples) {
    const previousTimestamp: number | null = previousTimestampSeconds;
    if (previousTimestamp !== null) {
      if (sample.timestampSeconds === previousTimestamp) {
        duplicateTimestampCount += 1;
        continue;
      }
      if (sample.timestampSeconds < previousTimestamp) {
        reversedTimestampCount += 1;
        continue;
      }
    }

    acceptedSampleCount += 1;
    previousTimestampSeconds = sample.timestampSeconds;
    latestAcceptedTimestampSeconds = sample.timestampSeconds;
    if (firstAcceptedTimestampSeconds === null) {
      firstAcceptedTimestampSeconds = sample.timestampSeconds;
    }
    if (previousTimestamp === null) continue;

    const intervalSeconds = sample.timestampSeconds - previousTimestamp;
    if (sample.included === false) {
      excludedInactiveDurationSeconds += intervalSeconds;
      inContributingSegment = false;
      continue;
    }

    eligibleDurationSeconds += intervalSeconds;
    const output = sample.output;
    const heartRateBpm = sample.heartRateBpm;
    const outputPresent = output !== null;
    const heartRatePresent = heartRateBpm !== null;
    const heartRateUsable = heartRateBpm !== null && heartRateBpm > 0;

    if (!outputPresent || !heartRateUsable) {
      if (outputPresent) outputDurationSeconds += intervalSeconds;
      else excludedMissingOutputDurationSeconds += intervalSeconds;

      if (!heartRatePresent) {
        excludedMissingHeartRateDurationSeconds += intervalSeconds;
      } else if (!heartRateUsable) {
        excludedZeroHeartRateDurationSeconds += intervalSeconds;
      }
      if (heartRateUsable) heartRateDurationSeconds += intervalSeconds;
      inContributingSegment = false;
      continue;
    }

    if (intervalSeconds > AEROBIC_ANALYSIS_MAX_GAP_SECONDS) {
      excludedGapDurationSeconds += intervalSeconds;
      inContributingSegment = false;
      continue;
    }

    outputDurationSeconds += intervalSeconds;
    heartRateDurationSeconds += intervalSeconds;
    contributingDurationSeconds += intervalSeconds;
    intervals.push({
      durationSeconds: intervalSeconds,
      output,
      heartRateBpm,
    });
    if (!inContributingSegment) {
      segmentCount += 1;
      inContributingSegment = true;
    }
  }

  const outputCoverage = ratio(outputDurationSeconds, eligibleDurationSeconds);
  const heartRateCoverage = ratio(heartRateDurationSeconds, eligibleDurationSeconds);
  const pairedCoverage = ratio(contributingDurationSeconds, eligibleDurationSeconds);
  return {
    intervals,
    sampleCount: samples.length,
    acceptedSampleCount,
    duplicateTimestampCount,
    reversedTimestampCount,
    segmentCount,
    sourceSpanSeconds:
      firstAcceptedTimestampSeconds === null || latestAcceptedTimestampSeconds === null
        ? 0
        : latestAcceptedTimestampSeconds - firstAcceptedTimestampSeconds,
    eligibleDurationSeconds,
    outputDurationSeconds,
    heartRateDurationSeconds,
    contributingDurationSeconds,
    excludedGapDurationSeconds,
    excludedInactiveDurationSeconds,
    excludedMissingOutputDurationSeconds,
    excludedMissingHeartRateDurationSeconds,
    excludedZeroHeartRateDurationSeconds,
    outputCoverage,
    heartRateCoverage,
    pairedCoverage,
    statistics: calculateWeightedStatistics(intervals),
    sourceIncomplete:
      excludedGapDurationSeconds > 0 ||
      excludedMissingOutputDurationSeconds > 0 ||
      excludedMissingHeartRateDurationSeconds > 0 ||
      excludedZeroHeartRateDurationSeconds > 0 ||
      duplicateTimestampCount > 0 ||
      reversedTimestampCount > 0,
  };
}

function splitContributingIntervals(
  intervals: readonly WeightedInterval[],
  targetFirstHalfDurationSeconds: number,
): { first: WeightedStatistics | null; second: WeightedStatistics | null } {
  const first: WeightedInterval[] = [];
  const second: WeightedInterval[] = [];
  let firstDurationSeconds = 0;

  for (const interval of intervals) {
    const remainingFirstDuration = Math.max(
      0,
      targetFirstHalfDurationSeconds - firstDurationSeconds,
    );
    const firstPartDuration = Math.min(interval.durationSeconds, remainingFirstDuration);
    if (firstPartDuration > 0) {
      first.push({ ...interval, durationSeconds: firstPartDuration });
      firstDurationSeconds += firstPartDuration;
    }
    const secondPartDuration = interval.durationSeconds - firstPartDuration;
    if (secondPartDuration > COMPARISON_EPSILON) {
      second.push({ ...interval, durationSeconds: secondPartDuration });
    }
  }

  return {
    first: calculateWeightedStatistics(first),
    second: calculateWeightedStatistics(second),
  };
}

function coverageQualified(value: number): boolean {
  return value + COMPARISON_EPSILON >= AEROBIC_ANALYSIS_MINIMUM_COVERAGE;
}

function variationQualified(value: number | null): boolean {
  return (
    value !== null &&
    value <= AEROBIC_ANALYSIS_MAXIMUM_OUTPUT_COEFFICIENT_OF_VARIATION + COMPARISON_EPSILON
  );
}

function createQualification(input: {
  prepared: PreparedAerobicAnalysis;
  minimumContributingDurationSeconds: number;
  minimumHalfDurationSeconds: number | null;
  firstHalf: WeightedStatistics | null;
  secondHalf: WeightedStatistics | null;
}): z.infer<typeof aerobicAnalysisQualificationSchema> {
  const durationQualified =
    input.prepared.contributingDurationSeconds + COMPARISON_EPSILON >=
    input.minimumContributingDurationSeconds;
  const firstHalfDurationQualified =
    input.minimumHalfDurationSeconds === null
      ? null
      : (input.firstHalf?.durationSeconds ?? 0) + COMPARISON_EPSILON >=
        input.minimumHalfDurationSeconds;
  const secondHalfDurationQualified =
    input.minimumHalfDurationSeconds === null
      ? null
      : (input.secondHalf?.durationSeconds ?? 0) + COMPARISON_EPSILON >=
        input.minimumHalfDurationSeconds;
  const outputCoverageQualified = coverageQualified(input.prepared.outputCoverage);
  const heartRateCoverageQualified = coverageQualified(input.prepared.heartRateCoverage);
  const pairedCoverageQualified = coverageQualified(input.prepared.pairedCoverage);
  const positiveOutputQualified = (input.prepared.statistics?.averageOutput ?? 0) > 0;
  const wholeVariationQualified = variationQualified(
    input.prepared.statistics?.outputCoefficientOfVariation ?? null,
  );
  const firstVariationQualified =
    input.minimumHalfDurationSeconds === null ||
    variationQualified(input.firstHalf?.outputCoefficientOfVariation ?? null);
  const secondVariationQualified =
    input.minimumHalfDurationSeconds === null ||
    variationQualified(input.secondHalf?.outputCoefficientOfVariation ?? null);
  const steadyEffortQualified =
    wholeVariationQualified && firstVariationQualified && secondVariationQualified;
  const halvesQualified =
    (firstHalfDurationQualified === null || firstHalfDurationQualified) &&
    (secondHalfDurationQualified === null || secondHalfDurationQualified);
  const qualified =
    durationQualified &&
    halvesQualified &&
    outputCoverageQualified &&
    heartRateCoverageQualified &&
    pairedCoverageQualified &&
    positiveOutputQualified &&
    steadyEffortQualified;

  return aerobicAnalysisQualificationSchema.parse({
    policyVersion: AEROBIC_ANALYSIS_POLICY_VERSION,
    minimumContributingDurationSeconds: input.minimumContributingDurationSeconds,
    minimumHalfDurationSeconds: input.minimumHalfDurationSeconds,
    minimumCoverage: AEROBIC_ANALYSIS_MINIMUM_COVERAGE,
    maximumOutputCoefficientOfVariation: AEROBIC_ANALYSIS_MAXIMUM_OUTPUT_COEFFICIENT_OF_VARIATION,
    durationQualified,
    firstHalfDurationQualified,
    secondHalfDurationQualified,
    outputCoverageQualified,
    heartRateCoverageQualified,
    pairedCoverageQualified,
    positiveOutputQualified,
    steadyEffortQualified,
    qualified,
  });
}

function createDiagnostics(input: {
  prepared: PreparedAerobicAnalysis;
  qualification: z.infer<typeof aerobicAnalysisQualificationSchema>;
}): AerobicAnalysisDiagnostics {
  const prepared = input.prepared;
  return aerobicAnalysisDiagnosticsSchema.parse({
    policyVersion: AEROBIC_ANALYSIS_POLICY_VERSION,
    intervalConvention: "current_sample_applies_to_preceding_interval",
    splitConvention: "cumulative_contributing_elapsed_time",
    gapBehavior: "exclude_entire_interval_and_reset_segment",
    missingValueBehavior: "exclude_interval_and_reset_segment",
    inactiveBehavior: "exclude_interval_from_coverage_and_reset_segment",
    orderingBehavior: "ignore_duplicate_or_reversed_sample",
    zeroOutputBehavior: "measured_but_requires_positive_mean_output",
    zeroHeartRateBehavior: "exclude_as_invalid_ratio_denominator",
    roundingBehavior: "full_precision",
    maxGapSeconds: AEROBIC_ANALYSIS_MAX_GAP_SECONDS,
    sampleCount: prepared.sampleCount,
    acceptedSampleCount: prepared.acceptedSampleCount,
    duplicateTimestampCount: prepared.duplicateTimestampCount,
    reversedTimestampCount: prepared.reversedTimestampCount,
    segmentCount: prepared.segmentCount,
    sourceSpanSeconds: prepared.sourceSpanSeconds,
    eligibleDurationSeconds: prepared.eligibleDurationSeconds,
    outputDurationSeconds: prepared.outputDurationSeconds,
    heartRateDurationSeconds: prepared.heartRateDurationSeconds,
    contributingDurationSeconds: prepared.contributingDurationSeconds,
    excludedGapDurationSeconds: prepared.excludedGapDurationSeconds,
    excludedInactiveDurationSeconds: prepared.excludedInactiveDurationSeconds,
    excludedMissingOutputDurationSeconds: prepared.excludedMissingOutputDurationSeconds,
    excludedMissingHeartRateDurationSeconds: prepared.excludedMissingHeartRateDurationSeconds,
    excludedZeroHeartRateDurationSeconds: prepared.excludedZeroHeartRateDurationSeconds,
    outputCoverage: prepared.outputCoverage,
    heartRateCoverage: prepared.heartRateCoverage,
    pairedCoverage: prepared.pairedCoverage,
    averageOutput: prepared.statistics?.averageOutput ?? null,
    averageHeartRateBpm: prepared.statistics?.averageHeartRateBpm ?? null,
    outputCoefficientOfVariation: prepared.statistics?.outputCoefficientOfVariation ?? null,
    qualification: input.qualification,
  });
}

function emptyPreparedAnalysis(sampleCount: number): PreparedAerobicAnalysis {
  return {
    intervals: [],
    sampleCount,
    acceptedSampleCount: 0,
    duplicateTimestampCount: 0,
    reversedTimestampCount: 0,
    segmentCount: 0,
    sourceSpanSeconds: 0,
    eligibleDurationSeconds: 0,
    outputDurationSeconds: 0,
    heartRateDurationSeconds: 0,
    contributingDurationSeconds: 0,
    excludedGapDurationSeconds: 0,
    excludedInactiveDurationSeconds: 0,
    excludedMissingOutputDurationSeconds: 0,
    excludedMissingHeartRateDurationSeconds: 0,
    excludedZeroHeartRateDurationSeconds: 0,
    outputCoverage: 0,
    heartRateCoverage: 0,
    pairedCoverage: 0,
    statistics: null,
    sourceIncomplete: false,
  };
}

function unavailableReason(
  prepared: PreparedAerobicAnalysis,
  qualification: z.infer<typeof aerobicAnalysisQualificationSchema>,
  durationReason: "insufficient_duration" | "insufficient_half_duration",
): AerobicAnalysisUnavailableReason | null {
  if (prepared.sampleCount === 0 || prepared.acceptedSampleCount === 0) return "no_samples";
  if (prepared.contributingDurationSeconds <= 0) {
    if (prepared.outputDurationSeconds <= 0 && prepared.excludedMissingOutputDurationSeconds > 0) {
      return "missing_output";
    }
    if (prepared.heartRateDurationSeconds <= 0) {
      if (prepared.excludedZeroHeartRateDurationSeconds > 0) return "zero_heart_rate";
      if (prepared.excludedMissingHeartRateDurationSeconds > 0) return "missing_heart_rate";
    }
    return "no_contributing_intervals";
  }
  if (
    !qualification.durationQualified ||
    qualification.firstHalfDurationQualified === false ||
    qualification.secondHalfDurationQualified === false
  ) {
    return durationReason;
  }
  if (!qualification.outputCoverageQualified) return "insufficient_output_coverage";
  if (!qualification.heartRateCoverageQualified) return "insufficient_heart_rate_coverage";
  if (!qualification.pairedCoverageQualified) return "insufficient_paired_coverage";
  if (!qualification.positiveOutputQualified) return "zero_output";
  if (!qualification.steadyEffortQualified) return "unsteady_effort";
  return null;
}

function unavailableEfficiencyResult(input: {
  request: AerobicAnalysisInput;
  identity: SupportedAerobicIdentity | null;
  reason: AerobicAnalysisUnavailableReason;
  prepared: PreparedAerobicAnalysis;
}): EfficiencyFactorResult {
  const qualification = createQualification({
    prepared: input.prepared,
    minimumContributingDurationSeconds: AEROBIC_EFFICIENCY_MINIMUM_DURATION_SECONDS,
    minimumHalfDurationSeconds: null,
    firstHalf: null,
    secondHalf: null,
  });
  return efficiencyFactorResultSchema.parse({
    status: "unavailable",
    value: null,
    reason: input.reason,
    calculationVersion: AEROBIC_EFFICIENCY_FACTOR_CALCULATION_VERSION,
    modality: input.request.modality,
    outputUnit: input.request.outputUnit,
    unit: input.identity?.efficiencyFactorUnit ?? null,
    diagnostics: createDiagnostics({ prepared: input.prepared, qualification }),
  });
}

function efficiencyFactorFromPrepared(input: {
  request: AerobicAnalysisInput;
  identity: SupportedAerobicIdentity;
  prepared: PreparedAerobicAnalysis;
}): EfficiencyFactorResult {
  const qualification = createQualification({
    prepared: input.prepared,
    minimumContributingDurationSeconds: AEROBIC_EFFICIENCY_MINIMUM_DURATION_SECONDS,
    minimumHalfDurationSeconds: null,
    firstHalf: null,
    secondHalf: null,
  });
  const reason = unavailableReason(input.prepared, qualification, "insufficient_duration");
  const diagnostics = createDiagnostics({ prepared: input.prepared, qualification });
  if (reason !== null || input.prepared.statistics === null) {
    return efficiencyFactorResultSchema.parse({
      status: "unavailable",
      value: null,
      reason: reason ?? "no_contributing_intervals",
      calculationVersion: AEROBIC_EFFICIENCY_FACTOR_CALCULATION_VERSION,
      modality: input.identity.modality,
      outputUnit: input.identity.outputUnit,
      unit: input.identity.efficiencyFactorUnit,
      diagnostics,
    });
  }

  const value = input.prepared.statistics.efficiencyFactor;
  return efficiencyFactorResultSchema.parse(
    input.prepared.sourceIncomplete
      ? {
          status: "partial",
          value,
          reason: "source_incomplete",
          calculationVersion: AEROBIC_EFFICIENCY_FACTOR_CALCULATION_VERSION,
          modality: input.identity.modality,
          outputUnit: input.identity.outputUnit,
          unit: input.identity.efficiencyFactorUnit,
          diagnostics,
        }
      : {
          status: "available",
          value,
          calculationVersion: AEROBIC_EFFICIENCY_FACTOR_CALCULATION_VERSION,
          modality: input.identity.modality,
          outputUnit: input.identity.outputUnit,
          unit: input.identity.efficiencyFactorUnit,
          diagnostics,
        },
  );
}

/**
 * Calculates duration-weighted aerobic Efficiency Factor from one compatible
 * timestamped output/heart-rate stream. Unavailable evidence never becomes 0.
 */
export function calculateEfficiencyFactor(input: AerobicAnalysisInput): EfficiencyFactorResult {
  const identityResult = resolveSupportedIdentity(input);
  if (identityResult.status === "unsupported") {
    return unavailableEfficiencyResult({
      request: input,
      identity: null,
      reason: identityResult.reason,
      prepared: emptyPreparedAnalysis(input.samples.length),
    });
  }
  const parsed = aerobicAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return unavailableEfficiencyResult({
      request: input,
      identity: identityResult.identity,
      reason: "invalid_input",
      prepared: emptyPreparedAnalysis(input.samples.length),
    });
  }

  return efficiencyFactorFromPrepared({
    request: input,
    identity: identityResult.identity,
    prepared: prepareAerobicAnalysis(parsed.data.samples),
  });
}

function halfDiagnostics(
  statistics: WeightedStatistics | null,
): z.infer<typeof aerobicDecouplingHalfDiagnosticsSchema> | null {
  if (statistics === null) return null;
  return aerobicDecouplingHalfDiagnosticsSchema.parse({
    contributingDurationSeconds: statistics.durationSeconds,
    averageOutput: statistics.averageOutput,
    averageHeartRateBpm: statistics.averageHeartRateBpm,
    outputCoefficientOfVariation: statistics.outputCoefficientOfVariation,
    efficiencyFactor: statistics.efficiencyFactor,
  });
}

function unavailableDecouplingResult(input: {
  request: AerobicAnalysisInput;
  identity: SupportedAerobicIdentity | null;
  reason: AerobicAnalysisUnavailableReason;
  prepared: PreparedAerobicAnalysis;
  firstHalf?: WeightedStatistics | null;
  secondHalf?: WeightedStatistics | null;
}): AerobicDecouplingResult {
  const firstHalf = input.firstHalf ?? null;
  const secondHalf = input.secondHalf ?? null;
  const qualification = createQualification({
    prepared: input.prepared,
    minimumContributingDurationSeconds: AEROBIC_DECOUPLING_MINIMUM_DURATION_SECONDS,
    minimumHalfDurationSeconds: AEROBIC_DECOUPLING_MINIMUM_HALF_DURATION_SECONDS,
    firstHalf,
    secondHalf,
  });
  const diagnostics = aerobicDecouplingDiagnosticsSchema.parse({
    ...createDiagnostics({ prepared: input.prepared, qualification }),
    targetHalfDurationSeconds: input.prepared.contributingDurationSeconds / 2,
    firstHalf: halfDiagnostics(firstHalf),
    secondHalf: halfDiagnostics(secondHalf),
  });
  return aerobicDecouplingResultSchema.parse({
    status: "unavailable",
    value: null,
    reason: input.reason,
    calculationVersion: AEROBIC_DECOUPLING_CALCULATION_VERSION,
    modality: input.request.modality,
    outputUnit: input.request.outputUnit,
    efficiencyFactorUnit: input.identity?.efficiencyFactorUnit ?? null,
    unit: "ratio",
    diagnostics,
  });
}

function aerobicDecouplingFromPrepared(input: {
  identity: SupportedAerobicIdentity;
  prepared: PreparedAerobicAnalysis;
  halves?: { first: WeightedStatistics | null; second: WeightedStatistics | null };
}): AerobicDecouplingResult {
  const targetHalfDurationSeconds = input.prepared.contributingDurationSeconds / 2;
  const halves =
    input.halves ?? splitContributingIntervals(input.prepared.intervals, targetHalfDurationSeconds);
  const qualification = createQualification({
    prepared: input.prepared,
    minimumContributingDurationSeconds: AEROBIC_DECOUPLING_MINIMUM_DURATION_SECONDS,
    minimumHalfDurationSeconds: AEROBIC_DECOUPLING_MINIMUM_HALF_DURATION_SECONDS,
    firstHalf: halves.first,
    secondHalf: halves.second,
  });
  const reason = unavailableReason(input.prepared, qualification, "insufficient_half_duration");
  const diagnostics = aerobicDecouplingDiagnosticsSchema.parse({
    ...createDiagnostics({ prepared: input.prepared, qualification }),
    targetHalfDurationSeconds,
    firstHalf: halfDiagnostics(halves.first),
    secondHalf: halfDiagnostics(halves.second),
  });
  if (reason !== null || halves.first === null || halves.second === null) {
    return aerobicDecouplingResultSchema.parse({
      status: "unavailable",
      value: null,
      reason: reason ?? "no_contributing_intervals",
      calculationVersion: AEROBIC_DECOUPLING_CALCULATION_VERSION,
      modality: input.identity.modality,
      outputUnit: input.identity.outputUnit,
      efficiencyFactorUnit: input.identity.efficiencyFactorUnit,
      unit: "ratio",
      diagnostics,
    });
  }
  if (halves.first.efficiencyFactor <= 0) {
    return aerobicDecouplingResultSchema.parse({
      status: "unavailable",
      value: null,
      reason: "zero_first_half_efficiency",
      calculationVersion: AEROBIC_DECOUPLING_CALCULATION_VERSION,
      modality: input.identity.modality,
      outputUnit: input.identity.outputUnit,
      efficiencyFactorUnit: input.identity.efficiencyFactorUnit,
      unit: "ratio",
      diagnostics,
    });
  }

  const value =
    (halves.first.efficiencyFactor - halves.second.efficiencyFactor) /
    halves.first.efficiencyFactor;
  return aerobicDecouplingResultSchema.parse(
    input.prepared.sourceIncomplete
      ? {
          status: "partial",
          value,
          reason: "source_incomplete",
          calculationVersion: AEROBIC_DECOUPLING_CALCULATION_VERSION,
          modality: input.identity.modality,
          outputUnit: input.identity.outputUnit,
          efficiencyFactorUnit: input.identity.efficiencyFactorUnit,
          unit: "ratio",
          diagnostics,
        }
      : {
          status: "available",
          value,
          calculationVersion: AEROBIC_DECOUPLING_CALCULATION_VERSION,
          modality: input.identity.modality,
          outputUnit: input.identity.outputUnit,
          efficiencyFactorUnit: input.identity.efficiencyFactorUnit,
          unit: "ratio",
          diagnostics,
        },
  );
}

/**
 * Calculates aerobic decoupling as `(EF first - EF second) / EF first`.
 * The halves contain equal cumulative contributing elapsed time, including a
 * proportional split when the midpoint falls inside a source interval.
 */
export function calculateAerobicDecoupling(input: AerobicAnalysisInput): AerobicDecouplingResult {
  const identityResult = resolveSupportedIdentity(input);
  if (identityResult.status === "unsupported") {
    return unavailableDecouplingResult({
      request: input,
      identity: null,
      reason: identityResult.reason,
      prepared: emptyPreparedAnalysis(input.samples.length),
    });
  }
  const parsed = aerobicAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return unavailableDecouplingResult({
      request: input,
      identity: identityResult.identity,
      reason: "invalid_input",
      prepared: emptyPreparedAnalysis(input.samples.length),
    });
  }

  return aerobicDecouplingFromPrepared({
    identity: identityResult.identity,
    prepared: prepareAerobicAnalysis(parsed.data.samples),
  });
}

interface CumulativeWeightedInterval extends WeightedInterval {
  cumulativeDurationSeconds: number;
  cumulativeWeightedOutput: number;
  cumulativeWeightedHeartRate: number;
  cumulativeWeightedOutputSquared: number;
}

interface IncrementalAerobicAnalysisState {
  previousTimestampSeconds: number | null;
  firstAcceptedTimestampSeconds: number | null;
  latestAcceptedTimestampSeconds: number | null;
  sampleCount: number;
  acceptedSampleCount: number;
  duplicateTimestampCount: number;
  reversedTimestampCount: number;
  segmentCount: number;
  inContributingSegment: boolean;
  eligibleDurationSeconds: number;
  outputDurationSeconds: number;
  heartRateDurationSeconds: number;
  contributingDurationSeconds: number;
  excludedGapDurationSeconds: number;
  excludedInactiveDurationSeconds: number;
  excludedMissingOutputDurationSeconds: number;
  excludedMissingHeartRateDurationSeconds: number;
  excludedZeroHeartRateDurationSeconds: number;
  invalidInput: boolean;
  duration: CompensatedAccumulator;
  weightedOutput: CompensatedAccumulator;
  weightedHeartRate: CompensatedAccumulator;
  weightedOutputSquared: CompensatedAccumulator;
  intervals: CumulativeWeightedInterval[];
}

function createIncrementalAerobicAnalysisState(): IncrementalAerobicAnalysisState {
  return {
    previousTimestampSeconds: null,
    firstAcceptedTimestampSeconds: null,
    latestAcceptedTimestampSeconds: null,
    sampleCount: 0,
    acceptedSampleCount: 0,
    duplicateTimestampCount: 0,
    reversedTimestampCount: 0,
    segmentCount: 0,
    inContributingSegment: false,
    eligibleDurationSeconds: 0,
    outputDurationSeconds: 0,
    heartRateDurationSeconds: 0,
    contributingDurationSeconds: 0,
    excludedGapDurationSeconds: 0,
    excludedInactiveDurationSeconds: 0,
    excludedMissingOutputDurationSeconds: 0,
    excludedMissingHeartRateDurationSeconds: 0,
    excludedZeroHeartRateDurationSeconds: 0,
    invalidInput: false,
    duration: { sum: 0, compensation: 0 },
    weightedOutput: { sum: 0, compensation: 0 },
    weightedHeartRate: { sum: 0, compensation: 0 },
    weightedOutputSquared: { sum: 0, compensation: 0 },
    intervals: [],
  };
}

class DefaultAerobicAnalysisAccumulator implements AerobicAnalysisAccumulator {
  private state = createIncrementalAerobicAnalysisState();
  private readonly request: AerobicAnalysisInput;

  constructor(identity: Pick<AerobicAnalysisInput, "modality" | "outputUnit">) {
    this.request = { ...identity, samples: [] };
  }

  addSample(input: AerobicAnalysisSample): void {
    this.state.sampleCount += 1;
    if (
      this.state.invalidInput ||
      this.state.sampleCount > MAX_AEROBIC_ANALYSIS_SAMPLES ||
      resolveSupportedIdentity(this.request).status === "unsupported"
    ) {
      if (this.state.sampleCount > MAX_AEROBIC_ANALYSIS_SAMPLES) this.state.invalidInput = true;
      return;
    }
    const parsed = aerobicAnalysisSampleSchema.safeParse(input);
    if (!parsed.success) {
      this.state.invalidInput = true;
      return;
    }
    const sample = parsed.data;
    const previousTimestamp = this.state.previousTimestampSeconds;
    if (previousTimestamp !== null) {
      if (sample.timestampSeconds === previousTimestamp) {
        this.state.duplicateTimestampCount += 1;
        return;
      }
      if (sample.timestampSeconds < previousTimestamp) {
        this.state.reversedTimestampCount += 1;
        return;
      }
    }

    this.state.acceptedSampleCount += 1;
    this.state.previousTimestampSeconds = sample.timestampSeconds;
    this.state.latestAcceptedTimestampSeconds = sample.timestampSeconds;
    if (this.state.firstAcceptedTimestampSeconds === null) {
      this.state.firstAcceptedTimestampSeconds = sample.timestampSeconds;
    }
    if (previousTimestamp === null) return;

    const intervalSeconds = sample.timestampSeconds - previousTimestamp;
    if (sample.included === false) {
      this.state.excludedInactiveDurationSeconds += intervalSeconds;
      this.state.inContributingSegment = false;
      return;
    }

    this.state.eligibleDurationSeconds += intervalSeconds;
    const output = sample.output;
    const heartRateBpm = sample.heartRateBpm;
    const outputPresent = output !== null;
    const heartRatePresent = heartRateBpm !== null;
    const heartRateUsable = heartRateBpm !== null && heartRateBpm > 0;
    if (!outputPresent || !heartRateUsable) {
      if (outputPresent) this.state.outputDurationSeconds += intervalSeconds;
      else this.state.excludedMissingOutputDurationSeconds += intervalSeconds;
      if (!heartRatePresent) {
        this.state.excludedMissingHeartRateDurationSeconds += intervalSeconds;
      } else if (!heartRateUsable) {
        this.state.excludedZeroHeartRateDurationSeconds += intervalSeconds;
      }
      if (heartRateUsable) this.state.heartRateDurationSeconds += intervalSeconds;
      this.state.inContributingSegment = false;
      return;
    }
    if (intervalSeconds > AEROBIC_ANALYSIS_MAX_GAP_SECONDS) {
      this.state.excludedGapDurationSeconds += intervalSeconds;
      this.state.inContributingSegment = false;
      return;
    }

    this.state.outputDurationSeconds += intervalSeconds;
    this.state.heartRateDurationSeconds += intervalSeconds;
    this.state.contributingDurationSeconds += intervalSeconds;
    addCompensated(this.state.duration, intervalSeconds);
    addCompensated(this.state.weightedOutput, output * intervalSeconds);
    addCompensated(this.state.weightedHeartRate, heartRateBpm * intervalSeconds);
    addCompensated(this.state.weightedOutputSquared, output ** 2 * intervalSeconds);
    this.state.intervals.push({
      durationSeconds: intervalSeconds,
      output,
      heartRateBpm,
      cumulativeDurationSeconds: this.state.duration.sum,
      cumulativeWeightedOutput: this.state.weightedOutput.sum,
      cumulativeWeightedHeartRate: this.state.weightedHeartRate.sum,
      cumulativeWeightedOutputSquared: this.state.weightedOutputSquared.sum,
    });
    if (!this.state.inContributingSegment) {
      this.state.segmentCount += 1;
      this.state.inContributingSegment = true;
    }
  }

  getResult(): AerobicAnalysisAccumulatorResult {
    const identityResult = resolveSupportedIdentity(this.request);
    const empty = emptyPreparedAnalysis(this.state.sampleCount);
    if (identityResult.status === "unsupported") {
      return {
        efficiencyFactorResult: unavailableEfficiencyResult({
          request: this.request,
          identity: null,
          reason: identityResult.reason,
          prepared: empty,
        }),
        aerobicDecouplingResult: unavailableDecouplingResult({
          request: this.request,
          identity: null,
          reason: identityResult.reason,
          prepared: empty,
        }),
      };
    }
    if (this.state.invalidInput) {
      return {
        efficiencyFactorResult: unavailableEfficiencyResult({
          request: this.request,
          identity: identityResult.identity,
          reason: "invalid_input",
          prepared: empty,
        }),
        aerobicDecouplingResult: unavailableDecouplingResult({
          request: this.request,
          identity: identityResult.identity,
          reason: "invalid_input",
          prepared: empty,
        }),
      };
    }

    const prepared = this.preparedAnalysis();
    return {
      efficiencyFactorResult: efficiencyFactorFromPrepared({
        request: this.request,
        identity: identityResult.identity,
        prepared,
      }),
      aerobicDecouplingResult: aerobicDecouplingFromPrepared({
        identity: identityResult.identity,
        prepared,
        halves: this.halfStatistics(),
      }),
    };
  }

  reset(): void {
    this.state = createIncrementalAerobicAnalysisState();
  }

  private preparedAnalysis(): PreparedAerobicAnalysis {
    const first = this.state.firstAcceptedTimestampSeconds;
    const latest = this.state.latestAcceptedTimestampSeconds;
    return {
      intervals: [],
      sampleCount: this.state.sampleCount,
      acceptedSampleCount: this.state.acceptedSampleCount,
      duplicateTimestampCount: this.state.duplicateTimestampCount,
      reversedTimestampCount: this.state.reversedTimestampCount,
      segmentCount: this.state.segmentCount,
      sourceSpanSeconds: first === null || latest === null ? 0 : latest - first,
      eligibleDurationSeconds: this.state.eligibleDurationSeconds,
      outputDurationSeconds: this.state.outputDurationSeconds,
      heartRateDurationSeconds: this.state.heartRateDurationSeconds,
      contributingDurationSeconds: this.state.contributingDurationSeconds,
      excludedGapDurationSeconds: this.state.excludedGapDurationSeconds,
      excludedInactiveDurationSeconds: this.state.excludedInactiveDurationSeconds,
      excludedMissingOutputDurationSeconds: this.state.excludedMissingOutputDurationSeconds,
      excludedMissingHeartRateDurationSeconds: this.state.excludedMissingHeartRateDurationSeconds,
      excludedZeroHeartRateDurationSeconds: this.state.excludedZeroHeartRateDurationSeconds,
      outputCoverage: ratio(this.state.outputDurationSeconds, this.state.eligibleDurationSeconds),
      heartRateCoverage: ratio(
        this.state.heartRateDurationSeconds,
        this.state.eligibleDurationSeconds,
      ),
      pairedCoverage: ratio(
        this.state.contributingDurationSeconds,
        this.state.eligibleDurationSeconds,
      ),
      statistics: calculateWeightedStatisticsFromSums({
        durationSeconds: this.state.duration.sum,
        weightedOutput: this.state.weightedOutput.sum,
        weightedHeartRate: this.state.weightedHeartRate.sum,
        weightedOutputSquared: this.state.weightedOutputSquared.sum,
      }),
      sourceIncomplete:
        this.state.excludedGapDurationSeconds > 0 ||
        this.state.excludedMissingOutputDurationSeconds > 0 ||
        this.state.excludedMissingHeartRateDurationSeconds > 0 ||
        this.state.excludedZeroHeartRateDurationSeconds > 0 ||
        this.state.duplicateTimestampCount > 0 ||
        this.state.reversedTimestampCount > 0,
    };
  }

  private halfStatistics(): {
    first: WeightedStatistics | null;
    second: WeightedStatistics | null;
  } {
    const targetDuration = this.state.contributingDurationSeconds / 2;
    const firstSums = this.sumsAtDuration(targetDuration);
    if (firstSums === null) return { first: null, second: null };
    return {
      first: calculateWeightedStatisticsFromSums(firstSums),
      second: calculateWeightedStatisticsFromSums({
        durationSeconds: this.state.duration.sum - firstSums.durationSeconds,
        weightedOutput: this.state.weightedOutput.sum - firstSums.weightedOutput,
        weightedHeartRate: this.state.weightedHeartRate.sum - firstSums.weightedHeartRate,
        weightedOutputSquared:
          this.state.weightedOutputSquared.sum - firstSums.weightedOutputSquared,
      }),
    };
  }

  private sumsAtDuration(targetDuration: number): {
    durationSeconds: number;
    weightedOutput: number;
    weightedHeartRate: number;
    weightedOutputSquared: number;
  } | null {
    if (targetDuration <= 0 || this.state.intervals.length === 0) return null;
    let low = 0;
    let high = this.state.intervals.length - 1;
    while (low < high) {
      const midpoint = Math.floor((low + high) / 2);
      const interval = this.state.intervals[midpoint];
      if (interval === undefined) return null;
      if (interval.cumulativeDurationSeconds < targetDuration) low = midpoint + 1;
      else high = midpoint;
    }
    const interval = this.state.intervals[low];
    if (interval === undefined) return null;
    const previous = low > 0 ? this.state.intervals[low - 1] : undefined;
    const previousDuration = previous?.cumulativeDurationSeconds ?? 0;
    const partialDuration = Math.max(
      0,
      Math.min(interval.durationSeconds, targetDuration - previousDuration),
    );
    return {
      durationSeconds: previousDuration + partialDuration,
      weightedOutput: (previous?.cumulativeWeightedOutput ?? 0) + interval.output * partialDuration,
      weightedHeartRate:
        (previous?.cumulativeWeightedHeartRate ?? 0) + interval.heartRateBpm * partialDuration,
      weightedOutputSquared:
        (previous?.cumulativeWeightedOutputSquared ?? 0) + interval.output ** 2 * partialDuration,
    };
  }
}

export function createAerobicAnalysisAccumulator(
  identity: Pick<AerobicAnalysisInput, "modality" | "outputUnit">,
): AerobicAnalysisAccumulator {
  return new DefaultAerobicAnalysisAccumulator(identity);
}

/** Compatibility name retained for callers that previously used stream input. */

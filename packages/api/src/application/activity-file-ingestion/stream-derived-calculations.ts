import { randomUUID } from "node:crypto";
import type { CanonicalActivityCategory } from "@repo/core";
import {
  type CompletedSegmentSummary,
  completedSegmentSummarySchema,
} from "@repo/core/activity-segments";
import {
  classifyActivityEffortPlausibility,
  isSupportedActivityEffortCombination,
} from "@repo/core/athlete-inputs";
import {
  ACTIVITY_FILE_LTHR_CALCULATION_VERSION,
  ACTIVITY_FILE_LTHR_EFFORT_METHOD,
  type AerobicAnalysisInput,
  type AerobicDecouplingResult,
  type BestEffortDurationResult,
  type BestEffortExtractionResult,
  type BestEffortMetric,
  type CyclingNormalizedPowerResult,
  calculateAerobicDecoupling,
  calculateCyclingNormalizedPower,
  calculateEfficiencyFactor,
  calculateGradeAdjustedSpeedSeries,
  calculateNormalizedSpeed,
  calculateRunningNormalizedGradedPace,
  detectLactateThresholdHeartRate,
  type EfficiencyFactorResult,
  extractBestEfforts,
  type RunningNormalizedGradedPaceResult,
  type RunningNormalizedGradedPaceSample,
  STANDARD_BEST_EFFORT_DURATIONS_SECONDS,
} from "@repo/core/calculations";
import type { activityEfforts } from "@repo/db";
import type { ActivityFileStreamMetadata, ActivityFileTimelineSample } from "./stream-metadata";

type NumericBestEffortResult = Extract<
  BestEffortDurationResult,
  { status: "available" | "partial" }
>;

const TIMESTAMP_COMPARISON_EPSILON_SECONDS = 0.000_001;

export interface ActivityFileStreamDerivedMetricsInput {
  activityCategory: CanonicalActivityCategory;
  distance: number;
  duration: number;
  activeDuration?: number | null;
  movingDuration?: number | null;
  includedTimeline?: readonly boolean[];
  streamMetadata: ActivityFileStreamMetadata;
}

export interface ActivityFileStreamDerivedCalculationsInput
  extends ActivityFileStreamDerivedMetricsInput {
  activityId: string;
  profileId: string;
  segmentId: string;
  activityStartedAt: Date;
  segmentStartOffsetSeconds: number;
  segmentEndOffsetSeconds: number;
  /** Bound to the accepted segment revision again at the transactional write boundary. */
  sourceArtifactId?: string;
  sourceRevision?: number;
  swimmingEvidenceContext?:
    | {
        environment: "pool";
        timingBasis: "pool_length_timing";
        poolLengthMeters: number;
      }
    | {
        environment: "open_water";
        timingBasis: "open_water_continuous_timing";
        poolLengthMeters: null;
      };
}

export interface ActivityFileStreamDerivedMetrics {
  normalizedPowerResult: CyclingNormalizedPowerResult;
  normalizedSpeed: number;
  normalizedSpeedDurationBasis: "moving" | "active" | "elapsed";
  normalizedSpeedDurationSeconds: number;
  normalizedGradedPaceResult: RunningNormalizedGradedPaceResult | null;
  efficiencyFactorResult: EfficiencyFactorResult;
  aerobicDecouplingResult: AerobicDecouplingResult;
  bestEffortExtractions: BestEffortExtractionResult[];
}

export interface ActivityFileStreamDerivedCalculations extends ActivityFileStreamDerivedMetrics {
  effortsToInsert: Array<typeof activityEfforts.$inferInsert>;
  detectedLTHR: GeneratedActivityLthrEvidence | null;
}

export interface GeneratedActivityLthrEvidence {
  valueBpm: number;
  recordedAt: Date;
  calculationVersion: string;
  provenance: {
    activity_id: string;
    segment_id: string;
    derived_from: "activity_file_best_effort" | "activity_file_lthr_field_test";
    source_series: "heart_rate";
    source_effort_calculation_version: string;
    source_effort_start_timestamp_seconds?: number;
    source_effort_end_timestamp_seconds?: number;
    source_effort_duration_seconds?: number;
    exact_window_start_timestamp_seconds: number;
    exact_window_end_timestamp_seconds: number;
    duration_seconds: number;
    window_coverage: 1;
    maximum_gap_seconds?: number;
    extraction_status: "available" | "partial";
    extraction_reason: "source_incomplete" | null;
  };
}

export function buildActivityFileDerivedSegmentSummary(input: {
  summary: CompletedSegmentSummary;
  metrics: ActivityFileStreamDerivedMetrics;
}): CompletedSegmentSummary {
  const {
    normalizedPowerResult: _previousNormalizedPowerResult,
    normalizedGradedPaceResult: _previousNormalizedGradedPaceResult,
    efficiencyFactorResult: _previousEfficiencyFactorResult,
    aerobicDecouplingResult: _previousAerobicDecouplingResult,
    bestEffortExtractions: _previousBestEffortExtractions,
    ...summary
  } = input.summary;
  return completedSegmentSummarySchema.parse({
    ...summary,
    normalizedPowerResult: input.metrics.normalizedPowerResult,
    ...(input.metrics.normalizedSpeed
      ? { normalizedSpeedMetersPerSecond: input.metrics.normalizedSpeed }
      : {}),
    ...(input.metrics.normalizedGradedPaceResult === null
      ? {}
      : {
          normalizedGradedPaceResult: input.metrics.normalizedGradedPaceResult,
        }),
    efficiencyFactorResult: input.metrics.efficiencyFactorResult,
    aerobicDecouplingResult: input.metrics.aerobicDecouplingResult,
    bestEffortExtractions: input.metrics.bestEffortExtractions,
  });
}

function assertIncludedTimeline(
  samples: readonly ActivityFileTimelineSample[],
  includedTimeline: readonly boolean[] | undefined,
): void {
  if (includedTimeline !== undefined && includedTimeline.length !== samples.length) {
    throw new Error("Activity-file inclusion flags must align with the canonical timeline");
  }
}

function inclusionAt(
  includedTimeline: readonly boolean[] | undefined,
  index: number,
): { included?: boolean } {
  const included = includedTimeline?.[index];
  return included === undefined ? {} : { included };
}

function buildRunningSamples(
  metadata: ActivityFileStreamMetadata,
  includedTimeline: readonly boolean[] | undefined,
): RunningNormalizedGradedPaceSample[] {
  assertIncludedTimeline(metadata.samples, includedTimeline);
  return metadata.samples.map((sample, index) => ({
    timestampSeconds: sample.timestampSeconds,
    speedMetersPerSecond: sample.speedMetersPerSecond,
    elevationMeters: sample.elevationMeters,
    ...inclusionAt(includedTimeline, index),
  }));
}

function extractMetricBestEfforts(input: {
  metric: BestEffortMetric;
  samples: readonly ActivityFileTimelineSample[];
  includedTimeline: readonly boolean[] | undefined;
  valueFor: (sample: ActivityFileTimelineSample) => number | null;
  unpositionedValueCount: number;
  durationsSeconds?: number[];
}): BestEffortExtractionResult {
  return extractBestEfforts({
    metric: input.metric,
    samples: input.samples.map((sample, index) => ({
      timestampSeconds: sample.timestampSeconds,
      value: input.valueFor(sample),
      ...inclusionAt(input.includedTimeline, index),
    })),
    config: {
      unpositionedValueCount: input.unpositionedValueCount,
      ...(input.durationsSeconds === undefined ? {} : { durationsSeconds: input.durationsSeconds }),
    },
  });
}

function calculateBestEffortExtractions(input: {
  activityCategory: CanonicalActivityCategory;
  metadata: ActivityFileStreamMetadata;
  includedTimeline: readonly boolean[] | undefined;
  gradeAdjustedSpeed: readonly { timestampSeconds: number; value: number | null }[];
}): BestEffortExtractionResult[] {
  const { activityCategory, metadata, includedTimeline } = input;
  const extractions: BestEffortExtractionResult[] = [];
  if (activityCategory === "bike") {
    extractions.push(
      extractMetricBestEfforts({
        metric: "power",
        samples: metadata.samples,
        includedTimeline,
        valueFor: (sample) => sample.powerWatts,
        unpositionedValueCount: metadata.unpositionedValueCounts.power,
      }),
    );
  }
  if (activityCategory === "run" || activityCategory === "swim") {
    extractions.push(
      extractMetricBestEfforts({
        metric: "speed",
        samples: metadata.samples,
        includedTimeline,
        valueFor: (sample) => sample.speedMetersPerSecond,
        unpositionedValueCount: metadata.unpositionedValueCounts.speed,
        ...(activityCategory === "swim"
          ? {
              durationsSeconds: [...STANDARD_BEST_EFFORT_DURATIONS_SECONDS, 900].sort(
                (left, right) => left - right,
              ),
            }
          : {}),
      }),
    );
  }
  if (activityCategory === "run") {
    if (input.gradeAdjustedSpeed.length !== metadata.samples.length) {
      throw new Error("Grade-adjusted speed must align with the canonical activity-file timeline");
    }
    extractions.push(
      extractBestEfforts({
        metric: "grade_adjusted_speed",
        samples: input.gradeAdjustedSpeed.map((sample, index) => ({
          timestampSeconds: sample.timestampSeconds,
          value: sample.value,
          ...inclusionAt(includedTimeline, index),
        })),
        config: {
          unpositionedValueCount:
            metadata.unpositionedValueCounts.speed + metadata.unpositionedValueCounts.elevation,
        },
      }),
    );
  }
  if (
    isSupportedActivityEffortCombination({
      activityCategory,
      effortType: "heart_rate",
    })
  ) {
    extractions.push(
      extractMetricBestEfforts({
        metric: "heart_rate",
        samples: metadata.samples,
        includedTimeline,
        valueFor: (sample) => sample.heartRateBpm,
        unpositionedValueCount: metadata.unpositionedValueCounts.heartRate,
      }),
    );
  }
  return extractions;
}

function buildAerobicAnalysisInput(input: {
  modality: "cycling" | "running";
  outputUnit: "watts" | "meters_per_second";
  metadata: ActivityFileStreamMetadata;
  outputValues: readonly (number | null)[];
  includedTimeline: readonly boolean[] | undefined;
}): AerobicAnalysisInput {
  if (input.outputValues.length !== input.metadata.samples.length) {
    throw new Error("Aerobic output values must align with the canonical timeline");
  }
  assertIncludedTimeline(input.metadata.samples, input.includedTimeline);
  return {
    modality: input.modality,
    outputUnit: input.outputUnit,
    samples: input.metadata.samples.map((sample, index) => {
      const output = input.outputValues[index];
      if (output === undefined) {
        throw new Error("Aerobic output timeline must not contain sparse entries");
      }
      return {
        timestampSeconds: sample.timestampSeconds,
        output,
        heartRateBpm: sample.heartRateBpm,
        ...inclusionAt(input.includedTimeline, index),
      };
    }),
  };
}

function resolveNormalizedSpeedDuration(input: ActivityFileStreamDerivedMetricsInput): {
  basis: "moving" | "active" | "elapsed";
  seconds: number;
} {
  if (
    input.movingDuration !== undefined &&
    input.movingDuration !== null &&
    Number.isFinite(input.movingDuration) &&
    input.movingDuration >= 0
  ) {
    return { basis: "moving", seconds: input.movingDuration };
  }
  if (
    input.activeDuration !== undefined &&
    input.activeDuration !== null &&
    Number.isFinite(input.activeDuration) &&
    input.activeDuration >= 0
  ) {
    return { basis: "active", seconds: input.activeDuration };
  }
  return {
    basis: "elapsed",
    seconds: Number.isFinite(input.duration) && input.duration >= 0 ? input.duration : 0,
  };
}

export function calculateActivityFileStreamDerivedMetrics(
  input: ActivityFileStreamDerivedMetricsInput,
): ActivityFileStreamDerivedMetrics {
  const { samples } = input.streamMetadata;
  assertIncludedTimeline(samples, input.includedTimeline);
  const normalizedPowerResult = calculateCyclingNormalizedPower({
    samples: samples.map((sample, index) => ({
      timestampSeconds: sample.timestampSeconds,
      powerWatts: sample.powerWatts,
      ...inclusionAt(input.includedTimeline, index),
    })),
  });
  const normalizedSpeedDuration = resolveNormalizedSpeedDuration(input);
  const normalizedSpeed = calculateNormalizedSpeed(input.distance, normalizedSpeedDuration.seconds);

  let normalizedGradedPaceResult: RunningNormalizedGradedPaceResult | null = null;
  let gradeAdjustedSpeed: Array<{ timestampSeconds: number; value: number | null }> = [];
  if (input.activityCategory === "run") {
    const runningSamples = buildRunningSamples(input.streamMetadata, input.includedTimeline);
    normalizedGradedPaceResult = calculateRunningNormalizedGradedPace({
      samples: runningSamples,
    });
    gradeAdjustedSpeed = calculateGradeAdjustedSpeedSeries({
      timestampsSeconds: runningSamples.map((sample) => sample.timestampSeconds),
      speedMetersPerSecond: runningSamples.map((sample) => sample.speedMetersPerSecond),
      elevationMeters: runningSamples.map((sample) => sample.elevationMeters),
      includedStream: runningSamples.map((sample) => sample.included !== false),
    }).map((sample) => ({
      timestampSeconds: sample.timestampSeconds,
      value: sample.value,
    }));
  }

  let aerobicAnalysisInput: AerobicAnalysisInput = {
    modality: "unsupported",
    outputUnit: "unsupported",
    samples: [],
  };
  if (input.activityCategory === "bike") {
    aerobicAnalysisInput = buildAerobicAnalysisInput({
      modality: "cycling",
      outputUnit: "watts",
      metadata: input.streamMetadata,
      outputValues: samples.map((sample) => sample.powerWatts),
      includedTimeline: input.includedTimeline,
    });
  } else if (input.activityCategory === "run") {
    aerobicAnalysisInput = buildAerobicAnalysisInput({
      modality: "running",
      outputUnit: "meters_per_second",
      metadata: input.streamMetadata,
      outputValues: gradeAdjustedSpeed.map((sample) => sample.value),
      includedTimeline: input.includedTimeline,
    });
  }

  return {
    normalizedPowerResult,
    normalizedSpeed,
    normalizedSpeedDurationBasis: normalizedSpeedDuration.basis,
    normalizedSpeedDurationSeconds: normalizedSpeedDuration.seconds,
    normalizedGradedPaceResult,
    efficiencyFactorResult: calculateEfficiencyFactor(aerobicAnalysisInput),
    aerobicDecouplingResult: calculateAerobicDecoupling(aerobicAnalysisInput),
    bestEffortExtractions: calculateBestEffortExtractions({
      activityCategory: input.activityCategory,
      metadata: input.streamMetadata,
      includedTimeline: input.includedTimeline,
      gradeAdjustedSpeed,
    }),
  };
}

function extractionForMetric(
  extractions: readonly BestEffortExtractionResult[],
  metric: BestEffortMetric,
): BestEffortExtractionResult | null {
  return extractions.find((extraction) => extraction.metric === metric) ?? null;
}

function selectedEffortEvidence(input: {
  activityCategory: CanonicalActivityCategory;
  extractions: readonly BestEffortExtractionResult[];
}): Array<{ extraction: BestEffortExtractionResult; result: NumericBestEffortResult }> {
  const selected: Array<{
    extraction: BestEffortExtractionResult;
    result: NumericBestEffortResult;
  }> = [];
  const addAllNumeric = (metric: BestEffortMetric): void => {
    const extraction = extractionForMetric(input.extractions, metric);
    if (extraction === null) return;
    for (const result of extraction.results) {
      if (result.status !== "unavailable") selected.push({ extraction, result });
    }
  };

  if (input.activityCategory === "bike") addAllNumeric("power");
  if (input.activityCategory === "swim") addAllNumeric("speed");
  if (input.activityCategory === "run") {
    // Persist both measurements independently. Core owns preferred/fallback
    // selection later, including every grade-adjusted rejection reason.
    addAllNumeric("grade_adjusted_speed");
    addAllNumeric("speed");
  }
  addAllNumeric("heart_rate");
  return selected;
}

function effortTypeForMetric(metric: BestEffortMetric): "power" | "speed" | "heart_rate" {
  switch (metric) {
    case "power":
      return "power";
    case "speed":
    case "grade_adjusted_speed":
      return "speed";
    case "heart_rate":
      return "heart_rate";
  }
}

function buildActivityFileBestEffortRow(
  input: ActivityFileStreamDerivedCalculationsInput,
  extraction: BestEffortExtractionResult,
  effort: NumericBestEffortResult,
  outputWindowDiagnostics: {
    coverage: number;
    maximumGapSeconds: number;
    coefficientOfVariation: number | null;
  } | null,
): typeof activityEfforts.$inferInsert {
  const activityStartedAtSeconds = input.activityStartedAt.getTime() / 1_000;
  if (!Number.isFinite(activityStartedAtSeconds)) {
    throw new Error("Activity start must be a valid instant for best-effort provenance");
  }
  const activityStartOffsetSeconds = effort.startTimestampSeconds - activityStartedAtSeconds;
  const activityEndOffsetSeconds = effort.endTimestampSeconds - activityStartedAtSeconds;
  if (
    activityStartOffsetSeconds + TIMESTAMP_COMPARISON_EPSILON_SECONDS <
      input.segmentStartOffsetSeconds ||
    activityEndOffsetSeconds > input.segmentEndOffsetSeconds + TIMESTAMP_COMPARISON_EPSILON_SECONDS
  ) {
    throw new Error("Best-effort window must remain within its owning activity segment");
  }
  const effortType = effortTypeForMetric(extraction.metric);
  const id = randomUUID();
  const sourceSeries =
    extraction.metric === "speed"
      ? input.activityCategory === "run"
        ? "raw_speed"
        : input.activityCategory === "swim"
          ? "swim_speed"
          : null
      : extraction.metric;
  if (sourceSeries === null) {
    throw new Error("Best-effort source series is incompatible with its activity category");
  }
  return {
    id,
    created_at: new Date(),
    activity_id: input.activityId,
    segment_id: input.segmentId,
    profile_id: input.profileId,
    recorded_at: new Date(effort.endTimestampSeconds * 1_000),
    activity_category: input.activityCategory,
    effort_type: effortType,
    source_series: sourceSeries,
    duration_seconds: effort.durationSeconds,
    source_artifact_id: input.sourceArtifactId ?? "00000000-0000-0000-0000-000000000000",
    source_revision: input.sourceRevision ?? 1,
    start_offset_ms: Math.round(activityStartOffsetSeconds * 1_000),
    end_offset_ms: Math.round(activityStartOffsetSeconds * 1_000) + effort.durationSeconds * 1_000,
    window_coverage: effort.windowCoverage,
    max_gap_seconds: extraction.maxGapSeconds,
    unit: extraction.unit,
    value: effort.value,
    source: "imported",
    method: "activity_file_best_effort",
    calculation_version: extraction.calculationVersion,
    provenance: {
      observation_id: id,
      activity_id: input.activityId,
      segment_id: input.segmentId,
      derived_from: "activity_file_stream",
      source_series: sourceSeries,
      interval_convention: extraction.intervalConvention,
      exact_window_start_timestamp_seconds: effort.startTimestampSeconds,
      exact_window_end_timestamp_seconds: effort.endTimestampSeconds,
      exact_window_start_offset_seconds: activityStartOffsetSeconds,
      exact_window_end_offset_seconds: activityEndOffsetSeconds,
      duration_seconds: effort.durationSeconds,
      contributing_duration_seconds: effort.contributingDurationSeconds,
      window_coverage: effort.windowCoverage,
      source_time_coverage: extraction.diagnostics.sourceTimeCoverage,
      ...(outputWindowDiagnostics === null
        ? {}
        : {
            output_window_coverage: outputWindowDiagnostics.coverage,
            maximum_gap_seconds: outputWindowDiagnostics.maximumGapSeconds,
            output_coefficient_of_variation: outputWindowDiagnostics.coefficientOfVariation,
          }),
      extraction_status: effort.status,
      extraction_reason: effort.status === "partial" ? effort.reason : null,
      persisted_start_offset_quantization: "nearest_millisecond_v1",
      calculation_version: extraction.calculationVersion,
      ...(input.activityCategory === "swim" && input.swimmingEvidenceContext
        ? {
            swimming_environment: input.swimmingEvidenceContext.environment,
            timing_basis: input.swimmingEvidenceContext.timingBasis,
            pool_length_meters: input.swimmingEvidenceContext.poolLengthMeters,
          }
        : {}),
    },
  };
}

function runningOutputWindowDiagnostics(
  extraction: BestEffortExtractionResult,
  effort: NumericBestEffortResult,
  gradeAdjustedSpeed: readonly {
    timestampSeconds: number;
    value: number | null;
    included: boolean;
  }[],
): {
  coverage: number;
  maximumGapSeconds: number;
  coefficientOfVariation: number | null;
} | null {
  if (extraction.metric !== "grade_adjusted_speed") {
    return null;
  }
  let coveredSeconds = 0;
  let weightedSum = 0;
  let weightedSquareSum = 0;
  let maximumGapSeconds = 0;
  for (let index = 1; index < gradeAdjustedSpeed.length; index += 1) {
    const previous = gradeAdjustedSpeed[index - 1];
    const current = gradeAdjustedSpeed[index];
    if (!previous || !current) continue;
    const intervalStart = Math.max(previous.timestampSeconds, effort.startTimestampSeconds);
    const intervalEnd = Math.min(current.timestampSeconds, effort.endTimestampSeconds);
    if (intervalEnd <= intervalStart) continue;
    const intervalSeconds = intervalEnd - intervalStart;
    maximumGapSeconds = Math.max(
      maximumGapSeconds,
      current.timestampSeconds - previous.timestampSeconds,
    );
    if (!current.included || current.value === null) continue;
    coveredSeconds += intervalSeconds;
    weightedSum += current.value * intervalSeconds;
    weightedSquareSum += current.value * current.value * intervalSeconds;
  }
  const coverage = coveredSeconds / effort.durationSeconds;
  const mean = coveredSeconds > 0 ? weightedSum / coveredSeconds : null;
  const variance =
    mean === null ? null : Math.max(0, weightedSquareSum / coveredSeconds - mean * mean);
  return {
    coverage,
    maximumGapSeconds,
    coefficientOfVariation:
      variance === null || mean === null || mean === 0 ? null : Math.sqrt(variance) / mean,
  };
}

function buildActivityFileBestEffortRows(
  input: ActivityFileStreamDerivedCalculationsInput,
  extractions: readonly BestEffortExtractionResult[],
): Array<typeof activityEfforts.$inferInsert> {
  const runningSamples =
    input.activityCategory === "run"
      ? buildRunningSamples(input.streamMetadata, input.includedTimeline)
      : [];
  const gradeAdjustedSpeed =
    runningSamples.length === 0
      ? []
      : calculateGradeAdjustedSpeedSeries({
          timestampsSeconds: runningSamples.map((sample) => sample.timestampSeconds),
          speedMetersPerSecond: runningSamples.map((sample) => sample.speedMetersPerSecond),
          elevationMeters: runningSamples.map((sample) => sample.elevationMeters),
          includedStream: runningSamples.map((sample) => sample.included !== false),
        }).map((sample, index) => ({
          ...sample,
          included: runningSamples[index]?.included !== false,
        }));
  return selectedEffortEvidence({
    activityCategory: input.activityCategory,
    extractions,
  })
    .filter(({ extraction, result }) => {
      const effortType = effortTypeForMetric(extraction.metric);
      if (
        input.activityCategory === "swim" &&
        effortType === "speed" &&
        input.swimmingEvidenceContext === undefined
      ) {
        // Retain the decoded stream/extraction in the segment summary, but do not
        // promote speed into canonical performance evidence without an explicit
        // pool-timing or open-water timing identity.
        return false;
      }
      return (
        isSupportedActivityEffortCombination({
          activityCategory: input.activityCategory,
          effortType,
        }) &&
        classifyActivityEffortPlausibility({
          activityCategory: input.activityCategory,
          effortType,
          durationSeconds: result.durationSeconds,
          value: result.value,
        }).classification !== "hard-invalid"
      );
    })
    .map(({ extraction, result }) =>
      buildActivityFileBestEffortRow(
        input,
        extraction,
        result,
        runningOutputWindowDiagnostics(extraction, result, gradeAdjustedSpeed),
      ),
    );
}

function buildActivityFileLthrEvidence(input: {
  calculationInput: ActivityFileStreamDerivedCalculationsInput;
  extractions: readonly BestEffortExtractionResult[];
}): {
  evidence: GeneratedActivityLthrEvidence;
  effort: typeof activityEfforts.$inferInsert;
} | null {
  const { calculationInput } = input;
  if (
    calculationInput.activityCategory !== "bike" &&
    calculationInput.activityCategory !== "run" &&
    calculationInput.activityCategory !== "swim"
  ) {
    return null;
  }
  const extraction = extractionForMetric(input.extractions, "heart_rate");
  if (extraction === null) return null;
  const samples = calculationInput.streamMetadata.samples.map((sample, index) => ({
    timestampSeconds: sample.timestampSeconds,
    value: sample.heartRateBpm,
    ...inclusionAt(calculationInput.includedTimeline, index),
  }));
  const detected = detectLactateThresholdHeartRate({ extraction, samples });
  if (detected === null) return null;

  const activityStartedAtSeconds = calculationInput.activityStartedAt.getTime() / 1_000;
  const startOffsetSeconds =
    detected.thresholdWindow.startTimestampSeconds - activityStartedAtSeconds;
  const endOffsetSeconds = detected.thresholdWindow.endTimestampSeconds - activityStartedAtSeconds;
  if (
    startOffsetSeconds + TIMESTAMP_COMPARISON_EPSILON_SECONDS <
      calculationInput.segmentStartOffsetSeconds ||
    endOffsetSeconds >
      calculationInput.segmentEndOffsetSeconds + TIMESTAMP_COMPARISON_EPSILON_SECONDS
  ) {
    throw new Error("LTHR field-test window must remain within its owning activity segment");
  }
  const id = randomUUID();
  const provenance = {
    observation_id: id,
    activity_id: calculationInput.activityId,
    segment_id: calculationInput.segmentId,
    derived_from: "activity_file_lthr_field_test" as const,
    source_series: "heart_rate" as const,
    interval_convention: extraction.intervalConvention,
    field_test_protocol: "30_minute_effort_final_20_minute_hr" as const,
    source_effort_calculation_version: detected.sourceEffortCalculationVersion,
    source_effort_start_timestamp_seconds: detected.sourceEffort.startTimestampSeconds,
    source_effort_end_timestamp_seconds: detected.sourceEffort.endTimestampSeconds,
    source_effort_duration_seconds: detected.sourceEffort.durationSeconds,
    exact_window_start_timestamp_seconds: detected.thresholdWindow.startTimestampSeconds,
    exact_window_end_timestamp_seconds: detected.thresholdWindow.endTimestampSeconds,
    exact_window_start_offset_seconds: startOffsetSeconds,
    exact_window_end_offset_seconds: endOffsetSeconds,
    duration_seconds: detected.thresholdWindow.durationSeconds,
    contributing_duration_seconds: detected.thresholdWindow.contributingDurationSeconds,
    window_coverage: detected.thresholdWindow.windowCoverage,
    maximum_gap_seconds: extraction.maxGapSeconds,
    extraction_status: detected.sourceEffort.status,
    extraction_reason:
      detected.sourceEffort.status === "partial" ? detected.sourceEffort.reason : null,
    persisted_start_offset_quantization: "nearest_millisecond_v1" as const,
    calculation_version: detected.calculationVersion,
  };
  const evidence: GeneratedActivityLthrEvidence = {
    valueBpm: detected.valueBpm,
    recordedAt: new Date(detected.thresholdWindow.endTimestampSeconds * 1_000),
    calculationVersion: detected.calculationVersion,
    provenance,
  };
  return {
    evidence,
    effort: {
      id,
      created_at: new Date(),
      activity_id: calculationInput.activityId,
      segment_id: calculationInput.segmentId,
      profile_id: calculationInput.profileId,
      recorded_at: evidence.recordedAt,
      activity_category: calculationInput.activityCategory,
      effort_type: "heart_rate",
      source_series: "heart_rate",
      duration_seconds: detected.thresholdWindow.durationSeconds,
      source_artifact_id:
        calculationInput.sourceArtifactId ?? "00000000-0000-0000-0000-000000000000",
      source_revision: calculationInput.sourceRevision ?? 1,
      start_offset_ms: Math.round(startOffsetSeconds * 1_000),
      end_offset_ms:
        Math.round(startOffsetSeconds * 1_000) + detected.thresholdWindow.durationSeconds * 1_000,
      window_coverage: detected.thresholdWindow.windowCoverage,
      max_gap_seconds: extraction.maxGapSeconds,
      unit: "bpm",
      value: detected.valueBpm,
      source: "imported",
      method: ACTIVITY_FILE_LTHR_EFFORT_METHOD,
      calculation_version: ACTIVITY_FILE_LTHR_CALCULATION_VERSION,
      provenance,
    },
  };
}

export function calculateActivityFileStreamDerivedCalculations(
  input: ActivityFileStreamDerivedCalculationsInput,
): ActivityFileStreamDerivedCalculations {
  const metrics = calculateActivityFileStreamDerivedMetrics(input);
  const bestEfforts = buildActivityFileBestEffortRows(input, metrics.bestEffortExtractions);
  const lthr = buildActivityFileLthrEvidence({
    calculationInput: input,
    extractions: metrics.bestEffortExtractions,
  });
  return {
    ...metrics,
    effortsToInsert: [...bestEfforts, ...(lthr === null ? [] : [lthr.effort])],
    detectedLTHR: lthr?.evidence ?? null,
  };
}

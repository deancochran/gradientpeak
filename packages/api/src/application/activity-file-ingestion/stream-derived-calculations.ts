import { randomUUID } from "node:crypto";
import {
  type CanonicalActivityCategory,
  SWIMMING_CSS_SOURCE_EFFORT_CALCULATION_VERSION,
  SWIMMING_CSS_SOURCE_EFFORT_METHOD,
  swimmingCssProtocolIdForActivity,
} from "@repo/core";
import {
  type CompletedSegmentSummary,
  completedSegmentSummarySchema,
} from "@repo/core/activity-segments";
import {
  classifyActivityEffortPlausibility,
  isSupportedActivityEffortCombination,
} from "@repo/core/athlete-inputs";
import {
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
  type EfficiencyFactorResult,
  extractBestEfforts,
  type RunningNormalizedGradedPaceResult,
  type RunningNormalizedGradedPaceSample,
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
}): BestEffortExtractionResult {
  return extractBestEfforts({
    metric: input.metric,
    samples: input.samples.map((sample, index) => ({
      timestampSeconds: sample.timestampSeconds,
      value: input.valueFor(sample),
      ...inclusionAt(input.includedTimeline, index),
    })),
    config: { unpositionedValueCount: input.unpositionedValueCount },
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

function numericEffort(
  extraction: BestEffortExtractionResult | null,
  durationSeconds: number,
): NumericBestEffortResult | null {
  const result = extraction?.results.find(
    (candidate) => candidate.durationSeconds === durationSeconds,
  );
  return result === undefined || result.status === "unavailable" ? null : result;
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
    const raw = extractionForMetric(input.extractions, "speed");
    const graded = extractionForMetric(input.extractions, "grade_adjusted_speed");
    if (raw !== null) {
      for (const rawResult of raw.results) {
        const gradedResult = numericEffort(graded, rawResult.durationSeconds);
        if (graded !== null && gradedResult !== null) {
          selected.push({ extraction: graded, result: gradedResult });
        } else if (rawResult.status !== "unavailable") {
          selected.push({ extraction: raw, result: rawResult });
        }
      }
    }
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
          : extraction.metric
      : extraction.metric;
  return {
    id,
    created_at: new Date(),
    activity_id: input.activityId,
    segment_id: input.segmentId,
    profile_id: input.profileId,
    recorded_at: new Date(effort.endTimestampSeconds * 1_000),
    activity_category: input.activityCategory,
    effort_type: effortType,
    duration_seconds: effort.durationSeconds,
    start_offset: Math.floor(activityStartOffsetSeconds + TIMESTAMP_COMPARISON_EPSILON_SECONDS),
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
      persisted_start_offset_quantization: "floor_seconds_v1",
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

function buildActivityFileSwimDistanceEffortRow(
  input: ActivityFileStreamDerivedCalculationsInput,
): typeof activityEfforts.$inferInsert | null {
  if (
    input.activityCategory !== "swim" ||
    (input.distance !== 400 && input.distance !== 200) ||
    input.activeDuration === null ||
    input.activeDuration === undefined ||
    !Number.isInteger(input.activeDuration) ||
    input.activeDuration <= 0 ||
    input.activeDuration > 14_400
  ) {
    return null;
  }
  const speedMetersPerSecond = input.distance / input.activeDuration;
  if (
    classifyActivityEffortPlausibility({
      activityCategory: "swim",
      effortType: "speed",
      durationSeconds: input.activeDuration,
      value: speedMetersPerSecond,
    }).classification === "hard-invalid"
  ) {
    return null;
  }
  const id = randomUUID();
  const activityStartedAtSeconds = input.activityStartedAt.getTime() / 1_000;
  if (!Number.isFinite(activityStartedAtSeconds)) {
    throw new Error("Activity start must be a valid instant for swim-distance provenance");
  }
  const context = input.swimmingEvidenceContext;
  return {
    id,
    created_at: new Date(),
    activity_id: input.activityId,
    segment_id: input.segmentId,
    profile_id: input.profileId,
    recorded_at: new Date((activityStartedAtSeconds + input.segmentEndOffsetSeconds) * 1_000),
    activity_category: "swim",
    effort_type: "speed",
    duration_seconds: input.activeDuration,
    distance_meters: input.distance,
    start_offset: Math.floor(
      input.segmentStartOffsetSeconds + TIMESTAMP_COMPARISON_EPSILON_SECONDS,
    ),
    unit: "meters_per_second",
    value: speedMetersPerSecond,
    source: "imported",
    method: SWIMMING_CSS_SOURCE_EFFORT_METHOD,
    calculation_version: SWIMMING_CSS_SOURCE_EFFORT_CALCULATION_VERSION,
    provenance: {
      observation_id: id,
      protocol_id: swimmingCssProtocolIdForActivity(input.activityId),
      protocol: "css_400m_200m",
      activity_id: input.activityId,
      segment_id: input.segmentId,
      derived_from: "activity_file_swim_segment",
      source_series: "swim_distance",
      distance_meters: input.distance,
      active_duration_seconds: input.activeDuration,
      segment_start_offset_ms: Math.round(input.segmentStartOffsetSeconds * 1_000),
      segment_end_offset_ms: Math.round(input.segmentEndOffsetSeconds * 1_000),
      environment: context?.environment ?? "unresolved",
      timing_basis: context?.timingBasis ?? "unresolved",
      pool_length_meters: context?.poolLengthMeters ?? null,
      calculation_version: SWIMMING_CSS_SOURCE_EFFORT_CALCULATION_VERSION,
    },
  };
}

export function calculateActivityFileStreamDerivedCalculations(
  input: ActivityFileStreamDerivedCalculationsInput,
): ActivityFileStreamDerivedCalculations {
  const metrics = calculateActivityFileStreamDerivedMetrics(input);
  const swimDistanceEffort = buildActivityFileSwimDistanceEffortRow(input);
  return {
    ...metrics,
    effortsToInsert: [
      ...buildActivityFileBestEffortRows(input, metrics.bestEffortExtractions),
      ...(swimDistanceEffort === null ? [] : [swimDistanceEffort]),
    ],
  };
}

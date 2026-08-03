import type {
  ActivityEffortPerformanceRow,
  AthletePerformanceModelRepository,
  HeartRateCalibrationCandidateRow,
} from "../repositories/athlete-performance-model-repository";

type Category = "bike" | "run" | "swim";

export type TestPerformanceModelOptions = {
  cyclingPlanningThresholdPowerWatts?: number | null;
  runningPlanningThresholdPaceSecondsPerKm?: number | null;
  effortReadTruncated?: boolean;
  evidenceIdOffset?: number;
  heartRateObservedAt?: Date;
  lthrBpm?: Partial<Record<Category, number>>;
  maxHrBpm?: Partial<Record<Category, number>>;
};

function uuid(index: number) {
  return `90000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

export function createTestPerformanceModelEffortRows(input: {
  athleteId: string;
  asOf: Date;
  activityCategory: "bike" | "run";
  evidenceIdOffset: number;
  target: number;
}): ActivityEffortPerformanceRow[] {
  const targetValue = input.activityCategory === "bike" ? input.target : 1_000 / input.target;
  const intercept = targetValue * 0.9;
  const modeledTwentyMinuteValue = targetValue / 0.95;
  const reserve = (modeledTwentyMinuteValue - intercept) * 1_200;
  const sourceSeries = input.activityCategory === "bike" ? "power" : "raw_speed";
  const startTimestampSeconds = input.asOf.getTime() / 1_000 - 86_400;
  return [300, 600, 900, 1_200].map((durationSeconds, index) => {
    const categoryOffset = (input.activityCategory === "bike" ? 0 : 100) + input.evidenceIdOffset;
    const id = uuid(categoryOffset + 10 + index);
    const activityId = uuid(categoryOffset + 20 + index);
    const segmentId = uuid(categoryOffset + 30 + index);
    const artifactId = uuid(categoryOffset + 40 + index);
    return {
      id,
      profile_id: input.athleteId,
      activity_id: activityId,
      segment_id: segmentId,
      recorded_at: new Date((startTimestampSeconds + durationSeconds) * 1_000),
      activity_category: input.activityCategory,
      effort_type: input.activityCategory === "bike" ? "power" : "speed",
      duration_seconds: durationSeconds,
      start_offset: 0,
      unit: input.activityCategory === "bike" ? "watts" : "meters_per_second",
      value: intercept + reserve / durationSeconds,
      source: "imported",
      method: "activity_file_best_effort",
      calculation_version: "best-effort-extraction-v1",
      provenance: {
        observation_id: id,
        activity_id: activityId,
        segment_id: segmentId,
        derived_from: "activity_file_stream",
        source_series: sourceSeries,
        interval_convention: "current_sample_applies_to_preceding_interval",
        exact_window_start_timestamp_seconds: startTimestampSeconds,
        exact_window_end_timestamp_seconds: startTimestampSeconds + durationSeconds,
        exact_window_start_offset_seconds: 0,
        exact_window_end_offset_seconds: durationSeconds,
        duration_seconds: durationSeconds,
        contributing_duration_seconds: durationSeconds,
        window_coverage: 1,
        source_time_coverage: 1,
        extraction_status: "available",
        extraction_reason: null,
        persisted_start_offset_quantization: "floor_seconds_v1",
        calculation_version: "best-effort-extraction-v1",
      },
      segment_revision: 1,
      accepted_segments_revision: 1,
      segment_role: "activity",
      segment_activity_category: input.activityCategory,
      segment_summary: {},
      segment_source_artifact_id: artifactId,
      current_artifact_id: artifactId,
      current_artifact_profile_id: input.athleteId,
      current_artifact_role: "source",
      current_artifact_is_current: true,
      artifact_owner_profile_id: input.athleteId,
      artifact_availability: "accepted",
      activity_pool_length_meters: null,
    };
  });
}

export function createTestHeartRateCalibrationRow(input: {
  athleteId: string;
  asOf: Date;
  activityCategory: Category;
  metric: "lthr" | "max_hr";
  valueBpm: number;
}): HeartRateCalibrationCandidateRow {
  const categoryOffset =
    input.activityCategory === "bike" ? 0 : input.activityCategory === "run" ? 100 : 200;
  const metricOffset = input.metric === "lthr" ? 0 : 20;
  const id = uuid(400 + categoryOffset + metricOffset);
  const activityId = uuid(401 + categoryOffset + metricOffset);
  const segmentId = uuid(402 + categoryOffset + metricOffset);
  const recordedAt = input.asOf;
  const common = {
    id,
    profile_id: input.athleteId,
    metric_type: input.metric,
    recorded_at: recordedAt,
    unit: "bpm",
    value: input.valueBpm,
    source: "derived" as const,
    reference_activity_id: activityId,
    activity_category: input.activityCategory,
  };
  return input.metric === "lthr"
    ? {
        ...common,
        method: "activity_file_lthr_detection",
        calculation_version: "activity-file-lthr-v1",
        provenance: {
          activity_id: activityId,
          segment_id: segmentId,
          derived_from: "activity_file_best_effort",
          source_series: "heart_rate",
          source_effort_calculation_version: "best-effort-extraction-v1",
          exact_window_start_timestamp_seconds: recordedAt.getTime() / 1_000 - 1_200,
          exact_window_end_timestamp_seconds: recordedAt.getTime() / 1_000,
          duration_seconds: 1_200,
          window_coverage: 1,
          extraction_status: "available",
          extraction_reason: null,
        },
      }
    : {
        ...common,
        method: "max_hr_progressive_test_v1",
        calculation_version: "max_hr_progressive_test_v1",
        provenance: {
          activity_id: activityId,
          segment_id: segmentId,
          derived_from: "progressive_max_hr_test",
          protocol: "progressive_max_hr",
          source_series: "heart_rate",
          calculation_version: "max_hr_progressive_test_v1",
        },
      };
}

/** Canonical strict repository fixture; no legacy profile-threshold rows are synthesized. */
export function createTestPerformanceModelRepository(
  options: TestPerformanceModelOptions = {},
): AthletePerformanceModelRepository {
  return {
    async readAthletePerformanceEvidenceSnapshot(input) {
      const rows = {
        bike:
          options.cyclingPlanningThresholdPowerWatts === null
            ? []
            : createTestPerformanceModelEffortRows({
                athleteId: input.athleteId,
                asOf: input.asOf,
                activityCategory: "bike",
                evidenceIdOffset: options.evidenceIdOffset ?? 0,
                target: options.cyclingPlanningThresholdPowerWatts ?? 250,
              }),
        run:
          options.runningPlanningThresholdPaceSecondsPerKm == null
            ? []
            : createTestPerformanceModelEffortRows({
                athleteId: input.athleteId,
                asOf: input.asOf,
                activityCategory: "run",
                evidenceIdOffset: options.evidenceIdOffset ?? 0,
                target: options.runningPlanningThresholdPaceSecondsPerKm,
              }),
        swim: [],
      };
      const lane = (activityCategory: Category) => ({
        rows: rows[activityCategory].filter((row) => row.activity_id !== input.excludedActivityId),
        truncated: options.effortReadTruncated ?? false,
      });
      const heartRateLane = (activityCategory: Category) => {
        const lthr = options.lthrBpm?.[activityCategory];
        const maxHr = options.maxHrBpm?.[activityCategory];
        const rows = (metric: "lthr" | "max_hr", valueBpm: number | undefined) => {
          if (valueBpm === undefined) return [];
          const row = createTestHeartRateCalibrationRow({
            athleteId: input.athleteId,
            asOf: options.heartRateObservedAt ?? new Date(input.asOf.getTime() - 86_400_000),
            activityCategory,
            metric,
            valueBpm,
          });
          return row.reference_activity_id === input.excludedActivityId ? [] : [row];
        };
        return {
          lthr: { rows: rows("lthr", lthr), truncated: false },
          maxHr: { rows: rows("max_hr", maxHr), truncated: false },
        };
      };
      return {
        effortReads: { bike: lane("bike"), run: lane("run"), swim: lane("swim") },
        swimmingCssProtocolRead: { rows: [], truncated: false },
        heartRateReads: {
          bike: heartRateLane("bike"),
          run: heartRateLane("run"),
          swim: heartRateLane("swim"),
        },
      };
    },
  };
}

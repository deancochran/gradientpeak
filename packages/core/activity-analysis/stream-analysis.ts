import { z } from "zod";
import type { ActivityStreamRecord } from "../schemas/activity_streams";
import { type CanonicalSport, canonicalSportSchema } from "../schemas/sport";

export const streamAnalysisInsufficientReasonValues = [
  "invalid_timestamps",
  "insufficient_samples",
  "threshold_missing",
  "low_coverage",
  "sport_mismatch",
] as const;

const streamAnalysisInsufficientReasonSchema = z.enum(streamAnalysisInsufficientReasonValues);

export const streamAnalysisQualitySchema = z
  .object({
    status: z.enum(["sufficient", "insufficient"]),
    reason: streamAnalysisInsufficientReasonSchema.nullable(),
    sample_count: z.number().int().nonnegative(),
    observed_span_seconds: z.number().finite().nonnegative(),
    integrated_seconds: z.number().finite().nonnegative(),
    coverage_ratio: z.number().finite().min(0).max(1),
    accepted_interval_count: z.number().int().nonnegative(),
    rejected_gap_count: z.number().int().nonnegative(),
    rejected_gap_seconds: z.number().finite().nonnegative(),
  })
  .strict();

export const streamZoneDurationSchema = z
  .object({
    zone: z.number().int().positive(),
    seconds: z.number().finite().nonnegative(),
    percentage: z.number().finite().min(0).max(100),
  })
  .strict();

export const activityStreamThresholdIdentitySchema = z
  .object({
    source: z.enum([
      "manual",
      "validated_test",
      "observed_effort",
      "provider",
      "modeled",
      "estimated",
      "unknown",
    ]),
    observed_at: z.string().datetime().nullable(),
    confidence: z.enum(["high", "medium", "low", "unknown"]),
    stale: z.boolean(),
    estimate: z.boolean(),
    calculation_version: z.string().min(1).nullable(),
  })
  .strict();

export const streamZoneDistributionSchema = z
  .object({
    quality: streamAnalysisQualitySchema,
    threshold: z.number().finite().positive().nullable(),
    threshold_identity: activityStreamThresholdIdentitySchema.nullable(),
    time_weighted_average: z.number().finite().nonnegative().nullable(),
    zones: z.array(streamZoneDurationSchema),
  })
  .strict();

export const activityStreamAnalysisSchema = z
  .object({
    version: z.literal("2"),
    sport: canonicalSportSchema,
    policy: z
      .object({
        max_accepted_gap_seconds: z.number().finite().positive(),
        minimum_coverage_ratio: z.number().finite().min(0).max(1),
      })
      .strict(),
    distributions: z
      .object({
        heart_rate: streamZoneDistributionSchema,
        power: streamZoneDistributionSchema,
        run_pace: streamZoneDistributionSchema,
        swim_pace: streamZoneDistributionSchema,
      })
      .strict(),
    heart_rate_load: z
      .object({
        value: z.number().finite().nonnegative().nullable(),
        reason: streamAnalysisInsufficientReasonSchema.nullable(),
        lthr_bpm: z.number().finite().positive().nullable(),
        calculation_version: z.literal("lthr_normalized_squared_v1"),
        max_heart_rate_bpm: z.literal(250),
      })
      .strict(),
  })
  .strict();

export type ActivityStreamAnalysis = z.infer<typeof activityStreamAnalysisSchema>;
export type StreamAnalysisQuality = z.infer<typeof streamAnalysisQualitySchema>;
export type StreamAnalysisInsufficientReason = z.infer<
  typeof streamAnalysisInsufficientReasonSchema
>;
export type ActivityStreamThresholdIdentity = z.infer<typeof activityStreamThresholdIdentitySchema>;

export type ActivityStreamThresholds = {
  lthrBySport?: Partial<Record<CanonicalSport, number | null>> | null;
  ftpWatts?: number | null;
  runThresholdSpeedMps?: number | null;
  swimThresholdSpeedMps?: number | null;
  identities?: {
    lthrBySport?: Partial<Record<CanonicalSport, ActivityStreamThresholdIdentity | null>> | null;
    ftpWatts?: ActivityStreamThresholdIdentity | null;
    runThresholdSpeedMps?: ActivityStreamThresholdIdentity | null;
    swimThresholdSpeedMps?: ActivityStreamThresholdIdentity | null;
  } | null;
};

type Interval = { seconds: number; value: number };
type TimestampResult =
  | { valid: true; timestamps: number[]; observedSpanSeconds: number }
  | { valid: false };

type DistributionInput = {
  records: ActivityStreamRecord[];
  timestamps: TimestampResult;
  value: (record: ActivityStreamRecord) => number | undefined;
  threshold: number | null;
  thresholdIdentity: ActivityStreamThresholdIdentity | null;
  zoneForRatio: (ratio: number) => number;
  zoneCount: number;
  maxAcceptedGapSeconds: number;
  minimumCoverageRatio: number;
  sportMatches: boolean;
  isValidValue?: (value: number) => boolean;
};

const MAX_PLAUSIBLE_HEART_RATE_BPM = 250 as const;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toTimestampSeconds(value: unknown): number | null {
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isFinite(milliseconds) ? milliseconds / 1000 : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const milliseconds = new Date(value).getTime();
    return Number.isFinite(milliseconds) ? milliseconds / 1000 : null;
  }
  return null;
}

function validateTimestamps(records: ActivityStreamRecord[]): TimestampResult {
  if (records.length < 2) return { valid: false };
  const timestamps: number[] = [];
  for (const record of records) {
    const timestamp = toTimestampSeconds(record.timestamp ?? record.time ?? record.startTime);
    if (timestamp === null) return { valid: false };
    const previousTimestamp = timestamps.at(-1);
    if (previousTimestamp !== undefined && timestamp <= previousTimestamp) return { valid: false };
    timestamps.push(timestamp);
  }
  const firstTimestamp = timestamps[0];
  const lastTimestamp = timestamps.at(-1);
  if (firstTimestamp === undefined || lastTimestamp === undefined) return { valid: false };
  return {
    valid: true,
    timestamps,
    observedSpanSeconds: lastTimestamp - firstTimestamp,
  };
}

function emptyQuality(
  reason: StreamAnalysisInsufficientReason,
  sampleCount: number,
): StreamAnalysisQuality {
  return {
    status: "insufficient",
    reason,
    sample_count: sampleCount,
    observed_span_seconds: 0,
    integrated_seconds: 0,
    coverage_ratio: 0,
    accepted_interval_count: 0,
    rejected_gap_count: 0,
    rejected_gap_seconds: 0,
  };
}

function unavailableDistribution(input: {
  reason: StreamAnalysisInsufficientReason;
  sampleCount: number;
  threshold: number | null;
  thresholdIdentity: ActivityStreamThresholdIdentity | null;
  quality?: StreamAnalysisQuality;
}): z.infer<typeof streamZoneDistributionSchema> {
  return {
    quality: input.quality ?? emptyQuality(input.reason, input.sampleCount),
    threshold: input.threshold,
    threshold_identity: input.thresholdIdentity,
    time_weighted_average: null,
    zones: [],
  };
}

function analyzeDistribution(
  input: DistributionInput,
): z.infer<typeof streamZoneDistributionSchema> {
  const sampleCount = input.records.filter((record) => {
    const value = input.value(record);
    return (
      value !== undefined && Number.isFinite(value) && (input.isValidValue?.(value) ?? value >= 0)
    );
  }).length;
  if (!input.sportMatches) {
    return unavailableDistribution({
      reason: "sport_mismatch",
      sampleCount,
      threshold: input.threshold,
      thresholdIdentity: input.thresholdIdentity,
    });
  }
  if (!input.timestamps.valid) {
    return unavailableDistribution({
      reason: "invalid_timestamps",
      sampleCount,
      threshold: input.threshold,
      thresholdIdentity: input.thresholdIdentity,
    });
  }
  if (sampleCount < 1 || input.timestamps.observedSpanSeconds <= 0) {
    return unavailableDistribution({
      reason: "insufficient_samples",
      sampleCount,
      threshold: input.threshold,
      thresholdIdentity: input.thresholdIdentity,
    });
  }

  const intervals: Interval[] = [];
  let rejectedGapCount = 0;
  let rejectedGapSeconds = 0;
  for (let index = 0; index < input.records.length - 1; index += 1) {
    const currentTimestamp = input.timestamps.timestamps[index];
    const nextTimestamp = input.timestamps.timestamps[index + 1];
    const record = input.records[index];
    if (currentTimestamp === undefined || nextTimestamp === undefined || record === undefined) {
      continue;
    }
    const seconds = nextTimestamp - currentTimestamp;
    if (seconds > input.maxAcceptedGapSeconds) {
      rejectedGapCount += 1;
      rejectedGapSeconds += seconds;
      continue;
    }
    const value = input.value(record);
    if (
      value !== undefined &&
      Number.isFinite(value) &&
      (input.isValidValue?.(value) ?? value >= 0)
    )
      intervals.push({ seconds, value });
  }

  const integratedSeconds = intervals.reduce((total, interval) => total + interval.seconds, 0);
  const coverageRatio = Math.min(1, integratedSeconds / input.timestamps.observedSpanSeconds);
  const baseQuality: StreamAnalysisQuality = {
    status: coverageRatio >= input.minimumCoverageRatio ? "sufficient" : "insufficient",
    reason: coverageRatio >= input.minimumCoverageRatio ? null : "low_coverage",
    sample_count: sampleCount,
    observed_span_seconds: round(input.timestamps.observedSpanSeconds),
    integrated_seconds: round(integratedSeconds),
    coverage_ratio: round(coverageRatio),
    accepted_interval_count: intervals.length,
    rejected_gap_count: rejectedGapCount,
    rejected_gap_seconds: round(rejectedGapSeconds),
  };
  if (baseQuality.status === "insufficient") {
    return unavailableDistribution({
      reason: "low_coverage",
      sampleCount,
      threshold: input.threshold,
      thresholdIdentity: input.thresholdIdentity,
      quality: baseQuality,
    });
  }
  if (input.threshold === null || !Number.isFinite(input.threshold) || input.threshold <= 0) {
    return unavailableDistribution({
      reason: "threshold_missing",
      sampleCount,
      threshold: null,
      thresholdIdentity: input.thresholdIdentity,
      quality: { ...baseQuality, status: "insufficient", reason: "threshold_missing" },
    });
  }

  const zoneSeconds = Array.from({ length: input.zoneCount }, () => 0);
  let weightedValue = 0;
  for (const interval of intervals) {
    weightedValue += interval.value * interval.seconds;
    const zone = input.zoneForRatio(interval.value / input.threshold);
    zoneSeconds[zone] = (zoneSeconds[zone] ?? 0) + interval.seconds;
  }
  return {
    quality: baseQuality,
    threshold: input.threshold,
    threshold_identity: input.thresholdIdentity,
    time_weighted_average: round(weightedValue / integratedSeconds),
    zones: zoneSeconds.map((seconds, index) => ({
      zone: index + 1,
      seconds: round(seconds),
      percentage: round((seconds / integratedSeconds) * 100),
    })),
  };
}

function heartRateZone(ratio: number): number {
  if (ratio < 0.81) return 0;
  if (ratio < 0.9) return 1;
  if (ratio < 0.94) return 2;
  if (ratio < 1) return 3;
  return 4;
}

function powerZone(ratio: number): number {
  if (ratio < 0.56) return 0;
  if (ratio < 0.76) return 1;
  if (ratio < 0.91) return 2;
  if (ratio < 1.06) return 3;
  if (ratio < 1.21) return 4;
  if (ratio < 1.51) return 5;
  return 6;
}

function paceZone(ratio: number): number {
  if (ratio < 0.8) return 0;
  if (ratio < 0.9) return 1;
  if (ratio < 0.95) return 2;
  if (ratio < 1.05) return 3;
  return 4;
}

/**
 * Integrates 100 * hours * (HR / LTHR)^2, so one hour exactly at LTHR is 100 load.
 * Samples above the explicit plausible-HR bound are capped rather than allowed to dominate load.
 */
function calculateHeartRateLoad(input: {
  records: ActivityStreamRecord[];
  timestamps: Extract<TimestampResult, { valid: true }>;
  lthr: number;
  maxAcceptedGapSeconds: number;
}): number {
  let load = 0;
  for (let index = 0; index < input.records.length - 1; index += 1) {
    const currentTimestamp = input.timestamps.timestamps[index];
    const nextTimestamp = input.timestamps.timestamps[index + 1];
    const record = input.records[index];
    if (currentTimestamp === undefined || nextTimestamp === undefined || record === undefined) {
      continue;
    }
    const seconds = nextTimestamp - currentTimestamp;
    if (seconds > input.maxAcceptedGapSeconds) continue;
    const heartRate = record.heartRate ?? record.heart_rate ?? record.heart_rate_bpm;
    if (heartRate === undefined || !Number.isFinite(heartRate) || heartRate <= 0) continue;
    const boundedHeartRate = Math.min(heartRate, MAX_PLAUSIBLE_HEART_RATE_BPM);
    load += (seconds / 3600) * 100 * (boundedHeartRate / input.lthr) ** 2;
  }
  return round(load);
}

/** Integrates each sample only until the next timestamp; the final sample receives no synthetic time. */
export function analyzeActivityStreams(input: {
  records: ActivityStreamRecord[];
  sport: CanonicalSport;
  thresholds: ActivityStreamThresholds;
  maxAcceptedGapSeconds?: number;
  minimumCoverageRatio?: number;
}): ActivityStreamAnalysis {
  const maxAcceptedGapSeconds = input.maxAcceptedGapSeconds ?? 30;
  const minimumCoverageRatio = input.minimumCoverageRatio ?? 0.8;
  const timestamps = validateTimestamps(input.records);
  const lthr = input.thresholds.lthrBySport?.[input.sport] ?? null;
  const common = {
    records: input.records,
    timestamps,
    maxAcceptedGapSeconds,
    minimumCoverageRatio,
  };
  const heartRate = analyzeDistribution({
    ...common,
    value: (record) => record.heartRate ?? record.heart_rate ?? record.heart_rate_bpm,
    threshold: lthr,
    thresholdIdentity: input.thresholds.identities?.lthrBySport?.[input.sport] ?? null,
    zoneForRatio: heartRateZone,
    zoneCount: 5,
    sportMatches: true,
    isValidValue: (value) => value > 0,
  });
  const power = analyzeDistribution({
    ...common,
    value: (record) => record.power,
    threshold: input.thresholds.ftpWatts ?? null,
    thresholdIdentity: input.thresholds.identities?.ftpWatts ?? null,
    zoneForRatio: powerZone,
    zoneCount: 7,
    sportMatches: input.sport === "bike",
  });
  const runPace = analyzeDistribution({
    ...common,
    value: (record) => record.speed,
    threshold: input.thresholds.runThresholdSpeedMps ?? null,
    thresholdIdentity: input.thresholds.identities?.runThresholdSpeedMps ?? null,
    zoneForRatio: paceZone,
    zoneCount: 5,
    sportMatches: input.sport === "run",
  });
  const swimPace = analyzeDistribution({
    ...common,
    value: (record) => record.speed,
    threshold: input.thresholds.swimThresholdSpeedMps ?? null,
    thresholdIdentity: input.thresholds.identities?.swimThresholdSpeedMps ?? null,
    zoneForRatio: paceZone,
    zoneCount: 5,
    sportMatches: input.sport === "swim",
  });
  const heartRateLoad =
    heartRate.quality.status === "sufficient" && heartRate.threshold !== null && timestamps.valid
      ? calculateHeartRateLoad({
          records: input.records,
          timestamps,
          lthr: heartRate.threshold,
          maxAcceptedGapSeconds,
        })
      : null;

  return activityStreamAnalysisSchema.parse({
    version: "2",
    sport: input.sport,
    policy: {
      max_accepted_gap_seconds: maxAcceptedGapSeconds,
      minimum_coverage_ratio: minimumCoverageRatio,
    },
    distributions: { heart_rate: heartRate, power, run_pace: runPace, swim_pace: swimPace },
    heart_rate_load: {
      value: heartRateLoad,
      reason: heartRateLoad === null ? heartRate.quality.reason : null,
      lthr_bpm: lthr,
      calculation_version: "lthr_normalized_squared_v1",
      max_heart_rate_bpm: MAX_PLAUSIBLE_HEART_RATE_BPM,
    },
  });
}

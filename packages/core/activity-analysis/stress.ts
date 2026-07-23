import { z } from "zod";
import type { AggregatedStream } from "../calculations";
import { calculateHRZones, calculatePowerZones } from "../calculations";
import {
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadMethod,
  type CommonLoadResult,
  type CommonThresholdEvidence,
  calculateAvailableCommonLoad,
  commonLoadResultSchema,
  commonThresholdEvidenceSchema,
} from "../load/common-relative-load";
import { calculateHeartRateZoneStress } from "../load/heart-rate-zone-stress";
import { calculateTrainingTSS, getTrainingIntensityZone } from "../load/tss";
import { type CanonicalSport, canonicalSportValues } from "../schemas/sport";
import { type ActivityTssMethod, completedActivityCalculationPolicy } from "./calculation-policy";
import {
  type ActivityCalibrationQuality,
  activityCalibrationQualitySchema,
} from "./calibration-quality";
import type {
  ActivityDerivedMetrics,
  ActivityStressUnavailableReason,
  ActivityZoneEntry,
  CurrentActivityTssIdentity,
} from "./contracts";

export type ActivityAnalysisContext = {
  profileMetrics: {
    ftp?: number | null;
    cycling_power_watts?: number | null;
    cycling_power_method?: "power_threshold" | "critical_power_threshold" | null;
    lthr?: number | null;
    lthr_by_sport?: Partial<Record<CanonicalSport, number | null>> | null;
    max_hr?: number | null;
    resting_hr?: number | null;
    weight_kg?: number | null;
    threshold_speed_mps?: number | null;
    swim_threshold_speed_mps?: number | null;
  };
  calibrationQuality?: {
    ftp?: ActivityCalibrationQuality | null;
    cyclingPower?: ActivityCalibrationQuality | null;
    runThreshold?: ActivityCalibrationQuality | null;
    swimThreshold?: ActivityCalibrationQuality | null;
    lthr?: ActivityCalibrationQuality | null;
    lthrBySport?: Partial<Record<CanonicalSport, ActivityCalibrationQuality | null>> | null;
  };
  recentEfforts: Array<{
    recorded_at: string;
    effort_type: "power" | "speed";
    duration_seconds: number;
    value: number;
    unit?: string | null;
    activity_category?: string | null;
  }>;
  profile: {
    dob?: string | null;
    gender?: "male" | "female" | "other" | null;
  };
};

export type ActivitySummaryForAnalysis = {
  id: string;
  type: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  moving_seconds?: number | null;
  distance_meters?: number | null;
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  avg_power?: number | null;
  max_power?: number | null;
  avg_speed_mps?: number | null;
  max_speed_mps?: number | null;
  normalized_power?: number | null;
  normalized_speed_mps?: number | null;
  normalized_graded_speed_mps?: number | null;
};

export type ActivityAnalysisStreams = {
  heart_rate?: AggregatedStream | null;
  power?: AggregatedStream | null;
  speed?: AggregatedStream | null;
};

export const activityHeartRateDistributionSchema = z
  .object({
    coverageSeconds: z.number().int().positive(),
    buckets: z
      .array(
        z
          .object({
            bpm: z.number().int().min(30).max(250),
            seconds: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(221),
  })
  .strict()
  .superRefine((distribution, context) => {
    if (new Set(distribution.buckets.map(({ bpm }) => bpm)).size !== distribution.buckets.length) {
      context.addIssue({ code: "custom", path: ["buckets"], message: "HR buckets must be unique" });
    }
    if (
      distribution.buckets.reduce((sum, bucket) => sum + bucket.seconds, 0) !==
      distribution.coverageSeconds
    ) {
      context.addIssue({
        code: "custom",
        path: ["coverageSeconds"],
        message: "HR coverage must equal the sum of bucket durations",
      });
    }
  });

export type ActivityHeartRateDistribution = z.infer<typeof activityHeartRateDistributionSchema>;

type AnalyzeActivityDerivedMetricsInput = {
  activity: ActivitySummaryForAnalysis;
  context: ActivityAnalysisContext;
  /** Instant at which this projection was calculated; activity evidence remains resolved at started_at. */
  computedAsOf?: string;
  streams?: ActivityAnalysisStreams | null;
  heartRateDistribution?: ActivityHeartRateDistribution | null;
};

const HR_ZONE_LABELS = [
  "Zone 1 (Recovery)",
  "Zone 2 (Endurance)",
  "Zone 3 (Tempo)",
  "Zone 4 (Threshold)",
  "Zone 5 (VO2 Max)",
] as const;

const POWER_ZONE_LABELS = [
  "Zone 1 (Active Recovery)",
  "Zone 2 (Endurance)",
  "Zone 3 (Tempo)",
  "Zone 4 (Threshold)",
  "Zone 5 (VO2 Max)",
  "Zone 6 (Anaerobic)",
  "Zone 7 (Neuromuscular)",
] as const;

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function toZoneEntries(
  values: Record<string, number | undefined>,
  labels: readonly string[],
): ActivityZoneEntry[] {
  return labels
    .map((label, index) => ({
      zone: index + 1,
      seconds: Math.max(0, Math.round(values[`zone${index + 1}`] ?? 0)),
      label,
    }))
    .filter((entry) => entry.seconds > 0);
}

function resolveIntensityFactor(input: {
  normalizedPower?: number | null;
  avgPower?: number | null;
  ftp?: number | null;
}): number | null {
  const { normalizedPower, avgPower, ftp } = input;
  if (!ftp) return null;
  const referencePower = [normalizedPower, avgPower].find(
    (value): value is number => value != null && Number.isFinite(value) && value > 0,
  );
  if (referencePower === undefined) return null;

  return referencePower / ftp;
}

function resolveHeartRateThresholdIntensityFactor(input: {
  avgHeartRate?: number | null;
  lthr?: number | null;
}): number | null {
  const { avgHeartRate, lthr } = input;
  if (!avgHeartRate || !lthr) {
    return null;
  }

  return Math.max(0, Math.min(1.5, avgHeartRate / lthr));
}

function resolvePaceIntensityFactor(input: {
  normalizedSpeed?: number | null;
  normalizedGradedSpeed?: number | null;
  avgSpeed?: number | null;
  thresholdSpeedMps?: number | null;
}): number | null {
  const { normalizedSpeed, normalizedGradedSpeed, avgSpeed, thresholdSpeedMps } = input;
  if (!thresholdSpeedMps || thresholdSpeedMps <= 0) {
    return null;
  }

  const referenceSpeed = [normalizedGradedSpeed, normalizedSpeed, avgSpeed].find(
    (value): value is number => value != null && Number.isFinite(value) && value > 0,
  );
  if (referenceSpeed === undefined) {
    return null;
  }

  return referenceSpeed / thresholdSpeedMps;
}

type ResolvedTssMethod = {
  method: ActivityTssMethod;
  intensityFactor: number;
  rawIntensityFactor: number;
  calibration: CurrentActivityTssIdentity["calibration"];
  calibrationQuality: ActivityCalibrationQuality | null;
};

type TssMethodResolution =
  | { status: "resolved"; value: ResolvedTssMethod }
  | { status: "invalid_data" | "activity_data_missing" | "threshold_missing" };

function resolveLthrCalibration(
  context: ActivityAnalysisContext,
  sport: CanonicalSport,
): { value: number | null; quality: ActivityCalibrationQuality | null } {
  const sportSpecificValue = context.profileMetrics.lthr_by_sport?.[sport];
  if (sportSpecificValue != null) {
    return {
      value: sportSpecificValue,
      quality: context.calibrationQuality?.lthrBySport?.[sport] ?? null,
    };
  }
  return {
    value: context.profileMetrics.lthr ?? null,
    quality: context.calibrationQuality?.lthr ?? null,
  };
}

function resolveMeasurement(
  values: Array<number | null | undefined>,
  isInvalid: (value: number | null | undefined) => boolean,
): { value: number | null; hasInvalid: boolean } {
  const value = values.find(
    (candidate): candidate is number => candidate != null && !isInvalid(candidate),
  );
  return {
    value: value ?? null,
    hasInvalid: values.some(isInvalid),
  };
}

function unresolvedMethod(input: {
  threshold: number | null | undefined;
  thresholdIsInvalid: boolean;
  measurement: { value: number | null; hasInvalid: boolean };
}): Exclude<TssMethodResolution, { status: "resolved" }> | null {
  const { threshold, thresholdIsInvalid, measurement } = input;
  if (thresholdIsInvalid || (measurement.value === null && measurement.hasInvalid)) {
    return { status: "invalid_data" };
  }
  if (threshold == null) return { status: "threshold_missing" };
  if (measurement.value === null) return { status: "activity_data_missing" };
  return null;
}

function resolveTssMethod(input: {
  method: ActivityTssMethod;
  sport: CanonicalSport;
  activity: ActivitySummaryForAnalysis;
  context: ActivityAnalysisContext;
}): TssMethodResolution {
  const { method, sport, activity, context } = input;
  const { profileMetrics } = context;

  switch (method) {
    case "power_threshold": {
      const usesCyclingPower = profileMetrics.cycling_power_method === "power_threshold";
      const ftp = usesCyclingPower
        ? (profileMetrics.cycling_power_watts ?? null)
        : (profileMetrics.ftp ?? null);
      const calibrationQuality = usesCyclingPower
        ? (context.calibrationQuality?.cyclingPower ?? null)
        : (context.calibrationQuality?.ftp ?? null);
      const measurement = resolveMeasurement(
        [activity.normalized_power, activity.avg_power],
        isInvalidPositiveValue,
      );
      const unavailable = unresolvedMethod({
        threshold: ftp,
        thresholdIsInvalid: isInvalidPositiveValue(ftp),
        measurement,
      });
      if (unavailable) return unavailable;
      const intensityFactor = resolveIntensityFactor({
        normalizedPower: measurement.value,
        ftp,
      });
      return intensityFactor !== null && typeof ftp === "number"
        ? {
            status: "resolved",
            value: {
              method,
              intensityFactor: Math.max(0, Math.min(1.5, intensityFactor)),
              rawIntensityFactor: intensityFactor,
              calibration: { type: "ftp_watts", value: ftp },
              calibrationQuality,
            },
          }
        : { status: "invalid_data" };
    }
    case "critical_power_threshold": {
      const criticalPower =
        profileMetrics.cycling_power_method === "critical_power_threshold"
          ? (profileMetrics.cycling_power_watts ?? null)
          : null;
      const measurement = resolveMeasurement(
        [activity.normalized_power, activity.avg_power],
        isInvalidPositiveValue,
      );
      const unavailable = unresolvedMethod({
        threshold: criticalPower,
        thresholdIsInvalid: isInvalidPositiveValue(criticalPower),
        measurement,
      });
      if (unavailable) return unavailable;
      const intensityFactor = resolveIntensityFactor({
        normalizedPower: measurement.value,
        ftp: criticalPower,
      });
      return intensityFactor !== null && typeof criticalPower === "number"
        ? {
            status: "resolved",
            value: {
              method,
              intensityFactor: Math.max(0, Math.min(1.5, intensityFactor)),
              rawIntensityFactor: intensityFactor,
              calibration: { type: "critical_power_watts", value: criticalPower },
              calibrationQuality: context.calibrationQuality?.cyclingPower ?? null,
            },
          }
        : { status: "invalid_data" };
    }
    case "run_pace_threshold": {
      const thresholdSpeedMps = profileMetrics.threshold_speed_mps ?? null;
      const measurement = resolveMeasurement(
        [
          activity.normalized_graded_speed_mps,
          activity.normalized_speed_mps,
          activity.avg_speed_mps,
        ],
        isInvalidPositiveValue,
      );
      const unavailable = unresolvedMethod({
        threshold: thresholdSpeedMps,
        thresholdIsInvalid: isInvalidPositiveValue(thresholdSpeedMps),
        measurement,
      });
      if (unavailable) return unavailable;
      const intensityFactor = resolvePaceIntensityFactor({
        normalizedSpeed: measurement.value,
        thresholdSpeedMps,
      });
      return intensityFactor !== null && typeof thresholdSpeedMps === "number"
        ? {
            status: "resolved",
            value: {
              method,
              intensityFactor: Math.max(0, Math.min(1.5, intensityFactor)),
              rawIntensityFactor: intensityFactor,
              calibration: {
                type: "threshold_speed_mps",
                value: thresholdSpeedMps,
              },
              calibrationQuality: context.calibrationQuality?.runThreshold ?? null,
            },
          }
        : { status: "invalid_data" };
    }
    case "swim_pace_threshold": {
      const thresholdSpeedMps = profileMetrics.swim_threshold_speed_mps ?? null;
      // Normalized swim speed is not yet validated strongly enough to reduce intensity.
      // Conservatively use the greater valid value so it cannot understate average-speed load.
      const swimSpeeds = [activity.normalized_speed_mps, activity.avg_speed_mps].filter(
        (value): value is number => !isInvalidPositiveValue(value) && value != null,
      );
      const measurement = {
        value: swimSpeeds.length > 0 ? Math.max(...swimSpeeds) : null,
        hasInvalid: [activity.normalized_speed_mps, activity.avg_speed_mps].some(
          isInvalidPositiveValue,
        ),
      };
      const unavailable = unresolvedMethod({
        threshold: thresholdSpeedMps,
        thresholdIsInvalid: isInvalidPositiveValue(thresholdSpeedMps),
        measurement,
      });
      if (unavailable) return unavailable;
      const intensityFactor = resolvePaceIntensityFactor({
        normalizedSpeed: measurement.value,
        thresholdSpeedMps,
      });
      return intensityFactor !== null && typeof thresholdSpeedMps === "number"
        ? {
            status: "resolved",
            value: {
              method,
              intensityFactor: Math.max(0, Math.min(1.5, intensityFactor)),
              rawIntensityFactor: intensityFactor,
              calibration: {
                type: "swim_threshold_speed_mps",
                value: thresholdSpeedMps,
              },
              calibrationQuality: context.calibrationQuality?.swimThreshold ?? null,
            },
          }
        : { status: "invalid_data" };
    }
    case "heart_rate_threshold": {
      const lthrCalibration = resolveLthrCalibration(context, sport);
      const lthr = lthrCalibration.value;
      const measurement = resolveMeasurement([activity.avg_heart_rate], isInvalidHeartRate);
      const unavailable = unresolvedMethod({
        threshold: lthr,
        thresholdIsInvalid: isInvalidLthr(lthr),
        measurement,
      });
      if (unavailable) return unavailable;
      const intensityFactor = resolveHeartRateThresholdIntensityFactor({
        avgHeartRate: measurement.value,
        lthr,
      });
      return intensityFactor !== null && typeof lthr === "number"
        ? {
            status: "resolved",
            value: {
              method,
              intensityFactor,
              rawIntensityFactor: intensityFactor,
              calibration: { type: "lthr_bpm", value: lthr },
              calibrationQuality: lthrCalibration.quality,
            },
          }
        : { status: "invalid_data" };
    }
  }
}

function isInvalidPositiveValue(value: number | null | undefined): boolean {
  return value != null && (!Number.isFinite(value) || value <= 0);
}

function isInvalidHeartRate(value: number | null | undefined): boolean {
  return value != null && (!Number.isFinite(value) || value < 30 || value > 250);
}

function isInvalidLthr(value: number | null | undefined): boolean {
  return value != null && (!Number.isFinite(value) || value < 80 || value > 220);
}

function resolveEligibleDurationSeconds(activity: ActivitySummaryForAnalysis): number | null {
  const movingSeconds = activity.moving_seconds;
  if (movingSeconds == null) return activity.duration_seconds;
  return Number.isFinite(movingSeconds) &&
    movingSeconds > 0 &&
    movingSeconds <= activity.duration_seconds
    ? movingSeconds
    : null;
}

function resolveTssSelection(input: {
  activity: ActivitySummaryForAnalysis;
  context: ActivityAnalysisContext;
  sport: CanonicalSport | undefined;
}): { resolved: ResolvedTssMethod | null; reason: ActivityStressUnavailableReason } {
  const { activity, context, sport } = input;
  if (!Number.isFinite(activity.duration_seconds) || activity.duration_seconds <= 0) {
    return { resolved: null, reason: "invalid_data" };
  }

  if (!sport) {
    const suppliedMeasurements = [
      activity.normalized_power,
      activity.avg_power,
      activity.normalized_graded_speed_mps,
      activity.normalized_speed_mps,
      activity.avg_speed_mps,
    ];
    return {
      resolved: null,
      reason:
        suppliedMeasurements.some(isInvalidPositiveValue) ||
        isInvalidHeartRate(activity.avg_heart_rate)
          ? "invalid_data"
          : "activity_data_missing",
    };
  }

  const policyMethods = completedActivityCalculationPolicy[sport].tssMethods;
  const methods =
    sport === "bike" && context.profileMetrics.cycling_power_method
      ? ([context.profileMetrics.cycling_power_method, "heart_rate_threshold"] as const)
      : policyMethods;
  const resolutions = methods.map((method) =>
    resolveTssMethod({ method, sport, activity, context }),
  );
  const resolved = resolutions.find(
    (resolution): resolution is Extract<TssMethodResolution, { status: "resolved" }> =>
      resolution.status === "resolved",
  );
  if (resolved) return { resolved: resolved.value, reason: "threshold_missing" };
  if (resolutions.some((resolution) => resolution.status === "invalid_data")) {
    return { resolved: null, reason: "invalid_data" };
  }
  if (resolutions.some((resolution) => resolution.status === "activity_data_missing")) {
    return { resolved: null, reason: "activity_data_missing" };
  }
  return { resolved: null, reason: "threshold_missing" };
}

function resolveTrainingEffect(
  intensityFactor: number | null,
): ActivityDerivedMetrics["stress"]["training_effect"] {
  if (intensityFactor === null) return null;

  const zone = getTrainingIntensityZone(intensityFactor);
  switch (zone) {
    case "recovery":
      return "recovery";
    case "endurance":
      return "base";
    case "tempo":
      return "tempo";
    case "threshold":
      return "threshold";
    default:
      return "vo2max";
  }
}

function resolveTrimp(input: {
  avgHeartRate?: number | null;
  durationSeconds: number;
  maxHr?: number | null;
  restingHr?: number | null;
}): number | null {
  const { avgHeartRate, durationSeconds, maxHr, restingHr } = input;
  if (!avgHeartRate || !maxHr || !restingHr || maxHr <= restingHr) {
    return null;
  }

  const hrReserveRatio = (avgHeartRate - restingHr) / (maxHr - restingHr);
  if (!Number.isFinite(hrReserveRatio) || hrReserveRatio <= 0) {
    return null;
  }

  const durationMinutes = durationSeconds / 60;
  const trimp = durationMinutes * hrReserveRatio * 0.64 * Math.exp(1.92 * hrReserveRatio);
  return Number.isFinite(trimp) ? Math.round(trimp) : null;
}

type CompleteCommonProvenance = {
  quality: ActivityCalibrationQuality;
  thresholdEvidence: CommonThresholdEvidence;
  evidenceFingerprint: string;
  computedAsOf: string;
};

function unavailableCommonLoad(input: {
  sport: CanonicalSport;
  computedAsOf: string;
  contributingDurationSeconds: number | null;
  reason: Extract<CommonLoadResult, { status: "unavailable" }>["reason"];
  method?: CommonLoadMethod | null;
  provenance?: CompleteCommonProvenance | null;
}): CommonLoadResult {
  const provenance = input.provenance ?? null;
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sport: input.sport,
    method: input.method ?? null,
    quality: provenance?.quality ?? null,
    thresholdEvidence: provenance?.thresholdEvidence ?? null,
    evidenceFingerprint: provenance?.evidenceFingerprint ?? null,
    computedAsOf: input.computedAsOf,
    contributingDurationSeconds: input.contributingDurationSeconds,
    reason: input.reason,
  });
}

function completeCommonProvenance(input: {
  quality: ActivityCalibrationQuality | null;
  calibration: CurrentActivityTssIdentity["calibration"];
  computedAsOf: string;
}): CompleteCommonProvenance | null {
  const qualityResult = activityCalibrationQualitySchema.safeParse(input.quality);
  if (!qualityResult.success) return null;
  const quality = qualityResult.data;
  const rfc3339Schema = z.string().datetime({ offset: true });
  const observedAtResult = rfc3339Schema.safeParse(quality.observed_at);
  const validAtResult = rfc3339Schema.safeParse(quality.valid_at);
  const computedAsOfResult = rfc3339Schema.safeParse(input.computedAsOf);
  if (
    !observedAtResult.success ||
    !validAtResult.success ||
    !computedAsOfResult.success ||
    Date.parse(validAtResult.data) > Date.parse(computedAsOfResult.data) ||
    !quality.evidence_fingerprint
  ) {
    return null;
  }

  const unit =
    input.calibration.type === "ftp_watts" || input.calibration.type === "critical_power_watts"
      ? "watts"
      : input.calibration.type === "lthr_bpm"
        ? "beats_per_minute"
        : "meters_per_second";
  if (input.calibration.type === "heart_rate_reserve_bpm") return null;

  const thresholdEvidenceResult: CommonThresholdEvidence = commonThresholdEvidenceSchema.parse({
    ...input.calibration,
    unit,
    source: quality.source,
    observedAt: observedAtResult.data,
    validAt: validAtResult.data,
    freshness: quality.stale ? "stale" : "current",
    calculationVersion: quality.calculation_version ?? null,
    sourceFingerprint: quality.evidence_fingerprint,
  });

  return {
    quality,
    thresholdEvidence: thresholdEvidenceResult,
    evidenceFingerprint: quality.evidence_fingerprint,
    computedAsOf: input.computedAsOf,
  };
}

function directCommonMethod(method: ActivityTssMethod): CommonLoadMethod | null {
  return method === "heart_rate_threshold" ? null : method;
}

function resolveDirectCommonLoad(input: {
  sport: CanonicalSport;
  durationSeconds: number;
  computedAsOf: string;
  resolved: ResolvedTssMethod;
  evidenceFingerprint: string;
}): CommonLoadResult {
  const method = directCommonMethod(input.resolved.method);
  if (!method) {
    return unavailableCommonLoad({
      sport: input.sport,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "unsupported_modality",
    });
  }
  const provenance = completeCommonProvenance({
    quality: input.resolved.calibrationQuality,
    calibration: input.resolved.calibration,
    computedAsOf: input.computedAsOf,
  });
  if (!provenance) {
    return unavailableCommonLoad({
      sport: input.sport,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "invalid_data",
    });
  }
  provenance.evidenceFingerprint = input.evidenceFingerprint;
  if (provenance.quality.stale) {
    return unavailableCommonLoad({
      sport: input.sport,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "stale_threshold",
      method,
      provenance,
    });
  }
  if (input.resolved.rawIntensityFactor > 1.5 || input.resolved.rawIntensityFactor < 0) {
    return unavailableCommonLoad({
      sport: input.sport,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "intensity_out_of_range",
      method,
      provenance,
    });
  }

  return calculateAvailableCommonLoad({
    sport: input.sport,
    method,
    intensity: input.resolved.rawIntensityFactor,
    contributingDurationSeconds: input.durationSeconds,
    ...provenance,
    estimated: provenance.quality.estimate,
  });
}

function resolveHeartRateCommonLoad(input: {
  sport: CanonicalSport;
  durationSeconds: number;
  computedAsOf: string;
  lthr: number | null;
  quality: ActivityCalibrationQuality | null;
  distribution: ActivityHeartRateDistribution | null | undefined;
  evidenceFingerprint: string;
}): CommonLoadResult {
  const method = "heart_rate_zones" as const;
  if (isInvalidLthr(input.lthr)) {
    return unavailableCommonLoad({
      sport: input.sport,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "invalid_data",
    });
  }
  if (input.lthr === null) {
    return unavailableCommonLoad({
      sport: input.sport,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "threshold_missing",
      method,
    });
  }
  const provenance = completeCommonProvenance({
    quality: input.quality,
    calibration: { type: "lthr_bpm", value: input.lthr },
    computedAsOf: input.computedAsOf,
  });
  if (!provenance) {
    return unavailableCommonLoad({
      sport: input.sport,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "invalid_data",
    });
  }
  provenance.evidenceFingerprint = input.evidenceFingerprint;
  if (provenance.quality.stale) {
    return unavailableCommonLoad({
      sport: input.sport,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "stale_threshold",
      method,
      provenance,
    });
  }
  if (input.distribution == null) {
    return unavailableCommonLoad({
      sport: input.sport,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "activity_data_missing",
      method,
      provenance,
    });
  }
  const distributionResult = activityHeartRateDistributionSchema.safeParse(input.distribution);
  if (
    !distributionResult.success ||
    distributionResult.data.coverageSeconds > input.durationSeconds
  ) {
    return unavailableCommonLoad({
      sport: input.sport,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "invalid_data",
      method,
      provenance,
    });
  }
  const distribution = distributionResult.data;
  const sourceTimeCoverage = distribution.coverageSeconds / input.durationSeconds;
  if (sourceTimeCoverage < 0.5) {
    return unavailableCommonLoad({
      sport: input.sport,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: distribution.coverageSeconds,
      reason: "insufficient_coverage",
      method,
      provenance,
    });
  }
  const zoneStress = calculateHeartRateZoneStress({
    durationSeconds: input.durationSeconds,
    lthrBpm: input.lthr,
    distribution,
  });
  if (!zoneStress) {
    return unavailableCommonLoad({
      sport: input.sport,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: distribution.coverageSeconds,
      reason: "invalid_data",
      method,
      provenance,
    });
  }
  if (distribution.coverageSeconds === input.durationSeconds) {
    return calculateAvailableCommonLoad({
      sport: input.sport,
      method,
      intensity: zoneStress.rawEquivalentIntensityFactor,
      contributingDurationSeconds: distribution.coverageSeconds,
      ...provenance,
      estimated: provenance.quality.estimate,
    });
  }

  const intensity = zoneStress.rawEquivalentIntensityFactor;
  return commonLoadResultSchema.parse({
    status: "partial",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sport: input.sport,
    method,
    quality: provenance.quality,
    thresholdEvidence: provenance.thresholdEvidence,
    evidenceFingerprint: provenance.evidenceFingerprint,
    computedAsOf: input.computedAsOf,
    load: zoneStress.rawTss,
    intensity,
    contributingDurationSeconds: distribution.coverageSeconds,
    eligibleDurationSeconds: input.durationSeconds,
    sourceTimeCoverage,
    reason: "duration_partial",
  });
}

export function analyzeActivityDerivedMetrics(
  input: AnalyzeActivityDerivedMetricsInput,
): ActivityDerivedMetrics {
  const { activity, context, streams, heartRateDistribution } = input;
  const computedAsOf = input.computedAsOf ?? activity.started_at;
  const ftp = context.profileMetrics.ftp ?? null;
  const lthr = context.profileMetrics.lthr ?? null;
  const maxHr = context.profileMetrics.max_hr ?? null;
  const restingHr = context.profileMetrics.resting_hr ?? null;
  const sport = canonicalSportValues.find((candidate) => candidate === activity.type) as
    | CanonicalSport
    | undefined;
  const selection = resolveTssSelection({ activity, context, sport });
  const resolvedMethod = selection.resolved;
  const fullPrecisionIntensityFactor = resolvedMethod?.intensityFactor ?? null;
  const intensityFactor =
    fullPrecisionIntensityFactor === null ? null : roundToTwoDecimals(fullPrecisionIntensityFactor);
  const tssIdentity: CurrentActivityTssIdentity | null =
    sport && resolvedMethod
      ? {
          sport,
          method: resolvedMethod.method,
          source: "activity_analysis",
          version: "1",
          calibration: resolvedMethod.calibration,
        }
      : null;

  const tss =
    fullPrecisionIntensityFactor !== null
      ? Math.round(calculateTrainingTSS(activity.duration_seconds, fullPrecisionIntensityFactor))
      : null;

  const commonSport = sport ?? "other";
  const hasValidDuration =
    Number.isFinite(activity.duration_seconds) && activity.duration_seconds > 0;
  const eligibleDurationSeconds = resolveEligibleDurationSeconds(activity);
  const lthrCalibration = sport ? resolveLthrCalibration(context, sport) : null;
  const commonLoad = !hasValidDuration
    ? unavailableCommonLoad({
        sport: commonSport,
        computedAsOf,
        contributingDurationSeconds: null,
        reason: "invalid_data",
      })
    : resolvedMethod && directCommonMethod(resolvedMethod.method)
      ? eligibleDurationSeconds === null
        ? unavailableCommonLoad({
            sport: commonSport,
            computedAsOf,
            contributingDurationSeconds: null,
            reason: "invalid_data",
          })
        : resolveDirectCommonLoad({
            sport: commonSport,
            durationSeconds: eligibleDurationSeconds,
            computedAsOf,
            resolved: resolvedMethod,
            evidenceFingerprint: `activity-common-load:v1:${JSON.stringify([
              activity.id,
              sport,
              resolvedMethod.method,
              activity.duration_seconds,
              activity.normalized_power ?? null,
              activity.avg_power ?? null,
              activity.normalized_graded_speed_mps ?? null,
              activity.normalized_speed_mps ?? null,
              activity.avg_speed_mps ?? null,
              resolvedMethod.calibrationQuality?.evidence_fingerprint ?? null,
            ])}`,
          })
      : sport === "run" || sport === "bike" || sport === "swim"
        ? resolveHeartRateCommonLoad({
            sport,
            // Persisted HR distributions integrate active elapsed intervals and are not
            // moving-time filtered, so their denominator is the activity's active duration.
            durationSeconds: activity.duration_seconds,
            computedAsOf,
            lthr: lthrCalibration?.value ?? null,
            quality: lthrCalibration?.quality ?? null,
            distribution: heartRateDistribution,
            evidenceFingerprint: `activity-common-load:v1:${JSON.stringify([
              activity.id,
              sport,
              activity.duration_seconds,
              heartRateDistribution ?? null,
              lthrCalibration?.quality?.evidence_fingerprint ?? null,
            ])}`,
          })
        : unavailableCommonLoad({
            sport: commonSport,
            computedAsOf,
            contributingDurationSeconds: activity.duration_seconds,
            reason: "unsupported_modality",
          });

  const trimp = resolveTrimp({
    avgHeartRate: activity.avg_heart_rate,
    durationSeconds: activity.duration_seconds,
    maxHr,
    restingHr,
  });

  const hrZones = toZoneEntries(
    calculateHRZones(streams?.heart_rate ?? undefined, lthr),
    HR_ZONE_LABELS,
  );
  const powerZones = toZoneEntries(
    calculatePowerZones(streams?.power ?? undefined, ftp),
    POWER_ZONE_LABELS,
  );

  return {
    stress: {
      tss,
      tss_identity: tssIdentity,
      intensity_factor: intensityFactor,
      method: resolvedMethod?.method ?? null,
      unavailable_reason: resolvedMethod ? null : selection.reason,
      calibration_quality: resolvedMethod?.calibrationQuality ?? null,
      common_load: commonLoad,
      trimp,
      trimp_source: trimp !== null ? "hr" : null,
      training_effect: resolveTrainingEffect(intensityFactor),
    },
    zones: {
      hr: hrZones,
      power: powerZones,
    },
    computed_as_of: computedAsOf,
  };
}

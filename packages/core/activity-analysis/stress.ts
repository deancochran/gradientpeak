import { z } from "zod";
import {
  type RunningNormalizedGradedPaceResult,
  selectRunningNormalizedGradedSpeedMetersPerSecond,
} from "../calculations/normalized-graded-pace";
import {
  type CyclingNormalizedPowerResult,
  selectCyclingNormalizedPowerWatts,
} from "../calculations/normalized-power";
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
import type { AthletePerformanceTargetFacts, PerformanceThresholdFact } from "../performance-model";
import {
  type CanonicalActivityCategory,
  canonicalActivityCategoryValues,
} from "../schemas/activity-category";
import {
  type HeartRateDurationEvidence,
  heartRateDurationEvidenceSchema,
} from "../zones/heart-rate-duration";
import { calculateHRZoneDistribution } from "../zones/hr";
import { getTrainingIntensityZone } from "../zones/intensity";
import { calculatePowerZoneDistribution } from "../zones/power";
import {
  type ActivityThresholdMethod,
  completedActivityCalculationPolicy,
} from "./calculation-policy";
import {
  type ActivityCalibrationQuality,
  activityCalibrationQualitySchema,
} from "./calibration-quality";
import type { ActivityDerivedMetrics, ActivityZoneEntry } from "./contracts";
import type { AggregatedStream } from "./stream-contract";

export type ActivityAnalysisContext = {
  profileMetrics: {
    resting_hr?: number | null;
    weight_kg?: number | null;
  };
  performanceTargets?: AthletePerformanceTargetFacts | null;
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
  elapsed_seconds?: number | null;
  moving_seconds?: number | null;
  timing_coverage?: "complete" | "partial" | "unavailable";
  distance_meters?: number | null;
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  avg_power?: number | null;
  max_power?: number | null;
  avg_speed_mps?: number | null;
  max_speed_mps?: number | null;
  normalized_power_result: CyclingNormalizedPowerResult;
  normalized_speed_mps?: number | null;
  normalized_graded_pace_result?: RunningNormalizedGradedPaceResult | null;
};

export type ActivityAnalysisStreams = {
  heart_rate?: AggregatedStream | null;
  power?: AggregatedStream | null;
  speed?: AggregatedStream | null;
};

export const activityHeartRateDistributionSchema = heartRateDurationEvidenceSchema;

export type ActivityHeartRateDistribution = HeartRateDurationEvidence;

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
  ftp?: number | null;
}): number | null {
  const { normalizedPower, ftp } = input;
  if (!ftp) return null;
  if (normalizedPower == null || !Number.isFinite(normalizedPower) || normalizedPower < 0) {
    return null;
  }

  return normalizedPower / ftp;
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
    (value): value is number => value != null && Number.isFinite(value) && value >= 0,
  );
  if (referenceSpeed === undefined) {
    return null;
  }

  return referenceSpeed / thresholdSpeedMps;
}

type ResolvedCommonLoadMethod = {
  method: ActivityThresholdMethod;
  intensityFactor: number;
  rawIntensityFactor: number;
  calibration: Pick<CommonThresholdEvidence, "type" | "value">;
  calibrationQuality: ActivityCalibrationQuality | null;
};

type CommonLoadMethodResolution =
  | { status: "resolved"; value: ResolvedCommonLoadMethod }
  | { status: "invalid_data" | "activity_data_missing" | "threshold_missing" };

type DirectCommonLoadSelection = {
  attempted: boolean;
  failedMethod: CommonLoadMethod | null;
  reason: Extract<CommonLoadResult, { status: "unavailable" }>["reason"];
  resolved: ResolvedCommonLoadMethod | null;
};

function performanceTargetQuality(
  fact: PerformanceThresholdFact,
): ActivityCalibrationQuality | null {
  if (fact.status !== "available") return null;
  const confidence = fact.confidence >= 0.85 ? "high" : fact.confidence >= 0.7 ? "medium" : "low";
  return {
    source: "observed_effort",
    observed_at: fact.effectiveAt,
    valid_at: fact.effectiveAt,
    confidence,
    stale: fact.freshness === "stale",
    estimate: false,
    calculation_version: fact.calculationVersion,
    evidence_fingerprint: [fact.thresholdId, fact.evaluationId].join(":"),
  };
}

function performanceThresholdValue(fact: PerformanceThresholdFact | undefined): number | null {
  return fact?.status === "available" && Number.isFinite(fact.value) && fact.value > 0
    ? fact.value
    : null;
}

function heartRateFactQuality(
  fact: AthletePerformanceTargetFacts["heartRate"]["bike"]["lthr"] | undefined,
): ActivityCalibrationQuality | null {
  if (fact?.status !== "available") return null;
  return {
    source: "observed_effort",
    observed_at: fact.observedAt,
    valid_at: fact.observedAt,
    confidence: "high",
    stale: fact.calibrationState === "stale",
    estimate: false,
    calculation_version: fact.calculationVersion,
    evidence_fingerprint: fact.sourceEvidenceId,
  };
}

function resolveLthrPerformanceTarget(
  context: ActivityAnalysisContext,
  activity_category: CanonicalActivityCategory,
): { value: number | null; quality: ActivityCalibrationQuality | null } {
  if (activity_category !== "bike" && activity_category !== "run" && activity_category !== "swim") {
    return { value: null, quality: null };
  }
  const fact = context.performanceTargets?.heartRate[activity_category].lthr;
  return {
    value: fact?.status === "available" ? fact.valueBpm : null,
    quality: heartRateFactQuality(fact),
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
}): Exclude<CommonLoadMethodResolution, { status: "resolved" }> | null {
  const { threshold, thresholdIsInvalid, measurement } = input;
  if (thresholdIsInvalid || (measurement.value === null && measurement.hasInvalid)) {
    return { status: "invalid_data" };
  }
  if (threshold == null) return { status: "threshold_missing" };
  if (measurement.value === null) return { status: "activity_data_missing" };
  return null;
}

function resolveCommonLoadMethod(input: {
  method: ActivityThresholdMethod;
  activity_category: CanonicalActivityCategory;
  activity: ActivitySummaryForAnalysis;
  context: ActivityAnalysisContext;
}): CommonLoadMethodResolution {
  const { method, activity_category, activity, context } = input;
  const performanceTargets = context.performanceTargets;

  switch (method) {
    case "power_threshold": {
      const fact = performanceTargets?.thresholds.bike;
      const planningThresholdPower = performanceThresholdValue(fact);
      const calibrationQuality = fact && performanceTargets ? performanceTargetQuality(fact) : null;
      const measurement = resolveMeasurement(
        [selectCyclingNormalizedPowerWatts(activity.normalized_power_result)],
        isInvalidNonnegativeValue,
      );
      const unavailable = unresolvedMethod({
        threshold: planningThresholdPower,
        thresholdIsInvalid: isInvalidPositiveValue(planningThresholdPower),
        measurement,
      });
      if (unavailable) return unavailable;
      const intensityFactor = resolveIntensityFactor({
        normalizedPower: measurement.value,
        ftp: planningThresholdPower,
      });
      return intensityFactor !== null && typeof planningThresholdPower === "number"
        ? {
            status: "resolved",
            value: {
              method,
              intensityFactor: Math.max(0, Math.min(1.5, intensityFactor)),
              rawIntensityFactor: intensityFactor,
              calibration: { type: "ftp_watts", value: planningThresholdPower },
              calibrationQuality,
            },
          }
        : { status: "invalid_data" };
    }
    case "run_pace_threshold": {
      const fact = performanceTargets?.thresholds.run;
      const thresholdSpeedMps = performanceThresholdValue(fact);
      const normalizedGradedPaceResult = activity.normalized_graded_pace_result;
      const measurement =
        normalizedGradedPaceResult === undefined || normalizedGradedPaceResult === null
          ? { value: null, hasInvalid: false }
          : resolveMeasurement(
              [selectRunningNormalizedGradedSpeedMetersPerSecond(normalizedGradedPaceResult)],
              isInvalidNonnegativeValue,
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
              calibrationQuality:
                fact && performanceTargets ? performanceTargetQuality(fact) : null,
            },
          }
        : { status: "invalid_data" };
    }
    case "swim_pace_threshold": {
      const fact = performanceTargets?.thresholds.swim;
      const thresholdSpeedMps = performanceThresholdValue(fact);
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
              calibrationQuality:
                fact && performanceTargets ? performanceTargetQuality(fact) : null,
            },
          }
        : { status: "invalid_data" };
    }
    case "heart_rate_threshold": {
      const lthrCalibration = resolveLthrPerformanceTarget(context, activity_category);
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

function isInvalidNonnegativeValue(value: number | null | undefined): boolean {
  return value != null && (!Number.isFinite(value) || value < 0);
}

function isInvalidHeartRate(value: number | null | undefined): boolean {
  return value != null && (!Number.isFinite(value) || value < 30 || value > 250);
}

function isInvalidLthr(value: number | null | undefined): boolean {
  return value != null && (!Number.isFinite(value) || value < 80 || value > 220);
}

function resolveEligibleDurationSeconds(activity: ActivitySummaryForAnalysis): number | null {
  if (activity.type === "swim" && activity.timing_coverage === "unavailable") return null;
  const movingSeconds = activity.moving_seconds;
  if (movingSeconds == null) return activity.duration_seconds;
  return Number.isFinite(movingSeconds) &&
    movingSeconds > 0 &&
    movingSeconds <= activity.duration_seconds
    ? movingSeconds
    : null;
}

/**
 * HR evidence carries the stream interval denominator used to build its
 * buckets. Activity active time can be supplied independently by a provider,
 * so use that evidence denominator only when the segment's elapsed boundary
 * can contain it.
 */
type HeartRateEvidenceDurationResolution =
  | { status: "resolved"; durationSeconds: number }
  | { status: "invalid_data" };

function resolveHeartRateEvidenceDuration(input: {
  activity: ActivitySummaryForAnalysis;
  distribution: ActivityHeartRateDistribution | null | undefined;
}): HeartRateEvidenceDurationResolution {
  const parsed = activityHeartRateDistributionSchema.safeParse(input.distribution);
  if (!parsed.success) {
    return { status: "resolved", durationSeconds: input.activity.duration_seconds };
  }

  const activityDurationSeconds = input.activity.duration_seconds;
  const hasValidActivityDuration =
    Number.isFinite(activityDurationSeconds) && activityDurationSeconds > 0;
  const elapsedSeconds = input.activity.elapsed_seconds;
  const hasElapsedBoundary =
    elapsedSeconds !== null &&
    elapsedSeconds !== undefined &&
    Number.isFinite(elapsedSeconds) &&
    elapsedSeconds > 0;
  const upperBoundSeconds = hasElapsedBoundary
    ? elapsedSeconds
    : hasValidActivityDuration
      ? activityDurationSeconds
      : null;
  if (
    upperBoundSeconds === null ||
    (hasElapsedBoundary &&
      hasValidActivityDuration &&
      elapsedSeconds + Number.EPSILON * elapsedSeconds * 16 < activityDurationSeconds) ||
    parsed.data.eligibleDurationSeconds >
      upperBoundSeconds + Number.EPSILON * upperBoundSeconds * 16
  ) {
    return { status: "invalid_data" };
  }
  return { status: "resolved", durationSeconds: parsed.data.eligibleDurationSeconds };
}

function resolveDirectCommonLoadSelection(input: {
  activity: ActivitySummaryForAnalysis;
  context: ActivityAnalysisContext;
  activity_category: Extract<CanonicalActivityCategory, "bike" | "run" | "swim">;
}): DirectCommonLoadSelection {
  const { activity, context, activity_category } = input;
  const policyMethods = completedActivityCalculationPolicy[
    activity_category
  ].thresholdMethods.filter(
    (method): method is Exclude<ActivityThresholdMethod, "heart_rate_threshold"> =>
      method !== "heart_rate_threshold",
  );
  const methods = policyMethods;
  const attempted =
    activity_category === "bike"
      ? selectCyclingNormalizedPowerWatts(activity.normalized_power_result) !== null ||
        activity.avg_power != null
      : activity_category === "run"
        ? activity.normalized_graded_pace_result != null ||
          activity.normalized_speed_mps != null ||
          activity.avg_speed_mps != null
        : activity.normalized_speed_mps != null || activity.avg_speed_mps != null;
  const resolutions = methods.map((method) =>
    resolveCommonLoadMethod({ method, activity_category, activity, context }),
  );
  const resolved = resolutions.find(
    (resolution): resolution is Extract<CommonLoadMethodResolution, { status: "resolved" }> =>
      resolution.status === "resolved",
  );
  if (resolved) {
    return {
      attempted: true,
      resolved: resolved.value,
      failedMethod: null,
      reason: "threshold_missing",
    };
  }

  const failedMethod = methods[0] ?? null;
  if (resolutions.some((resolution) => resolution.status === "invalid_data")) {
    return { attempted, resolved: null, failedMethod, reason: "invalid_data" };
  }
  if (resolutions.some((resolution) => resolution.status === "activity_data_missing")) {
    return { attempted, resolved: null, failedMethod, reason: "activity_data_missing" };
  }
  return { attempted, resolved: null, failedMethod, reason: "threshold_missing" };
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
  activity_category: CanonicalActivityCategory;
  computedAsOf: string;
  contributingDurationSeconds: number | null;
  reason: Extract<CommonLoadResult, { status: "unavailable" }>["reason"];
  eligibleDurationSeconds?: number | null;
  sourceTimeCoverage?: number | null;
  method?: CommonLoadMethod | null;
  provenance?: CompleteCommonProvenance | null;
}): CommonLoadResult {
  const provenance = input.provenance ?? null;
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    activity_category: input.activity_category,
    method: input.method ?? null,
    quality: provenance?.quality ?? null,
    thresholdEvidence: provenance?.thresholdEvidence ?? null,
    evidenceFingerprint: provenance?.evidenceFingerprint ?? null,
    computedAsOf: input.computedAsOf,
    contributingDurationSeconds: input.contributingDurationSeconds,
    ...(input.eligibleDurationSeconds === undefined
      ? {}
      : { eligibleDurationSeconds: input.eligibleDurationSeconds }),
    ...(input.sourceTimeCoverage === undefined
      ? {}
      : { sourceTimeCoverage: input.sourceTimeCoverage }),
    reason: input.reason,
  });
}

function completeCommonProvenance(input: {
  quality: ActivityCalibrationQuality | null;
  calibration: Pick<CommonThresholdEvidence, "type" | "value">;
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
    input.calibration.type === "ftp_watts"
      ? "watts"
      : input.calibration.type === "lthr_bpm"
        ? "beats_per_minute"
        : "meters_per_second";

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

function directCommonMethod(method: ActivityThresholdMethod): CommonLoadMethod | null {
  return method === "heart_rate_threshold" ? null : method;
}

type DirectCommonLoadDurationEvidence =
  | { status: "complete"; contributingDurationSeconds: number }
  | {
      status: "partial";
      contributingDurationSeconds: number;
      eligibleDurationSeconds: number;
      sourceTimeCoverage: number;
      reason: "activity_data_partial" | "duration_partial";
    }
  | { status: "invalid" };

function nearlyEqualDuration(left: number, right: number): boolean {
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 16;
  return Math.abs(left - right) <= tolerance;
}

function resolveDirectCommonLoadDurationEvidence(input: {
  activity: ActivitySummaryForAnalysis;
  durationSeconds: number;
  method: CommonLoadMethod;
}): DirectCommonLoadDurationEvidence {
  if (input.method === "swim_pace_threshold" && input.activity.timing_coverage === "partial") {
    return {
      status: "partial",
      contributingDurationSeconds: input.durationSeconds,
      eligibleDurationSeconds: input.durationSeconds,
      sourceTimeCoverage: 1,
      reason: "duration_partial",
    };
  }
  if (input.method === "run_pace_threshold") {
    const normalizedGradedPaceResult = input.activity.normalized_graded_pace_result;
    if (normalizedGradedPaceResult === null || normalizedGradedPaceResult === undefined) {
      return { status: "invalid" };
    }
    if (selectRunningNormalizedGradedSpeedMetersPerSecond(normalizedGradedPaceResult) === null) {
      return { status: "invalid" };
    }
    const diagnosticDuration = normalizedGradedPaceResult.diagnostics.contributingDurationSeconds;
    if (
      !Number.isFinite(diagnosticDuration) ||
      diagnosticDuration <= 0 ||
      (diagnosticDuration > input.durationSeconds &&
        !nearlyEqualDuration(diagnosticDuration, input.durationSeconds))
    ) {
      return { status: "invalid" };
    }
    const contributingDurationSeconds = nearlyEqualDuration(
      diagnosticDuration,
      input.durationSeconds,
    )
      ? input.durationSeconds
      : diagnosticDuration;
    if (
      normalizedGradedPaceResult.status === "partial" ||
      !nearlyEqualDuration(contributingDurationSeconds, input.durationSeconds)
    ) {
      return {
        status: "partial",
        contributingDurationSeconds,
        eligibleDurationSeconds: input.durationSeconds,
        sourceTimeCoverage: contributingDurationSeconds / input.durationSeconds,
        reason:
          normalizedGradedPaceResult.status === "partial"
            ? "activity_data_partial"
            : "duration_partial",
      };
    }
    return { status: "complete", contributingDurationSeconds };
  }
  if (input.method !== "power_threshold") {
    return { status: "complete", contributingDurationSeconds: input.durationSeconds };
  }

  const normalizedPowerResult = input.activity.normalized_power_result;
  if (selectCyclingNormalizedPowerWatts(normalizedPowerResult) === null) {
    return { status: "invalid" };
  }

  const diagnosticDuration = normalizedPowerResult.diagnostics.contributingDurationSeconds;
  if (
    !Number.isFinite(diagnosticDuration) ||
    diagnosticDuration <= 0 ||
    (diagnosticDuration > input.durationSeconds &&
      !nearlyEqualDuration(diagnosticDuration, input.durationSeconds))
  ) {
    return { status: "invalid" };
  }
  const contributingDurationSeconds = nearlyEqualDuration(diagnosticDuration, input.durationSeconds)
    ? input.durationSeconds
    : diagnosticDuration;
  const sourceTimeCoverage = contributingDurationSeconds / input.durationSeconds;
  if (
    normalizedPowerResult.status === "partial" ||
    !nearlyEqualDuration(contributingDurationSeconds, input.durationSeconds)
  ) {
    return {
      status: "partial",
      contributingDurationSeconds,
      eligibleDurationSeconds: input.durationSeconds,
      sourceTimeCoverage,
      reason:
        normalizedPowerResult.status === "partial" ? "activity_data_partial" : "duration_partial",
    };
  }
  return { status: "complete", contributingDurationSeconds };
}

function resolveDirectCommonLoad(input: {
  activity: ActivitySummaryForAnalysis;
  activity_category: CanonicalActivityCategory;
  durationSeconds: number;
  computedAsOf: string;
  resolved: ResolvedCommonLoadMethod;
  evidenceFingerprint: string;
}): CommonLoadResult {
  const method = directCommonMethod(input.resolved.method);
  if (!method) {
    return unavailableCommonLoad({
      activity_category: input.activity_category,
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
      activity_category: input.activity_category,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "invalid_data",
    });
  }
  provenance.evidenceFingerprint = input.evidenceFingerprint;
  if (input.resolved.rawIntensityFactor > 1.5 || input.resolved.rawIntensityFactor < 0) {
    return unavailableCommonLoad({
      activity_category: input.activity_category,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "intensity_out_of_range",
      method,
      provenance,
    });
  }

  const durationEvidence = resolveDirectCommonLoadDurationEvidence({
    activity: input.activity,
    durationSeconds: input.durationSeconds,
    method,
  });
  if (durationEvidence.status === "invalid") {
    return unavailableCommonLoad({
      activity_category: input.activity_category,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: null,
      reason: "invalid_data",
    });
  }

  const calculated = calculateAvailableCommonLoad({
    activity_category: input.activity_category,
    method,
    intensity: input.resolved.rawIntensityFactor,
    contributingDurationSeconds: durationEvidence.contributingDurationSeconds,
    ...provenance,
    estimated: provenance.quality.estimate,
  });
  if (durationEvidence.status === "complete" || calculated.status !== "available") {
    return calculated;
  }
  const { estimated: _estimated, status: _status, ...retained } = calculated;
  return commonLoadResultSchema.parse({
    status: "partial",
    ...retained,
    eligibleDurationSeconds: durationEvidence.eligibleDurationSeconds,
    sourceTimeCoverage: durationEvidence.sourceTimeCoverage,
    reason: durationEvidence.reason,
  });
}

function resolveHeartRateCommonLoad(input: {
  activity_category: CanonicalActivityCategory;
  durationSeconds: number;
  computedAsOf: string;
  lthr: number | null;
  quality: ActivityCalibrationQuality | null;
  distribution: ActivityHeartRateDistribution | null | undefined;
  evidenceFingerprint: string;
}): CommonLoadResult {
  const method: CommonLoadMethod = "heart_rate_zones";
  if (isInvalidLthr(input.lthr)) {
    return unavailableCommonLoad({
      activity_category: input.activity_category,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "invalid_data",
    });
  }
  if (input.lthr === null) {
    return unavailableCommonLoad({
      activity_category: input.activity_category,
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
      activity_category: input.activity_category,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "invalid_data",
    });
  }
  provenance.evidenceFingerprint = input.evidenceFingerprint;
  if (input.distribution == null) {
    return unavailableCommonLoad({
      activity_category: input.activity_category,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "activity_data_missing",
      method,
      provenance,
    });
  }
  const distributionResult = activityHeartRateDistributionSchema.safeParse(input.distribution);
  if (!distributionResult.success) {
    return unavailableCommonLoad({
      activity_category: input.activity_category,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.durationSeconds,
      reason: "invalid_data",
      method,
      provenance,
    });
  }
  const zoneStress = calculateHeartRateZoneStress({
    durationSeconds: input.durationSeconds,
    lthrBpm: input.lthr,
    distribution: distributionResult.data,
  });
  if (zoneStress.status === "unavailable") {
    const reason: Extract<CommonLoadResult, { status: "unavailable" }>["reason"] =
      zoneStress.reason === "insufficient_coverage"
        ? "insufficient_coverage"
        : zoneStress.reason === "activity_data_missing"
          ? "activity_data_missing"
          : zoneStress.reason === "intensity_out_of_range"
            ? "intensity_out_of_range"
            : "invalid_data";
    return unavailableCommonLoad({
      activity_category: input.activity_category,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds:
        zoneStress.contributingDurationSeconds > 0 ? zoneStress.contributingDurationSeconds : null,
      ...(reason === "insufficient_coverage"
        ? {
            eligibleDurationSeconds: zoneStress.eligibleDurationSeconds,
            sourceTimeCoverage: zoneStress.coverageRatio,
          }
        : {}),
      reason,
      method,
      provenance,
    });
  }
  if (zoneStress.status === "available") {
    return calculateAvailableCommonLoad({
      activity_category: input.activity_category,
      method,
      intensity: zoneStress.rawEquivalentIntensityFactor,
      contributingDurationSeconds: zoneStress.contributingDurationSeconds,
      ...provenance,
      estimated: provenance.quality.estimate,
    });
  }

  return commonLoadResultSchema.parse({
    status: "partial",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    activity_category: input.activity_category,
    method,
    quality: provenance.quality,
    thresholdEvidence: provenance.thresholdEvidence,
    evidenceFingerprint: provenance.evidenceFingerprint,
    computedAsOf: input.computedAsOf,
    load: zoneStress.rawLoad,
    intensity: zoneStress.rawEquivalentIntensityFactor,
    contributingDurationSeconds: zoneStress.contributingDurationSeconds,
    eligibleDurationSeconds: zoneStress.eligibleDurationSeconds,
    sourceTimeCoverage: zoneStress.coverageRatio,
    reason: "activity_data_partial",
  });
}

export function analyzeActivityDerivedMetrics(
  input: AnalyzeActivityDerivedMetricsInput,
): ActivityDerivedMetrics {
  const { activity, context, streams, heartRateDistribution } = input;
  const computedAsOf = input.computedAsOf ?? activity.started_at;
  const restingHr = context.profileMetrics.resting_hr ?? null;
  const activity_category = canonicalActivityCategoryValues.find(
    (candidate) => candidate === activity.type,
  ) as CanonicalActivityCategory | undefined;
  const commonActivityCategory = activity_category ?? "other";
  const planningThresholdPower = performanceThresholdValue(
    context.performanceTargets?.thresholds.bike,
  );
  const categoryHeartRateFacts =
    activity_category === "bike" || activity_category === "run" || activity_category === "swim"
      ? context.performanceTargets?.heartRate[activity_category]
      : undefined;
  const lthr =
    categoryHeartRateFacts?.lthr.status === "available"
      ? categoryHeartRateFacts.lthr.valueBpm
      : null;
  const maxHr =
    categoryHeartRateFacts?.maxHr.status === "available"
      ? categoryHeartRateFacts.maxHr.valueBpm
      : null;
  const hasValidDuration =
    Number.isFinite(activity.duration_seconds) && activity.duration_seconds > 0;
  const eligibleDurationSeconds = resolveEligibleDurationSeconds(activity);
  const lthrCalibration = activity_category
    ? resolveLthrPerformanceTarget(context, activity_category)
    : null;
  const directSelection =
    activity.timing_coverage !== "unavailable" &&
    (activity_category === "run" || activity_category === "bike" || activity_category === "swim")
      ? resolveDirectCommonLoadSelection({ activity, context, activity_category })
      : null;
  const directCommonLoad: CommonLoadResult | null =
    hasValidDuration && directSelection?.attempted
      ? directSelection.resolved
        ? eligibleDurationSeconds === null
          ? unavailableCommonLoad({
              activity_category: commonActivityCategory,
              computedAsOf,
              contributingDurationSeconds: null,
              reason:
                activity.type === "swim" && activity.timing_coverage !== "complete"
                  ? "duration_missing"
                  : "invalid_data",
            })
          : resolveDirectCommonLoad({
              activity,
              activity_category: commonActivityCategory,
              durationSeconds: eligibleDurationSeconds,
              computedAsOf,
              resolved: directSelection.resolved,
              evidenceFingerprint: `activity-common-load:v1:${JSON.stringify([
                activity.id,
                activity_category,
                directSelection.resolved.method,
                activity.duration_seconds,
                activity.normalized_power_result,
                activity.avg_power ?? null,
                activity.normalized_graded_pace_result ?? null,
                activity.normalized_speed_mps ?? null,
                activity.avg_speed_mps ?? null,
                directSelection.resolved.calibrationQuality?.evidence_fingerprint ?? null,
              ])}`,
            })
        : unavailableCommonLoad({
            activity_category: commonActivityCategory,
            computedAsOf,
            contributingDurationSeconds: activity.duration_seconds,
            reason: directSelection.reason,
            method:
              directSelection.reason === "threshold_missing" ? directSelection.failedMethod : null,
          })
      : null;
  // Direct threshold evidence is authoritative when eligible. If it cannot
  // produce a canonical result, the approved HR-zone adapter may still do so.
  const commonLoad = !hasValidDuration
    ? unavailableCommonLoad({
        activity_category: commonActivityCategory,
        computedAsOf,
        contributingDurationSeconds: null,
        reason: "invalid_data",
      })
    : activity_category !== "run" && activity_category !== "bike" && activity_category !== "swim"
      ? unavailableCommonLoad({
          activity_category: commonActivityCategory,
          computedAsOf,
          contributingDurationSeconds: activity.duration_seconds,
          reason: "unsupported_modality",
        })
      : directCommonLoad !== null && directCommonLoad.status !== "unavailable"
        ? directCommonLoad
        : (() => {
            const evidenceDuration = resolveHeartRateEvidenceDuration({
              activity,
              distribution: heartRateDistribution,
            });
            const heartRateCommonLoad =
              evidenceDuration.status === "invalid_data"
                ? unavailableCommonLoad({
                    activity_category,
                    computedAsOf,
                    contributingDurationSeconds: null,
                    reason: "invalid_data",
                  })
                : resolveHeartRateCommonLoad({
                    activity_category,
                    // A versioned distribution owns its qualified interval denominator. It is
                    // accepted only when bounded by the segment's elapsed duration; legacy
                    // evidence remains normalized against the active duration.
                    durationSeconds: evidenceDuration.durationSeconds,
                    computedAsOf,
                    lthr: lthrCalibration?.value ?? null,
                    quality: lthrCalibration?.quality ?? null,
                    distribution: heartRateDistribution,
                    evidenceFingerprint: `activity-common-load:v1:${JSON.stringify([
                      activity.id,
                      activity_category,
                      activity.duration_seconds,
                      heartRateDistribution ?? null,
                      lthrCalibration?.quality?.evidence_fingerprint ?? null,
                    ])}`,
                  });
            return directCommonLoad !== null &&
              evidenceDuration.status !== "invalid_data" &&
              heartRateCommonLoad.status === "unavailable" &&
              heartRateCommonLoad.quality === null
              ? directCommonLoad
              : heartRateCommonLoad;
          })();

  const trimp = resolveTrimp({
    durationSeconds: activity.duration_seconds,
    ...(activity.avg_heart_rate === undefined ? {} : { avgHeartRate: activity.avg_heart_rate }),
    ...(maxHr === undefined ? {} : { maxHr }),
    ...(restingHr === undefined ? {} : { restingHr }),
  });

  const heartRateZoneDuration = calculateHRZoneDistribution(streams?.heart_rate ?? undefined, lthr);
  const hrZones =
    heartRateZoneDuration.status === "unavailable"
      ? []
      : heartRateZoneDuration.zoneSeconds
          .map((seconds, index) => ({
            zone: index + 1,
            seconds: Math.max(0, Math.round(seconds)),
            label: HR_ZONE_LABELS[index] ?? `Zone ${index + 1}`,
          }))
          .filter((entry) => entry.seconds > 0);
  const powerZones = toZoneEntries(
    calculatePowerZoneDistribution(streams?.power ?? undefined, planningThresholdPower),
    POWER_ZONE_LABELS,
  );

  const trainingEffect =
    commonLoad.status === "available" || commonLoad.status === "partial"
      ? resolveTrainingEffect(commonLoad.intensity)
      : null;

  return {
    stress: {
      common_load: commonLoad,
      trimp,
      trimp_source: trimp !== null ? "hr" : null,
      training_effect: trainingEffect,
    },
    zones: {
      hr: hrZones,
      power: powerZones,
    },
    computed_as_of: computedAsOf,
  };
}

import type { ActivityDerivedZones } from "../activity-analysis/contracts";
import { calculateRollingTrainingQuality } from "../calculations/training-quality";
import type { CommonLoadResult } from "../load/common-relative-load";
import {
  type AthletePerformanceTargetFacts,
  getAvailablePerformanceTargetValue,
} from "../performance-model";
import {
  type CreationContextSummary,
  creationContextSummarySchema,
} from "../schemas/training-plan-structure";
import {
  getMaxSustainableLongTermLoad,
  resolveNoHistoryStartingPrior,
} from "./calibration-constants";
import { learnIndividualRampRate } from "./ramp-learning";

export interface CreationCompletedActivitySignal {
  occurred_at: string;
  activity_category?: string | null;
  duration_seconds?: number | null;
  /** Historical progression input; not an activity-analysis stress result. */
  load?: number | null;
  common_load?: CommonLoadResult | null;
  zones?: Partial<ActivityDerivedZones> | null;
}

export interface CreationProfileSignal {
  dob?: string | null;
  gender?: "male" | "female" | null;
}

export interface CreationEffortSignal {
  recorded_at: string;
  effort_type: "power" | "speed";
  duration_seconds: number;
  value: number;
  activity_category?: string | null;
}

export interface CreationActivityContextSignal {
  primary_category?: string | null;
  category_mix?: Record<string, number>;
}

export interface DeriveCreationContextInput {
  completed_activities?: CreationCompletedActivitySignal[];
  efforts?: CreationEffortSignal[];
  activity_context?: CreationActivityContextSignal;
  performance_targets?: AthletePerformanceTargetFacts;
  weight_kg?: number | null;
  profile?: CreationProfileSignal;
  as_of: string;
  /** Global LongTermLoad override from profile settings. If provided, boosts confidence. */
  baseline_fitness_override?: {
    is_enabled: boolean;
    override_longTermLoad?: number;
    override_recentLoad?: number;
    override_date?: string;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type PlanningTargetFact = AthletePerformanceTargetFacts["thresholds"]["bike"];

function performanceTargetValue(fact: PlanningTargetFact | undefined): number | null {
  return fact ? getAvailablePerformanceTargetValue(fact) : null;
}

function toDate(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function daysBetween(a: Date, b: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((a.getTime() - b.getTime()) / dayMs);
}

function calculateAgeAtDate(dob: string | null | undefined, asOf: Date): number | undefined {
  if (!dob) return undefined;
  const birthDate = toDate(dob);
  if (!birthDate) return undefined;
  let age = asOf.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 ? age : undefined;
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((q / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

/**
 * Derives a normalized creation context from profile evidence.
 *
 * Behavior:
 * - no data -> conservative ranges and low confidence
 * - rich data -> tighter ranges and higher confidence
 */
export function deriveCreationContext(input: DeriveCreationContextInput): CreationContextSummary {
  const safeAsOf = toDate(input.as_of);
  if (!safeAsOf) throw new Error("deriveCreationContext requires a valid as_of instant");
  const recentWindowDays = 42;

  const activities = (input.completed_activities ?? []).filter((activity) => {
    const date = toDate(activity.occurred_at);
    if (!date) return false;
    const ageDays = daysBetween(safeAsOf, date);
    return ageDays >= 0 && ageDays <= recentWindowDays;
  });

  const activityCount = activities.length;

  // If user has a baseline fitness override with a valid LongTermLoad, treat as having history
  const hasBaselineOverride =
    input.baseline_fitness_override?.is_enabled === true &&
    typeof input.baseline_fitness_override.override_longTermLoad === "number" &&
    input.baseline_fitness_override.override_longTermLoad > 0;

  const historyState =
    activityCount === 0
      ? hasBaselineOverride
        ? "sparse" // User declared baseline fitness, treat as sparse (not none)
        : "none"
      : activityCount < 10
        ? "sparse"
        : "rich";

  const weeksWithTraining = new Set(
    activities.map((activity) => {
      const date = toDate(activity.occurred_at);
      if (!date) return -1;
      const weekBucket = Math.floor(daysBetween(safeAsOf, date) / 7);
      return weekBucket;
    }),
  );
  weeksWithTraining.delete(-1);
  const consistencyRatio = clamp(weeksWithTraining.size / 6, 0, 1);

  const recentEfforts = (input.efforts ?? []).filter((effort) => {
    const date = toDate(effort.recorded_at);
    if (!date) return false;
    const ageDays = daysBetween(safeAsOf, date);
    return ageDays >= 0 && ageDays <= recentWindowDays;
  });
  const effortCount = recentEfforts.length;

  const performanceTargets = input.performance_targets;
  const userAge = calculateAgeAtDate(input.profile?.dob ?? null, safeAsOf);
  const userGender =
    input.profile?.gender === "male" || input.profile?.gender === "female"
      ? input.profile.gender
      : null;
  const starterPrior = resolveNoHistoryStartingPrior({
    ...(userAge === undefined ? {} : { age: userAge }),
  });
  const maxSustainableLongTermLoad = getMaxSustainableLongTermLoad(userAge);
  const missingRequiredOnboardingFields = input.profile?.dob ? [] : ["dob"];
  const primaryCategory = input.activity_context?.primary_category;
  const primaryThreshold =
    primaryCategory === "bike"
      ? performanceTargets?.thresholds.bike
      : primaryCategory === "run"
        ? performanceTargets?.thresholds.run
        : primaryCategory === "swim"
          ? performanceTargets?.thresholds.swim
          : undefined;
  const primaryLthr =
    primaryCategory === "bike" || primaryCategory === "run" || primaryCategory === "swim"
      ? performanceTargets?.heartRate[primaryCategory].lthr
      : undefined;
  const anyThreshold =
    primaryThreshold ??
    [
      performanceTargets?.thresholds.bike,
      performanceTargets?.thresholds.run,
      performanceTargets?.thresholds.swim,
    ].find((fact) => performanceTargetValue(fact) !== null);
  const anyLthr =
    primaryLthr ??
    [
      performanceTargets?.heartRate.bike.lthr,
      performanceTargets?.heartRate.run.lthr,
      performanceTargets?.heartRate.swim.lthr,
    ].find((fact) => fact?.status === "available");
  const missingOptionalCalibrationFields = [
    input.weight_kg == null ? "weight_kg" : null,
    performanceTargetValue(anyThreshold) === null ? "performance_target" : null,
    anyLthr?.status !== "available" ? "lthr" : null,
  ].filter((field): field is string => field !== null);
  const presentMetricCount = [
    input.weight_kg == null ? null : input.weight_kg,
    performanceTargetValue(anyThreshold),
    anyLthr?.status === "available" ? anyLthr.valueBpm : null,
  ].filter((value) => value !== null && value !== undefined).length;
  const metricCompleteness = clamp(presentMetricCount / 3, 0, 1);

  const consistencyMarker = hasBaselineOverride
    ? "high" // User declared baseline, treat as consistent
    : consistencyRatio >= 0.7
      ? "high"
      : consistencyRatio >= 0.35
        ? "moderate"
        : "low";
  const effortMarker = hasBaselineOverride
    ? "moderate" // Baseline override counts as some effort evidence
    : effortCount >= 6
      ? "high"
      : effortCount >= 2
        ? "moderate"
        : "low";
  const profileMarker =
    metricCompleteness >= 0.75 ? "high" : metricCompleteness >= 0.4 ? "moderate" : "low";

  // Calculate baseline override bonus for signal quality
  const baselineOverrideBonus = hasBaselineOverride
    ? Math.min(0.3, (input.baseline_fitness_override?.override_longTermLoad ?? 0) / 300)
    : 0;

  const qualityScore = clamp(
    (historyState === "rich" ? 0.45 : historyState === "sparse" ? 0.25 : 0.05) +
      consistencyRatio * 0.25 +
      clamp(effortCount / 8, 0, 1) * 0.15 +
      metricCompleteness * 0.15 +
      baselineOverrideBonus -
      (missingRequiredOnboardingFields.length > 0 ? 0.08 : 0),
    0,
    1,
  );

  const weeklyLoadBuckets = Array.from({ length: 6 }, () => 0);
  const weeklySessionBuckets = Array.from({ length: 6 }, () => 0);
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];

  for (const activity of activities) {
    const date = toDate(activity.occurred_at);
    if (!date) {
      continue;
    }

    const ageDays = daysBetween(safeAsOf, date);
    const weekBucket = clamp(Math.floor(ageDays / 7), 0, 5);
    const normalizedLoad =
      activity.load !== null && activity.load !== undefined
        ? activity.load
        : ((activity.duration_seconds ?? 0) / 3600) * 45;

    weeklyLoadBuckets[weekBucket] =
      (weeklyLoadBuckets[weekBucket] ?? 0) + Math.max(0, normalizedLoad);
    weeklySessionBuckets[weekBucket] = (weeklySessionBuckets[weekBucket] ?? 0) + 1;
    const weekday = date.getUTCDay();
    weekdayCounts[weekday] = (weekdayCounts[weekday] ?? 0) + 1;
  }

  const weeklyLoadMedian = percentile(weeklyLoadBuckets, 50);
  const weeklyLoadP25 = percentile(weeklyLoadBuckets, 25);
  const weeklyLoadP75 = percentile(weeklyLoadBuckets, 75);
  const estimatedWeeklyLoad =
    activityCount > 0
      ? Math.max(weeklyLoadMedian, weeklyLoadBuckets.reduce((a, b) => a + b, 0) / 6)
      : starterPrior.starting_weekly_load;

  const baselineBounds =
    historyState === "none"
      ? {
          minFloor: Math.max(20, Math.round(starterPrior.starting_weekly_load * 0.7)),
          maxFloor: Math.round(starterPrior.starting_weekly_load * 0.95),
          maxCeil: starterPrior.is_youth ? 260 : 400,
        }
      : historyState === "sparse"
        ? { minFloor: 60, maxFloor: 100, maxCeil: 800 }
        : { minFloor: 80, maxFloor: 140, maxCeil: 1200 };

  const baselineSpreadFromHistory =
    weeklyLoadP75 > 0 ? weeklyLoadP75 - weeklyLoadP25 : estimatedWeeklyLoad * 0.35;
  const confidenceWidthMultiplier =
    historyState === "rich" ? 0.85 : historyState === "sparse" ? 1 : 1.25;
  const lowSignalExpansion = clamp((0.7 - qualityScore) * 0.4, 0, 0.25);
  const baselineWidthMultiplier = confidenceWidthMultiplier + lowSignalExpansion;
  const baselineMin = Math.round(
    clamp(
      estimatedWeeklyLoad - baselineSpreadFromHistory * baselineWidthMultiplier,
      baselineBounds.minFloor,
      baselineBounds.maxCeil,
    ),
  );
  const baselineMax = Math.round(
    clamp(
      estimatedWeeklyLoad + baselineSpreadFromHistory * baselineWidthMultiplier,
      baselineBounds.maxFloor,
      baselineBounds.maxCeil,
    ),
  );

  const influenceWidth = historyState === "rich" ? 0.15 : historyState === "sparse" ? 0.3 : 0.5;
  const influenceBias = consistencyRatio >= 0.65 ? 0.1 : consistencyRatio <= 0.2 ? -0.1 : 0;

  const sessionMinFromHistory = Math.floor(percentile(weeklySessionBuckets, 25));
  const sessionMaxFromHistory = Math.ceil(percentile(weeklySessionBuckets, 75));
  const sessionMin = clamp(
    historyState === "none"
      ? starterPrior.recommended_sessions_per_week_range.min
      : Math.max(2, sessionMinFromHistory || (historyState === "rich" ? 4 : 3)),
    2,
    7,
  );
  const sessionMax = clamp(
    historyState === "none"
      ? starterPrior.recommended_sessions_per_week_range.max
      : Math.max(sessionMin + 1, sessionMaxFromHistory || (historyState === "rich" ? 7 : 6)),
    3,
    7,
  );

  const weekdayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;
  const preferredDays = weekdayCounts
    .map((count, index) => ({ day: weekdayNames[index], count }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map((item) => item.day);

  const learnedRampRate = learnIndividualRampRate(
    (input.completed_activities ?? []).map((activity) => ({
      occurred_at: activity.occurred_at,
      ...(activity.load === undefined ? {} : { load: activity.load }),
    })),
  );

  const trainingQuality = calculateRollingTrainingQuality(
    (input.completed_activities ?? []).map((activity) => ({
      occurred_at: activity.occurred_at,
      ...(activity.common_load === undefined ? {} : { common_load: activity.common_load }),
      ...(activity.zones === undefined ? {} : { zones: activity.zones }),
    })),
    28,
    safeAsOf,
  );

  const rationaleCodes = [
    `history_${historyState}`,
    `consistency_${consistencyMarker}`,
    `effort_${effortMarker}`,
    `profile_metrics_${profileMarker}`,
    ...(historyState === "none" ? starterPrior.rationale_codes : []),
  ];

  if (missingRequiredOnboardingFields.length > 0) {
    rationaleCodes.push("missing_required_onboarding_dob");
  }

  for (const missingField of missingOptionalCalibrationFields) {
    rationaleCodes.push(`missing_optional_${missingField}`);
  }

  if (input.activity_context?.primary_category) {
    rationaleCodes.push(`focus_${input.activity_context.primary_category}`);
  }

  for (const preferredDay of preferredDays) {
    rationaleCodes.push(`preferred_day_${preferredDay}`);
  }

  return creationContextSummarySchema.parse({
    history_availability_state: historyState,
    recent_consistency_marker: consistencyMarker,
    effort_confidence_marker: effortMarker,
    profile_metric_completeness_marker: profileMarker,
    is_youth: starterPrior.is_youth,
    signal_quality: Number(qualityScore.toFixed(3)),
    recommended_baseline_load_range: {
      min: baselineMin,
      max: Math.max(baselineMax, baselineMin + 20),
    },
    recommended_recent_influence_range: {
      min: Number(clamp(influenceBias - influenceWidth, -1, 1).toFixed(3)),
      max: Number(clamp(influenceBias + influenceWidth, -1, 1).toFixed(3)),
    },
    recommended_sessions_per_week_range: {
      min: sessionMin,
      max: sessionMax,
    },
    user_age: userAge,
    user_gender: userGender,
    max_sustainable_longTermLoad: maxSustainableLongTermLoad,
    missing_required_onboarding_fields: missingRequiredOnboardingFields,
    missing_optional_calibration_fields: missingOptionalCalibrationFields,
    learned_ramp_rate: {
      max_safe_ramp_rate: learnedRampRate.maxSafeRampRate,
      confidence: learnedRampRate.confidence,
    },
    training_quality: trainingQuality,
    rationale_codes: rationaleCodes,
  });
}

import {
  creationContextSummarySchema,
  type CreationContextSummary,
} from "../schemas/training_plan_structure";

export interface CreationCompletedActivitySignal {
  occurred_at: string;
  activity_category?: string | null;
  duration_seconds?: number | null;
  tss?: number | null;
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

export interface CreationProfileMetricsSignal {
  ftp?: number | null;
  threshold_hr?: number | null;
  weight_kg?: number | null;
  lthr?: number | null;
}

export interface DeriveCreationContextInput {
  completed_activities?: CreationCompletedActivitySignal[];
  efforts?: CreationEffortSignal[];
  activity_context?: CreationActivityContextSignal;
  profile_metrics?: CreationProfileMetricsSignal;
  as_of?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

function percentile(values: number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((q / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

/**
 * Derives a normalized creation context from profile evidence.
 *
 * Behavior:
 * - no data -> conservative ranges and low confidence
 * - rich data -> tighter ranges and higher confidence
 */
export function deriveCreationContext(
  input: DeriveCreationContextInput,
): CreationContextSummary {
  const asOf = input.as_of ? toDate(input.as_of) : new Date();
  const safeAsOf = asOf ?? new Date();
  const recentWindowDays = 42;

  const activities = (input.completed_activities ?? []).filter((activity) => {
    const date = toDate(activity.occurred_at);
    if (!date) return false;
    const ageDays = daysBetween(safeAsOf, date);
    return ageDays >= 0 && ageDays <= recentWindowDays;
  });

  const activityCount = activities.length;
  const historyState =
    activityCount === 0 ? "none" : activityCount < 10 ? "sparse" : "rich";

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

  const metrics = input.profile_metrics;
  const presentMetricCount = [
    metrics?.ftp,
    metrics?.threshold_hr,
    metrics?.weight_kg,
    metrics?.lthr,
  ].filter((value) => value !== null && value !== undefined).length;
  const metricCompleteness = clamp(presentMetricCount / 4, 0, 1);

  const consistencyMarker =
    consistencyRatio >= 0.7
      ? "high"
      : consistencyRatio >= 0.35
        ? "moderate"
        : "low";
  const effortMarker =
    effortCount >= 6 ? "high" : effortCount >= 2 ? "moderate" : "low";
  const profileMarker =
    metricCompleteness >= 0.75
      ? "high"
      : metricCompleteness >= 0.4
        ? "moderate"
        : "low";

  const qualityScore = clamp(
    (historyState === "rich" ? 0.45 : historyState === "sparse" ? 0.25 : 0.05) +
      consistencyRatio * 0.25 +
      clamp(effortCount / 8, 0, 1) * 0.15 +
      metricCompleteness * 0.15,
    0,
    1,
  );

  const weeklyTssBuckets = Array.from({ length: 6 }, () => 0);
  const weeklySessionBuckets = Array.from({ length: 6 }, () => 0);
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];

  for (const activity of activities) {
    const date = toDate(activity.occurred_at);
    if (!date) {
      continue;
    }

    const ageDays = daysBetween(safeAsOf, date);
    const weekBucket = clamp(Math.floor(ageDays / 7), 0, 5);
    const normalizedTss =
      activity.tss !== null && activity.tss !== undefined
        ? activity.tss
        : ((activity.duration_seconds ?? 0) / 3600) * 45;

    weeklyTssBuckets[weekBucket] =
      (weeklyTssBuckets[weekBucket] ?? 0) + Math.max(0, normalizedTss);
    weeklySessionBuckets[weekBucket] =
      (weeklySessionBuckets[weekBucket] ?? 0) + 1;
    const weekday = date.getUTCDay();
    weekdayCounts[weekday] = (weekdayCounts[weekday] ?? 0) + 1;
  }

  const weeklyTssMedian = percentile(weeklyTssBuckets, 50);
  const weeklyTssP25 = percentile(weeklyTssBuckets, 25);
  const weeklyTssP75 = percentile(weeklyTssBuckets, 75);
  const estimatedWeeklyTss =
    activityCount > 0
      ? Math.max(
          weeklyTssMedian,
          weeklyTssBuckets.reduce((a, b) => a + b, 0) / 6,
        )
      : 70;

  const baselineBounds =
    historyState === "none"
      ? { minFloor: 30, maxFloor: 60, maxCeil: 400 }
      : historyState === "sparse"
        ? { minFloor: 60, maxFloor: 100, maxCeil: 800 }
        : { minFloor: 80, maxFloor: 140, maxCeil: 1200 };

  const baselineSpreadFromHistory =
    weeklyTssP75 > 0 ? weeklyTssP75 - weeklyTssP25 : estimatedWeeklyTss * 0.35;
  const confidenceWidthMultiplier =
    historyState === "rich" ? 0.85 : historyState === "sparse" ? 1 : 1.25;
  const lowSignalExpansion = clamp((0.7 - qualityScore) * 0.4, 0, 0.25);
  const baselineWidthMultiplier =
    confidenceWidthMultiplier + lowSignalExpansion;
  const baselineMin = Math.round(
    clamp(
      estimatedWeeklyTss - baselineSpreadFromHistory * baselineWidthMultiplier,
      baselineBounds.minFloor,
      baselineBounds.maxCeil,
    ),
  );
  const baselineMax = Math.round(
    clamp(
      estimatedWeeklyTss + baselineSpreadFromHistory * baselineWidthMultiplier,
      baselineBounds.maxFloor,
      baselineBounds.maxCeil,
    ),
  );

  const influenceWidth =
    historyState === "rich" ? 0.15 : historyState === "sparse" ? 0.3 : 0.5;
  const influenceBias =
    consistencyRatio >= 0.65 ? 0.1 : consistencyRatio <= 0.2 ? -0.1 : 0;

  const sessionMinFromHistory = Math.floor(
    percentile(weeklySessionBuckets, 25),
  );
  const sessionMaxFromHistory = Math.ceil(percentile(weeklySessionBuckets, 75));
  const sessionMin = clamp(
    historyState === "none"
      ? 3
      : Math.max(2, sessionMinFromHistory || (historyState === "rich" ? 4 : 3)),
    2,
    7,
  );
  const sessionMax = clamp(
    historyState === "none"
      ? 5
      : Math.max(
          sessionMin + 1,
          sessionMaxFromHistory || (historyState === "rich" ? 7 : 6),
        ),
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

  const rationaleCodes = [
    `history_${historyState}`,
    `consistency_${consistencyMarker}`,
    `effort_${effortMarker}`,
    `profile_metrics_${profileMarker}`,
  ];

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
    signal_quality: Number(qualityScore.toFixed(3)),
    recommended_baseline_tss_range: {
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
    rationale_codes: rationaleCodes,
  });
}

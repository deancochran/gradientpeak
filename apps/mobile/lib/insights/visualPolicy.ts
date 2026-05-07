/**
 * Central policy for insight data source and chart-shape selection.
 * Add new mobile insight metrics here first so compact cards, detail views,
 * and accessibility metadata do not drift across Plan and Trends screens.
 */
export type InsightSource = "profileMetric" | "activityAnalysis" | "planForecast";

export type InsightVisualType =
  | "line"
  | "bar"
  | "scatter"
  | "stacked"
  | "calendarDots"
  | "rankedLollipop"
  | "loadMultiLine"
  | "readinessTrajectory";

export type CompactInsightLayout = "metricFooter" | "visualFirst" | "summaryFooter";

type InsightVisualPolicy = {
  source: InsightSource;
  visualType: InsightVisualType;
  compactLayout: CompactInsightLayout;
  rationale: string;
};

type ProfileMetricType = "weight_kg" | "vo2_max" | "resting_hr" | "hrv_rmssd" | "sleep_hours";

type ActivityInsightKind =
  | "trainingLoad"
  | "consistency"
  | "volume"
  | "activityEfforts"
  | "intensityMix"
  | "peakPower";

type PlanInsightKind = "loadComparison" | "readinessForecast";

const profileMetricPolicies = {
  weight_kg: {
    source: "profileMetric",
    visualType: "line",
    compactLayout: "metricFooter",
    rationale:
      "Weight is a direct profile measurement, so show trend over entries without aggregate fill.",
  },
  vo2_max: {
    source: "profileMetric",
    visualType: "line",
    compactLayout: "metricFooter",
    rationale: "VO2 max is a direct profile measurement, so show movement between readings.",
  },
  resting_hr: {
    source: "profileMetric",
    visualType: "line",
    compactLayout: "metricFooter",
    rationale: "Resting heart rate is a direct profile measurement best read as a baseline trend.",
  },
  hrv_rmssd: {
    source: "profileMetric",
    visualType: "line",
    compactLayout: "metricFooter",
    rationale: "HRV is a direct profile measurement best read against recent baseline movement.",
  },
  sleep_hours: {
    source: "profileMetric",
    visualType: "bar",
    compactLayout: "metricFooter",
    rationale:
      "Sleep is a discrete nightly measurement, so bars preserve one-entry-per-night semantics.",
  },
} satisfies Record<ProfileMetricType, InsightVisualPolicy>;

const activityInsightPolicies = {
  trainingLoad: {
    source: "activityAnalysis",
    visualType: "loadMultiLine",
    compactLayout: "visualFirst",
    rationale:
      "Training load is modeled from completed activities and needs CTL, ATL, and TSB trajectories.",
  },
  consistency: {
    source: "activityAnalysis",
    visualType: "calendarDots",
    compactLayout: "visualFirst",
    rationale:
      "Consistency is an activity-day rhythm, so calendar-aligned dots are clearer than a value chart.",
  },
  volume: {
    source: "activityAnalysis",
    visualType: "bar",
    compactLayout: "metricFooter",
    rationale:
      "Volume is bucketed completed activity work, so bars represent discrete aggregate buckets.",
  },
  activityEfforts: {
    source: "activityAnalysis",
    visualType: "scatter",
    compactLayout: "summaryFooter",
    rationale:
      "Efforts are irregular completed activities, so disconnected points avoid implying continuous sampling.",
  },
  intensityMix: {
    source: "activityAnalysis",
    visualType: "stacked",
    compactLayout: "visualFirst",
    rationale:
      "Intensity mix is a percent distribution and should remain normalized in a stacked visual.",
  },
  peakPower: {
    source: "activityAnalysis",
    visualType: "rankedLollipop",
    compactLayout: "metricFooter",
    rationale:
      "Peak power currently exposes ranked performances, so a ranked visual matches the available data.",
  },
} satisfies Record<ActivityInsightKind, InsightVisualPolicy>;

const planInsightPolicies = {
  loadComparison: {
    source: "planForecast",
    visualType: "loadMultiLine",
    compactLayout: "visualFirst",
    rationale:
      "Plan load compares actual, scheduled, and recommended trajectories rather than one aggregate value.",
  },
  readinessForecast: {
    source: "planForecast",
    visualType: "readinessTrajectory",
    compactLayout: "visualFirst",
    rationale:
      "Readiness is a forecast trajectory and should show actual, scheduled, and recommended paths with context.",
  },
} satisfies Record<PlanInsightKind, InsightVisualPolicy>;

export function getProfileMetricVisualPolicy(metricType: ProfileMetricType) {
  return profileMetricPolicies[metricType];
}

export function getActivityInsightVisualPolicy(kind: ActivityInsightKind) {
  return activityInsightPolicies[kind];
}

export function getPlanInsightVisualPolicy(kind: PlanInsightKind) {
  return planInsightPolicies[kind];
}

import {
  formatProfileMetricValue,
  type ProfileMetricType,
  profileMetricDefinitions,
  profileMetricTypes,
} from "@repo/core/athlete-inputs";

export type ProfileMetricGroup = {
  description: string;
  label: string;
  metrics: readonly ProfileMetricOption[];
};

export type ProfileMetricOption = {
  description: string;
  label: string;
  type: ProfileMetricType;
};

const descriptions: Record<ProfileMetricType, string> = {
  ftp: "Bike power threshold used to calibrate training load.",
  threshold_pace_seconds_per_km: "Sustainable running pace used for threshold and load zones.",
  css_seconds_per_100m: "Critical swim speed expressed as pace per 100 metres.",
  lthr: "Lactate-threshold heart rate used to anchor intensity zones.",
  max_hr: "Maximum heart-rate reference for intensity zones.",
  resting_hr: "Baseline cardiovascular recovery signal.",
  hrv_rmssd: "Morning readiness and autonomic stress trend.",
  sleep_hours: "Sleep duration for recovery context.",
  hydration_level: "Subjective hydration score.",
  stress_score: "Subjective stress score.",
  soreness_level: "Subjective soreness score.",
  wellness_score: "Overall wellness check-in.",
  weight_kg: "Body mass trend for load and power-to-weight context.",
  body_fat_percentage: "Body composition trend.",
  vo2_max: "Aerobic capacity estimates over time.",
};

function option(type: ProfileMetricType): ProfileMetricOption {
  return {
    description: descriptions[type],
    label: profileMetricDefinitions[type].label,
    type,
  };
}

export const profileMetricGroups = [
  {
    label: "Load Calibration",
    description: "Thresholds that directly calibrate sport-specific training load.",
    metrics: [
      option("ftp"),
      option("threshold_pace_seconds_per_km"),
      option("css_seconds_per_100m"),
      option("lthr"),
    ],
  },
  {
    label: "Supporting Physiology",
    description: "Heart-rate references that support interpretation and zones.",
    metrics: [option("max_hr")],
  },
  {
    label: "Recovery",
    description: "Daily signals that add readiness and recovery context.",
    metrics: [
      option("resting_hr"),
      option("hrv_rmssd"),
      option("sleep_hours"),
      option("hydration_level"),
      option("stress_score"),
      option("soreness_level"),
      option("wellness_score"),
    ],
  },
  {
    label: "Body/Aerobic",
    description: "Body composition and aerobic-capacity references.",
    metrics: [option("weight_kg"), option("body_fat_percentage"), option("vo2_max")],
  },
] as const satisfies readonly ProfileMetricGroup[];

export const profileMetricOptions = profileMetricGroups.flatMap((group) => group.metrics);

export function hasCanonicalProfileMetricCoverage(): boolean {
  const configured = new Set(profileMetricOptions.map((metric) => metric.type));
  return (
    profileMetricTypes.every((type) => configured.has(type)) &&
    configured.size === profileMetricTypes.length
  );
}

export function formatProfileMetricDisplayValue(input: {
  metric_type: ProfileMetricType;
  unit?: string | null;
  value: number;
}): string {
  return formatProfileMetricValue(input);
}

export function isManualProfileMetric(source?: string | null): boolean {
  return source === "manual";
}

export function formatObservationSource(source?: string | null): string {
  if (!source) return "Legacy / unknown";
  return source.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

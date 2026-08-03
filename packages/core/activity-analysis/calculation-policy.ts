import type { CanonicalActivityCategory } from "../schemas/activity-category";

export const activityThresholdMethodValues = [
  "power_threshold",
  "run_pace_threshold",
  "swim_pace_threshold",
  "heart_rate_threshold",
] as const;
export type ActivityThresholdMethod = (typeof activityThresholdMethodValues)[number];
export type ActivityPerformanceCurveKind =
  | "power_duration"
  | "grade_adjusted_speed_duration"
  | "swim_speed_duration";
export type ActivityPerformanceThresholdKind =
  | "planning_threshold_power"
  | "planning_threshold_pace"
  | "swimming_css";

export type CompletedActivityCalculationPolicy = {
  performanceCurve: ActivityPerformanceCurveKind | null;
  threshold: ActivityPerformanceThresholdKind | null;
  /** Ordered methods; an empty list is an intentional abstention policy. */
  thresholdMethods: readonly ActivityThresholdMethod[];
};

export const activityThresholdMethodsByActivityCategory = {
  run: ["run_pace_threshold", "heart_rate_threshold"],
  bike: ["power_threshold", "heart_rate_threshold"],
  swim: ["swim_pace_threshold", "heart_rate_threshold"],
  strength: ["heart_rate_threshold"],
  other: ["heart_rate_threshold"],
} as const satisfies Record<CanonicalActivityCategory, readonly ActivityThresholdMethod[]>;

/** Curve, threshold, and ordered Common Load evidence methods for every activity category. */
export const completedActivityCalculationPolicy = {
  run: {
    performanceCurve: "grade_adjusted_speed_duration",
    threshold: "planning_threshold_pace",
    thresholdMethods: ["run_pace_threshold", "heart_rate_threshold"],
  },
  bike: {
    performanceCurve: "power_duration",
    threshold: "planning_threshold_power",
    thresholdMethods: ["power_threshold", "heart_rate_threshold"],
  },
  swim: {
    performanceCurve: "swim_speed_duration",
    threshold: "swimming_css",
    thresholdMethods: ["swim_pace_threshold", "heart_rate_threshold"],
  },
  strength: {
    performanceCurve: null,
    threshold: null,
    thresholdMethods: ["heart_rate_threshold"],
  },
  other: {
    performanceCurve: null,
    threshold: null,
    thresholdMethods: ["heart_rate_threshold"],
  },
} as const satisfies Record<CanonicalActivityCategory, CompletedActivityCalculationPolicy>;

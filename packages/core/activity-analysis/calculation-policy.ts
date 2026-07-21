import type { CanonicalSport } from "../schemas/sport";

export const activityTssMethodValues = [
  "power_threshold",
  "critical_power_threshold",
  "run_pace_threshold",
  "swim_pace_threshold",
  "heart_rate_threshold",
] as const;
export type ActivityTssMethod = (typeof activityTssMethodValues)[number];
export const activityTssIdentityMethodValues = [
  ...activityTssMethodValues,
  "heart_rate_reserve",
] as const;
export type ActivityTssIdentityMethod = (typeof activityTssIdentityMethodValues)[number];
export type ActivityPerformanceCurveKind =
  | "power_duration"
  | "grade_adjusted_speed_duration"
  | "swim_speed_duration";
export type ActivityPerformanceThresholdKind =
  | "cycling_ftp"
  | "running_threshold_pace"
  | "swimming_css";

export type CompletedActivityCalculationPolicy = {
  performanceCurve: ActivityPerformanceCurveKind | null;
  threshold: ActivityPerformanceThresholdKind | null;
  /** Ordered methods; an empty list is an intentional abstention policy. */
  tssMethods: readonly ActivityTssMethod[];
};

/** Append-only compatibility for parsing historical calculation identities. */
export const activityTssCompatibleMethodsBySport = {
  run: ["run_pace_threshold", "heart_rate_threshold", "heart_rate_reserve"],
  bike: [
    "power_threshold",
    "critical_power_threshold",
    "heart_rate_threshold",
    "heart_rate_reserve",
  ],
  swim: ["swim_pace_threshold", "heart_rate_threshold", "heart_rate_reserve"],
  strength: ["heart_rate_threshold", "heart_rate_reserve"],
  other: ["heart_rate_threshold", "heart_rate_reserve"],
} as const satisfies Record<CanonicalSport, readonly ActivityTssIdentityMethod[]>;

/** Curve, threshold, and ordered IF/TSS methods for every canonical sport. */
export const completedActivityCalculationPolicy = {
  run: {
    performanceCurve: "grade_adjusted_speed_duration",
    threshold: "running_threshold_pace",
    tssMethods: ["run_pace_threshold", "heart_rate_threshold"],
  },
  bike: {
    performanceCurve: "power_duration",
    threshold: "cycling_ftp",
    tssMethods: ["power_threshold", "critical_power_threshold", "heart_rate_threshold"],
  },
  swim: {
    performanceCurve: "swim_speed_duration",
    threshold: "swimming_css",
    tssMethods: ["swim_pace_threshold", "heart_rate_threshold"],
  },
  strength: {
    performanceCurve: null,
    threshold: null,
    tssMethods: ["heart_rate_threshold"],
  },
  other: {
    performanceCurve: null,
    threshold: null,
    tssMethods: ["heart_rate_threshold"],
  },
} as const satisfies Record<CanonicalSport, CompletedActivityCalculationPolicy>;

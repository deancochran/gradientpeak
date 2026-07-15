import type { CanonicalSport } from "../schemas/sport";
import {
  type AthleteMetricRole,
  type AthleteMetricType,
  athleteMetricRoleByType,
} from "./evidence-contracts";
import type { CalculationPolicyId } from "./policy-descriptors";

export type CanonicalMetricUnit =
  | "watts"
  | "seconds_per_km"
  | "seconds_per_100m"
  | "beats_per_minute"
  | "milliliters_per_kilogram_per_minute"
  | "kilograms"
  | "milliseconds"
  | "hours"
  | "score"
  | "years";

export type MetricDefinition = Readonly<{
  canonicalUnit: CanonicalMetricUnit;
  role: AthleteMetricRole;
  supportedPolicies: readonly CalculationPolicyId[];
  supportedSports: readonly CanonicalSport[] | "any";
}>;

/**
 * The closed vocabulary of athlete metrics accepted by calculation policies.
 * Provider aliases and conversions remain adapter concerns outside Core.
 */
export const metricCatalog = Object.freeze({
  ftp: {
    canonicalUnit: "watts",
    role: athleteMetricRoleByType.ftp,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: ["bike"],
  },
  threshold_pace_seconds_per_km: {
    canonicalUnit: "seconds_per_km",
    role: athleteMetricRoleByType.threshold_pace_seconds_per_km,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: ["run"],
  },
  css_seconds_per_100m: {
    canonicalUnit: "seconds_per_100m",
    role: athleteMetricRoleByType.css_seconds_per_100m,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: ["swim"],
  },
  lthr: {
    canonicalUnit: "beats_per_minute",
    role: athleteMetricRoleByType.lthr,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: "any",
  },
  max_hr: {
    canonicalUnit: "beats_per_minute",
    role: athleteMetricRoleByType.max_hr,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: "any",
  },
  resting_hr: {
    canonicalUnit: "beats_per_minute",
    role: athleteMetricRoleByType.resting_hr,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: "any",
  },
  vo2_max: {
    canonicalUnit: "milliliters_per_kilogram_per_minute",
    role: athleteMetricRoleByType.vo2_max,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: "any",
  },
  weight_kg: {
    canonicalUnit: "kilograms",
    role: athleteMetricRoleByType.weight_kg,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: "any",
  },
  hrv_rmssd: {
    canonicalUnit: "milliseconds",
    role: athleteMetricRoleByType.hrv_rmssd,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: "any",
  },
  sleep_hours: {
    canonicalUnit: "hours",
    role: athleteMetricRoleByType.sleep_hours,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: "any",
  },
  stress_score: {
    canonicalUnit: "score",
    role: athleteMetricRoleByType.stress_score,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: "any",
  },
  soreness_level: {
    canonicalUnit: "score",
    role: athleteMetricRoleByType.soreness_level,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: "any",
  },
  wellness_score: {
    canonicalUnit: "score",
    role: athleteMetricRoleByType.wellness_score,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: "any",
  },
  age_years: {
    canonicalUnit: "years",
    role: athleteMetricRoleByType.age_years,
    supportedPolicies: ["physiology-metrics"],
    supportedSports: "any",
  },
} as const satisfies Record<AthleteMetricType, MetricDefinition>);

export type MetricCatalog = typeof metricCatalog;

import type {
  CalibrationActivityCategory,
  CalibrationIdentity,
  CalibrationMetricKey,
} from "./contracts";

export const PERFORMANCE_CALIBRATION_POLICY_VERSION = "performance-calibration-v1" as const;
export const PERFORMANCE_CALIBRATION_EXPIRY_DAYS = 90 as const;
export const PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY = Object.freeze({
  expiryDays: PERFORMANCE_CALIBRATION_EXPIRY_DAYS,
  maximumSelectionCandidates: 64,
  confirmation: Object.freeze({ evidenceCount: 2, minimumDaySpan: 7, maximumDaySpan: 42 }),
  decrease: Object.freeze({ evidenceCount: 3, minimumDaySpan: 14, maximumDaySpan: 56 }),
  heartRateChange: Object.freeze({ evidenceCount: 3, minimumDaySpan: 14, maximumDaySpan: 56 }),
  relativeTolerance: 0.03,
  heartRateToleranceBpm: 3,
  materialRelativeChange: 0.03,
  materialHeartRateChangeBpm: 4,
});

export type CalibrationRegistryEntry = Readonly<{
  identity: CalibrationIdentity;
  canonicalUnit: "watts" | "meters_per_second" | "beats_per_minute";
  productLabel: string;
  policyVersion: typeof PERFORMANCE_CALIBRATION_POLICY_VERSION;
  expiryDays: typeof PERFORMANCE_CALIBRATION_EXPIRY_DAYS;
  initialSelectionPolicy: "provisional" | "confirmed_complete_protocol";
  targetConsumer: string;
  calculationEntrypoint:
    | "bike_duration_performance"
    | "run_threshold_speed_30m"
    | "swim_css_400m_200m"
    | "threshold_heart_rate_30m";
}>;

const entries = [
  [
    "threshold_power",
    "bike",
    "watts",
    "FTP / Bike Threshold Power",
    "power zones, bike load, and bike plan targets",
    "bike_duration_performance",
    "provisional",
  ],
  [
    "threshold_speed",
    "run",
    "meters_per_second",
    "Run Threshold Pace",
    "run pace zones and plan targets",
    "run_threshold_speed_30m",
    "provisional",
  ],
  [
    "threshold_speed",
    "swim",
    "meters_per_second",
    "CSS",
    "swim pace targets and load",
    "swim_css_400m_200m",
    "confirmed_complete_protocol",
  ],
  [
    "threshold_heart_rate",
    "bike",
    "beats_per_minute",
    "Bike LTHR",
    "bike HR zones and HR-load fallback",
    "threshold_heart_rate_30m",
    "provisional",
  ],
  [
    "threshold_heart_rate",
    "run",
    "beats_per_minute",
    "Run LTHR",
    "run HR zones and HR-load fallback",
    "threshold_heart_rate_30m",
    "provisional",
  ],
] as const satisfies readonly (readonly [
  CalibrationMetricKey,
  CalibrationActivityCategory,
  CalibrationRegistryEntry["canonicalUnit"],
  string,
  string,
  CalibrationRegistryEntry["calculationEntrypoint"],
  CalibrationRegistryEntry["initialSelectionPolicy"],
])[];

export const performanceCalibrationRegistry: readonly CalibrationRegistryEntry[] = Object.freeze(
  entries.map(
    ([
      metricKey,
      activityCategory,
      canonicalUnit,
      productLabel,
      targetConsumer,
      calculationEntrypoint,
      initialSelectionPolicy,
    ]) =>
      Object.freeze({
        identity: Object.freeze({ metricKey, activityCategory }),
        canonicalUnit,
        productLabel,
        policyVersion: PERFORMANCE_CALIBRATION_POLICY_VERSION,
        expiryDays: PERFORMANCE_CALIBRATION_EXPIRY_DAYS,
        initialSelectionPolicy,
        targetConsumer,
        calculationEntrypoint,
      }),
  ),
);

export function calibrationIdentityKey(identity: CalibrationIdentity): string {
  return `${identity.metricKey}/${identity.activityCategory}`;
}

export function getCalibrationRegistryEntriesForCategory(
  activityCategory: CalibrationActivityCategory,
): readonly CalibrationRegistryEntry[] {
  return performanceCalibrationRegistry.filter(
    (entry) => entry.identity.activityCategory === activityCategory,
  );
}

export function getCalibrationRegistryEntry(
  identity: CalibrationIdentity,
): CalibrationRegistryEntry | null {
  return (
    performanceCalibrationRegistry.find(
      (entry) => calibrationIdentityKey(entry.identity) === calibrationIdentityKey(identity),
    ) ?? null
  );
}

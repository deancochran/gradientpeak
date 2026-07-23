import type { ActivityEffortThresholdEvidence } from "./activity-effort-policy";

export const canonicalThresholdTypes = [
  "cycling_ftp",
  "running_threshold_pace",
  "swimming_css",
] as const;

export type CanonicalThresholdType = (typeof canonicalThresholdTypes)[number];
export type ThresholdMetricSource =
  | "manual"
  | "validated_test"
  | "provider"
  | "modeled"
  | "estimated";
export type ActivityEffortObservationKind = "actual" | "modeled" | "derived";
export type ThresholdConfidence = "high" | "medium" | "low" | "unknown";
export type ThresholdEligibilityReason =
  | "eligible"
  | "stale"
  | "not_actual"
  | "unsupported_effort"
  | "invalid_value"
  | "unknown";

/** A direct threshold value already expressed in the canonical unit for its threshold type. */
export interface DirectThresholdMetricObservation {
  threshold: CanonicalThresholdType;
  value: number;
  observedAt: string;
  source: ThresholdMetricSource;
  calculationVersion?: string | null;
  locked?: boolean;
}

/** A best-effort observation used to calculate a threshold when it is an actual effort. */
export interface ThresholdActivityEffortObservation {
  sport: "bike" | "run" | "swim";
  metric: "power" | "speed";
  value: number;
  durationSeconds: number;
  observedAt: string;
  observationKind: ActivityEffortObservationKind;
  /** Verified origin; an `actual` flag alone is not enough to establish eligibility. */
  evidence?: ActivityEffortThresholdEvidence;
}

export interface ResolvedCanonicalThreshold {
  threshold: CanonicalThresholdType;
  value: number | null;
  unit: "W" | "seconds_per_km" | "seconds_per_100m";
  source:
    | "manual"
    | "validated_test"
    | "observed_effort"
    | "provider"
    | "modeled"
    | "estimated"
    | "unknown";
  observedAt: string | null;
  confidence: ThresholdConfidence;
  stale: boolean;
  eligibilityReason: ThresholdEligibilityReason;
  /** True when the value is inferred rather than a directly supplied threshold measurement. */
  estimate: boolean;
  calculationVersion: string | null;
}

export interface ResolveCanonicalThresholdsInput {
  now: string;
  freshnessWindowMs: number;
  directMetrics?: readonly DirectThresholdMetricObservation[];
  activityEfforts?: readonly ThresholdActivityEffortObservation[];
  criticalPower?: CriticalPowerThresholdCandidate | null;
}

export interface CriticalPowerThresholdCandidate {
  valueWatts: number;
  observedAt: string;
  evidenceFingerprint: string;
  calculationVersion: string;
}

export type ResolvedCyclingPowerCalibration = Omit<ResolvedCanonicalThreshold, "threshold"> & {
  kind: "ftp" | "critical_power" | "unknown";
  evidenceFingerprint: string | null;
};

export type ResolvedCanonicalThresholds = Record<
  CanonicalThresholdType,
  ResolvedCanonicalThreshold
> & {
  cycling_power: ResolvedCyclingPowerCalibration;
};

export function getEligibleThresholdValue(
  threshold: Pick<
    ResolvedCanonicalThreshold | ResolvedCyclingPowerCalibration,
    "value" | "stale" | "eligibilityReason"
  >,
): number | null {
  return threshold.value !== null && !threshold.stale && threshold.eligibilityReason === "eligible"
    ? threshold.value
    : null;
}

const thresholdDefinitions = {
  cycling_ftp: { unit: "W", sport: "bike", metric: "power" },
  running_threshold_pace: { unit: "seconds_per_km", sport: "run", metric: "speed" },
  swimming_css: { unit: "seconds_per_100m", sport: "swim", metric: "speed" },
} as const;

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFresh(observedAt: string, now: number, freshnessWindowMs: number): boolean {
  const observed = timestamp(observedAt);
  return observed !== null && observed <= now && now - observed <= freshnessWindowMs;
}

function strongest<T extends { observedAt: string; value: number }>(items: readonly T[]): T | null {
  return (
    items.reduce<T | null>((selected, item) => {
      if (!selected || item.value > selected.value) return item;
      if (item.value < selected.value) return selected;
      const itemTimestamp = timestamp(item.observedAt);
      const selectedTimestamp = timestamp(selected.observedAt);
      return itemTimestamp !== null &&
        (selectedTimestamp === null || itemTimestamp > selectedTimestamp)
        ? item
        : selected;
    }, null) ?? null
  );
}

function latest<T extends { observedAt: string }>(items: readonly T[]): T | null {
  return items.reduce<T | null>((selected, item) => {
    const observedAt = timestamp(item.observedAt);
    if (observedAt === null) return selected;
    if (!selected) return item;
    const selectedAt = timestamp(selected.observedAt);
    return selectedAt === null || observedAt > selectedAt ? item : selected;
  }, null);
}

function resolvedDirectMetric(
  threshold: CanonicalThresholdType,
  definition: (typeof thresholdDefinitions)[CanonicalThresholdType],
  metric: DirectThresholdMetricObservation,
  now: number,
  freshnessWindowMs: number,
): ResolvedCanonicalThreshold {
  const stale = !isFresh(metric.observedAt, now, freshnessWindowMs);
  return {
    threshold,
    value: metric.value,
    unit: definition.unit,
    source: metric.source,
    observedAt: metric.observedAt,
    confidence:
      metric.source === "manual" || metric.source === "validated_test"
        ? "high"
        : metric.source === "provider"
          ? "medium"
          : "low",
    stale,
    eligibilityReason: stale ? "stale" : "eligible",
    estimate: metric.source === "modeled" || metric.source === "estimated",
    calculationVersion: metric.calculationVersion ?? null,
  };
}

function resolveEffortValue(
  threshold: CanonicalThresholdType,
  effort: ThresholdActivityEffortObservation,
): number {
  if (threshold === "cycling_ftp") return effort.value * 0.95;
  return threshold === "running_threshold_pace" ? 1000 / effort.value : 100 / effort.value;
}

function unknown(threshold: CanonicalThresholdType): ResolvedCanonicalThreshold {
  return {
    threshold,
    value: null,
    unit: thresholdDefinitions[threshold].unit,
    source: "unknown",
    observedAt: null,
    confidence: "unknown",
    stale: false,
    eligibilityReason: "unknown",
    estimate: false,
    calculationVersion: null,
  };
}

/**
 * Resolves a threshold without persistence or runtime dependencies.
 *
 * Resolves the accepted evidence hierarchy: fresh locked manual override, fresh validated test,
 * fresh observed activity evidence, unlocked manual value, provider seed, modeled/estimated seed,
 * then unknown. Stale seeds remain explicit so downstream policies can abstain without losing the
 * athlete's last known value.
 */
export function resolveCanonicalThresholds(
  input: ResolveCanonicalThresholdsInput,
): ResolvedCanonicalThresholds {
  const now = timestamp(input.now);
  const directMetrics = input.directMetrics ?? [];
  const activityEfforts = input.activityEfforts ?? [];

  const thresholds = Object.fromEntries(
    canonicalThresholdTypes.map((threshold) => {
      const definition = thresholdDefinitions[threshold];
      if (
        now === null ||
        !Number.isFinite(input.freshnessWindowMs) ||
        input.freshnessWindowMs < 0
      ) {
        return [threshold, unknown(threshold)];
      }

      const eligibleDirectMetrics = directMetrics.filter((candidate) => {
        const observedAt = timestamp(candidate.observedAt);
        return (
          candidate.threshold === threshold &&
          Number.isFinite(candidate.value) &&
          candidate.value > 0 &&
          observedAt !== null &&
          observedAt <= now
        );
      });
      const lockedManual = latest(
        eligibleDirectMetrics.filter(
          (candidate) =>
            candidate.source === "manual" &&
            candidate.locked === true &&
            isFresh(candidate.observedAt, now, input.freshnessWindowMs),
        ),
      );
      if (lockedManual) {
        return [
          threshold,
          resolvedDirectMetric(threshold, definition, lockedManual, now, input.freshnessWindowMs),
        ];
      }

      const validatedTest = latest(
        eligibleDirectMetrics.filter(
          (candidate) =>
            candidate.source === "validated_test" &&
            isFresh(candidate.observedAt, now, input.freshnessWindowMs),
        ),
      );
      if (validatedTest) {
        return [
          threshold,
          resolvedDirectMetric(threshold, definition, validatedTest, now, input.freshnessWindowMs),
        ];
      }

      const effort = strongest(
        activityEfforts.filter(
          (candidate) =>
            candidate.sport === definition.sport &&
            candidate.metric === definition.metric &&
            candidate.durationSeconds === 1200 &&
            candidate.observationKind === "actual" &&
            candidate.evidence !== undefined &&
            Number.isFinite(candidate.value) &&
            candidate.value > 0 &&
            isFresh(candidate.observedAt, now, input.freshnessWindowMs),
        ),
      );
      if (effort) {
        return [
          threshold,
          {
            threshold,
            value: resolveEffortValue(threshold, effort),
            unit: definition.unit,
            source: "observed_effort",
            observedAt: effort.observedAt,
            confidence: "medium",
            stale: false,
            eligibilityReason: "eligible",
            estimate: true,
            calculationVersion: "twenty_minute_effort_v1",
          },
        ];
      }

      const fallbackSourceOrder: readonly (readonly ThresholdMetricSource[])[] = [
        ["manual"],
        ["provider"],
        ["modeled", "estimated"],
      ];
      for (const sources of fallbackSourceOrder) {
        const metric = latest(
          eligibleDirectMetrics.filter((candidate) => sources.includes(candidate.source)),
        );
        if (metric) {
          return [
            threshold,
            resolvedDirectMetric(threshold, definition, metric, now, input.freshnessWindowMs),
          ];
        }
      }

      return [threshold, unknown(threshold)];
    }),
  ) as Record<CanonicalThresholdType, ResolvedCanonicalThreshold>;

  return {
    ...thresholds,
    cycling_power: resolveCyclingPowerCalibration(input, thresholds.cycling_ftp),
  };
}

function resolveCyclingPowerCalibration(
  input: ResolveCanonicalThresholdsInput,
  ftp: ResolvedCanonicalThreshold,
): ResolvedCyclingPowerCalibration {
  const now = timestamp(input.now);
  if (now === null || !Number.isFinite(input.freshnessWindowMs) || input.freshnessWindowMs < 0) {
    return cyclingPowerFromThreshold(ftp, "unknown");
  }

  const criticalPower = input.criticalPower;
  if (
    (ftp.value === null || ftp.stale || ftp.eligibilityReason !== "eligible") &&
    criticalPower &&
    Number.isFinite(criticalPower.valueWatts) &&
    criticalPower.valueWatts > 0 &&
    criticalPower.evidenceFingerprint.trim().length > 0 &&
    criticalPower.calculationVersion.trim().length > 0 &&
    isFresh(criticalPower.observedAt, now, input.freshnessWindowMs)
  ) {
    return {
      kind: "critical_power",
      value: criticalPower.valueWatts,
      unit: "W",
      source: "observed_effort",
      observedAt: criticalPower.observedAt,
      confidence: "medium",
      stale: false,
      eligibilityReason: "eligible",
      estimate: true,
      calculationVersion: criticalPower.calculationVersion,
      evidenceFingerprint: criticalPower.evidenceFingerprint,
    };
  }

  return cyclingPowerFromThreshold(ftp, ftp.value === null ? "unknown" : "ftp");
}

function cyclingPowerFromThreshold(
  threshold: ResolvedCanonicalThreshold,
  kind: ResolvedCyclingPowerCalibration["kind"],
): ResolvedCyclingPowerCalibration {
  const { threshold: _threshold, ...calibration } = threshold;
  return { ...calibration, kind, evidenceFingerprint: null };
}

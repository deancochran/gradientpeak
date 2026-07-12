export const canonicalThresholdTypes = [
  "cycling_ftp",
  "running_threshold_pace",
  "swimming_css",
] as const;

export type CanonicalThresholdType = (typeof canonicalThresholdTypes)[number];
export type ThresholdMetricSource = "manual" | "provider" | "modeled" | "estimated";
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
}

export interface ResolvedCanonicalThreshold {
  threshold: CanonicalThresholdType;
  value: number | null;
  unit: "W" | "s/1000m" | "s/100m";
  source: "manual" | "observed_effort" | "provider" | "modeled" | "estimated" | "unknown";
  observedAt: string | null;
  confidence: ThresholdConfidence;
  stale: boolean;
  eligibilityReason: ThresholdEligibilityReason;
}

export interface ResolveCanonicalThresholdsInput {
  now: string;
  freshnessWindowMs: number;
  directMetrics?: readonly DirectThresholdMetricObservation[];
  activityEfforts?: readonly ThresholdActivityEffortObservation[];
}

const thresholdDefinitions = {
  cycling_ftp: { unit: "W", sport: "bike", metric: "power" },
  running_threshold_pace: { unit: "s/1000m", sport: "run", metric: "speed" },
  swimming_css: { unit: "s/100m", sport: "swim", metric: "speed" },
} as const;

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFresh(observedAt: string, now: number, freshnessWindowMs: number): boolean {
  const observed = timestamp(observedAt);
  return observed !== null && observed <= now && now - observed <= freshnessWindowMs;
}

function latest<T extends { observedAt: string }>(items: readonly T[]): T | null {
  return (
    items.reduce<T | null>((selected, item) => {
      if (timestamp(item.observedAt) === null) return selected;
      if (!selected || timestamp(item.observedAt)! > timestamp(selected.observedAt)!) return item;
      return selected;
    }, null) ?? null
  );
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
  };
}

/**
 * Resolves a threshold without persistence or runtime dependencies.
 *
 * Precedence is a fresh locked manual metric, a fresh actual 20-minute effort,
 * then direct manual, provider, modeled, and estimated values. Derived or
 * modeled efforts are intentionally never considered observed efforts.
 */
export function resolveCanonicalThresholds(
  input: ResolveCanonicalThresholdsInput,
): Record<CanonicalThresholdType, ResolvedCanonicalThreshold> {
  const now = timestamp(input.now);
  const directMetrics = input.directMetrics ?? [];
  const activityEfforts = input.activityEfforts ?? [];

  return Object.fromEntries(
    canonicalThresholdTypes.map((threshold) => {
      const definition = thresholdDefinitions[threshold];
      if (
        now === null ||
        !Number.isFinite(input.freshnessWindowMs) ||
        input.freshnessWindowMs < 0
      ) {
        return [threshold, unknown(threshold)];
      }

      const metrics = directMetrics.filter(
        (metric) =>
          metric.threshold === threshold &&
          Number.isFinite(metric.value) &&
          metric.value > 0 &&
          timestamp(metric.observedAt) !== null,
      );
      const lockedManual = latest(
        metrics.filter(
          (metric) =>
            metric.source === "manual" &&
            metric.locked &&
            isFresh(metric.observedAt, now, input.freshnessWindowMs),
        ),
      );
      if (lockedManual) {
        return [threshold, directResult(threshold, lockedManual, false, "eligible", "high")];
      }

      const effort = latest(
        activityEfforts.filter(
          (candidate) =>
            candidate.sport === definition.sport &&
            candidate.metric === definition.metric &&
            candidate.durationSeconds === 1200 &&
            candidate.observationKind === "actual" &&
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
            confidence: "high",
            stale: false,
            eligibilityReason: "eligible",
          },
        ];
      }

      for (const source of ["manual", "provider", "modeled", "estimated"] as const) {
        const metric = latest(metrics.filter((candidate) => candidate.source === source));
        if (metric) {
          const stale = !isFresh(metric.observedAt, now, input.freshnessWindowMs);
          return [
            threshold,
            directResult(
              threshold,
              metric,
              stale,
              stale ? "stale" : "eligible",
              source === "manual" ? "high" : source === "provider" ? "medium" : "low",
            ),
          ];
        }
      }

      return [threshold, unknown(threshold)];
    }),
  ) as Record<CanonicalThresholdType, ResolvedCanonicalThreshold>;
}

function directResult(
  threshold: CanonicalThresholdType,
  metric: DirectThresholdMetricObservation,
  stale: boolean,
  eligibilityReason: ThresholdEligibilityReason,
  confidence: ThresholdConfidence,
): ResolvedCanonicalThreshold {
  return {
    threshold,
    value: metric.value,
    unit: thresholdDefinitions[threshold].unit,
    source: metric.source,
    observedAt: metric.observedAt,
    confidence,
    stale,
    eligibilityReason,
  };
}

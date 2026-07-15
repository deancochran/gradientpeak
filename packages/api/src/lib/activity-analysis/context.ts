import type { ActivityAnalysisContext, ActivityCalibrationQuality } from "@repo/core";
import {
  canonicalizeActivityEffortObservation,
  type DirectThresholdMetricObservation,
  getActivityEffortThresholdEvidence,
  resolveCanonicalThresholds,
  type ThresholdActivityEffortObservation,
  type ThresholdMetricSource,
} from "@repo/core/athlete-inputs";
import type {
  ActivityAnalysisContextSnapshot,
  ActivityAnalysisMetricSnapshot,
  ActivityAnalysisStore,
} from "../../repositories";
import {
  filterSupersededProfileOverrides,
  isActiveManualFtpOverride,
  resolveLatestObservationsByKey,
} from "../../utils/profile-override-observations";

type ResolveActivityContextAsOfInput = {
  store: ActivityAnalysisStore;
  profileId: string;
  activityTimestamp: string | Date;
  activityId?: string;
  evidenceScope?: "thresholds";
};

type LthrSport = "bike" | "run" | "swim";
type ResolvedActivityAnalysisContext = Omit<ActivityAnalysisContext, "profileMetrics"> & {
  profileMetrics: ActivityAnalysisContext["profileMetrics"] & {
    lthr_by_sport?: Partial<Record<LthrSport, number>>;
  };
};

export async function resolveActivityContextAsOf(
  input: ResolveActivityContextAsOfInput,
): Promise<ResolvedActivityAnalysisContext> {
  const { store, profileId, activityTimestamp, activityId, evidenceScope } = input;
  const asOf = activityTimestamp instanceof Date ? activityTimestamp : new Date(activityTimestamp);
  const evidence = store.loadContextEvidence
    ? ((await store.loadContextEvidence({ requests: [{ asOf, profileId }], evidenceScope })).get(
        profileId,
      ) ?? emptyContextEvidence)
    : await store.getContextSnapshot({ asOf, profileId, evidenceScope });
  return resolveActivityContextFromEvidence({
    activityTimestamp: asOf,
    activityId,
    evidence,
  });
}

const emptyContextEvidence: ActivityAnalysisContextSnapshot = {
  profile: { dob: null, gender: null },
  profileMetrics: [],
  recentEfforts: [],
};

export function resolveActivityContextFromEvidence(input: {
  activityTimestamp: string | Date;
  activityId?: string;
  evidence: ActivityAnalysisContextSnapshot;
}): ResolvedActivityAnalysisContext {
  const asOf =
    input.activityTimestamp instanceof Date
      ? input.activityTimestamp
      : new Date(input.activityTimestamp);
  const snapshot = input.evidence;
  const cutoff = asOf.getTime();

  const profileMetrics: ResolvedActivityAnalysisContext["profileMetrics"] = {};
  const metricRows = snapshot.profileMetrics
    .filter(
      (metric) =>
        new Date(metric.recorded_at).getTime() <= cutoff &&
        (!input.activityId || metric.reference_activity_id !== input.activityId),
    )
    .sort(compareRecordedAtDesc);
  const latestMetrics = resolveLatestObservationsByKey(
    metricRows.filter((metric) => metric.metric_type !== "lthr" || isLthrUnit(metric.unit)),
    metricObservationKey,
  );
  const typedMetrics = [...latestMetrics.values()].filter((metric) => metric !== null);
  const effortRows = snapshot.recentEfforts
    .filter(
      (effort) =>
        new Date(effort.recorded_at).getTime() <= cutoff &&
        (!input.activityId || effort.activity_id !== input.activityId),
    )
    .sort(compareRecordedAtDesc);
  const typedEfforts = filterSupersededProfileOverrides(
    effortRows,
    (effort) =>
      `${effort.activity_category}:${effort.effort_type}:${effort.duration_seconds}:${effort.unit}`,
  );
  const freshnessWindowMs = 90 * 24 * 60 * 60 * 1000;
  const thresholdEfforts = typedEfforts.filter((effort) => {
    if (isActiveManualFtpOverride(effort)) return true;
    if (effort.duration_seconds !== 1200) return false;
    return (
      (effort.activity_category === "bike" && effort.effort_type === "power") ||
      ((effort.activity_category === "run" || effort.activity_category === "swim") &&
        effort.effort_type === "speed")
    );
  });

  for (const metric of typedMetrics) {
    const metricValue = toNumber(metric.value);
    if (metricValue == null) continue;

    if (metric.metric_type === "weight_kg" && profileMetrics.weight_kg == null) {
      profileMetrics.weight_kg = metricValue;
      continue;
    }

    if (metric.metric_type === "resting_hr" && profileMetrics.resting_hr == null) {
      profileMetrics.resting_hr = metricValue;
      continue;
    }

    if (metric.metric_type === "max_hr" && profileMetrics.max_hr == null) {
      profileMetrics.max_hr = metricValue;
      continue;
    }

    if (metric.metric_type === "lthr") {
      const sport = lthrReferenceSport(metric);
      if (sport) {
        profileMetrics.lthr_by_sport ??= {};
        profileMetrics.lthr_by_sport[sport] = metricValue;
      } else if (profileMetrics.lthr == null) {
        profileMetrics.lthr = metricValue;
      }
    }
  }

  if (latestMetrics.get("weight_kg") === null) profileMetrics.weight_kg = null;
  if (latestMetrics.get("lthr:generic") === null) profileMetrics.lthr = null;

  const directThresholdMetrics = typedMetrics.flatMap(
    (metric): DirectThresholdMetricObservation[] => {
      const directMetric = toDirectThresholdMetric(metric, asOf);
      return directMetric ? [directMetric] : [];
    },
  );
  const manualFtpMetrics = thresholdEfforts.flatMap((effort): DirectThresholdMetricObservation[] =>
    isActiveManualFtpOverride(effort)
      ? [
          {
            threshold: "cycling_ftp",
            value: effort.value * 0.95,
            observedAt: toIsoString(effort.recorded_at) ?? asOf.toISOString(),
            source: "manual",
            locked: true,
          },
        ]
      : [],
  );
  const thresholds = resolveCanonicalThresholds({
    now: asOf.toISOString(),
    freshnessWindowMs,
    directMetrics: [...directThresholdMetrics, ...manualFtpMetrics],
    activityEfforts: thresholdEfforts.flatMap((effort): ThresholdActivityEffortObservation[] => {
      if (isActiveManualFtpOverride(effort)) return [];
      const canonicalPower =
        effort.activity_category === "bike" && effort.effort_type === "power" && effort.unit
          ? canonicalizeActivityEffortObservation({
              effortType: "power",
              value: effort.value,
              unit: effort.unit,
            })
          : null;
      const thresholdEvidence = getActivityEffortThresholdEvidence({
        activityCategory: effort.activity_category,
        effortType: effort.effort_type,
        durationSeconds: effort.duration_seconds,
        value: effort.value,
        unit: effort.unit,
        activityId: effort.activity_id,
        source: effort.source,
        method: effort.method,
        provenance: effort.provenance,
      });
      const observationKind = thresholdEvidence ? ("actual" as const) : ("derived" as const);
      const value = normalizeSpeedMetersPerSecond(effort.value, effort.unit);
      if (effort.duration_seconds !== 1200) return [];
      if (effort.activity_category === "bike" && effort.effort_type === "power") {
        if (!canonicalPower || canonicalPower.unit !== "watts") return [];
        return [
          {
            sport: "bike" as const,
            metric: "power" as const,
            value: canonicalPower.value,
            durationSeconds: 1200,
            observedAt: toIsoString(effort.recorded_at) ?? asOf.toISOString(),
            observationKind,
            evidence: thresholdEvidence ?? undefined,
          },
        ];
      }
      if (
        effort.effort_type === "speed" &&
        (effort.activity_category === "run" || effort.activity_category === "swim") &&
        value !== null
      ) {
        return [
          {
            sport: effort.activity_category,
            metric: "speed" as const,
            value,
            durationSeconds: 1200,
            observedAt: toIsoString(effort.recorded_at) ?? asOf.toISOString(),
            observationKind,
            evidence: thresholdEvidence ?? undefined,
          },
        ];
      }
      return [];
    }),
  });

  profileMetrics.ftp =
    thresholds.cycling_ftp.value === null ? null : Math.round(thresholds.cycling_ftp.value);
  profileMetrics.threshold_speed_mps =
    thresholds.running_threshold_pace.value === null
      ? null
      : 1000 / thresholds.running_threshold_pace.value;
  profileMetrics.swim_threshold_speed_mps =
    thresholds.swimming_css.value === null ? null : 100 / thresholds.swimming_css.value;

  const activityTimestampIso = asOf.toISOString();

  return {
    profileMetrics,
    calibrationQuality: {
      ftp: thresholdQuality(thresholds.cycling_ftp),
      runThreshold: thresholdQuality(thresholds.running_threshold_pace),
      swimThreshold: thresholdQuality(thresholds.swimming_css),
      lthr: metricQuality(latestMetrics.get("lthr:generic"), asOf, freshnessWindowMs),
      lthrBySport: Object.fromEntries(
        (["bike", "run", "swim"] as const).flatMap((sport) => {
          const quality = metricQuality(
            latestMetrics.get(`lthr:${sport}`),
            asOf,
            freshnessWindowMs,
          );
          return quality ? [[sport, quality] as const] : [];
        }),
      ),
    },
    recentEfforts: typedEfforts.slice(0, 50).map((effort) => ({
      recorded_at: toIsoString(effort.recorded_at) ?? activityTimestampIso,
      effort_type: effort.effort_type,
      duration_seconds: effort.duration_seconds,
      value: effort.value,
      unit: effort.unit,
      activity_category: effort.activity_category,
    })),
    profile: {
      dob: toIsoString(snapshot.profile.dob ?? null),
      gender: normalizeGender(snapshot.profile.gender ?? null),
    },
  };
}

function thresholdQuality(threshold: {
  source: ActivityCalibrationQuality["source"];
  observedAt: string | null;
  confidence: ActivityCalibrationQuality["confidence"];
  stale: boolean;
  estimate: boolean;
  calculationVersion: string | null;
}): ActivityCalibrationQuality | null {
  if (threshold.source === "unknown") return null;
  return {
    source: threshold.source,
    observed_at: threshold.observedAt,
    confidence: threshold.confidence,
    stale: threshold.stale,
    estimate: threshold.estimate,
    calculation_version: threshold.calculationVersion,
  };
}

function metricQuality(
  metric: ActivityAnalysisMetricSnapshot | null | undefined,
  asOf: Date,
  freshnessWindowMs: number,
): ActivityCalibrationQuality | null {
  if (!metric) return null;
  const observedAt = toIsoString(metric.recorded_at);
  if (!observedAt) return null;
  const source = thresholdMetricSource(metric.source ?? null, metric.provenance);
  return {
    source,
    observed_at: observedAt,
    confidence: source === "manual" ? "high" : source === "provider" ? "medium" : "low",
    stale: asOf.getTime() - new Date(observedAt).getTime() > freshnessWindowMs,
    estimate: source === "modeled" || source === "estimated",
    calculation_version: metric.calculation_version ?? null,
  };
}

function metricObservationKey(metric: ActivityAnalysisMetricSnapshot): string {
  if (metric.metric_type !== "lthr") return metric.metric_type;
  return `lthr:${lthrReferenceSport(metric) ?? "generic"}`;
}

function lthrReferenceSport(metric: ActivityAnalysisMetricSnapshot): LthrSport | null {
  if (metric.source === "manual" || !metric.reference_activity_id) return null;
  const category = metric.reference_activity_category;
  return category === "bike" || category === "run" || category === "swim" ? category : null;
}

function isLthrUnit(unit: string): boolean {
  const normalized = unit
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_-]/g, "");
  return normalized === "bpm" || normalized === "beatperminute" || normalized === "beatsperminute";
}

function toDirectThresholdMetric(
  metric: ActivityAnalysisMetricSnapshot,
  asOf: Date,
): DirectThresholdMetricObservation | null {
  const value = toNumber(metric.value);
  if (value === null || value <= 0) return null;

  const threshold =
    metric.metric_type === "ftp" && (metric.unit === "W" || metric.unit === "watts")
      ? "cycling_ftp"
      : metric.metric_type === "threshold_pace_seconds_per_km" &&
          (metric.unit === "s/km" || metric.unit === "seconds_per_km")
        ? "running_threshold_pace"
        : metric.metric_type === "css_seconds_per_100m" &&
            (metric.unit === "s/100m" || metric.unit === "seconds_per_100m")
          ? "swimming_css"
          : null;
  if (!threshold) return null;

  return {
    threshold,
    value,
    observedAt: toIsoString(metric.recorded_at) ?? asOf.toISOString(),
    source: thresholdMetricSource(metric.source ?? null, metric.provenance),
    calculationVersion: metric.calculation_version ?? null,
    locked: metric.source === "manual" && hasLockedManualOverride(metric.provenance),
  };
}

function thresholdMetricSource(source: string | null, provenance: unknown): ThresholdMetricSource {
  const provenanceSource =
    provenance && typeof provenance === "object" && "source" in provenance
      ? (provenance as { source?: unknown }).source
      : null;
  const candidate = source ?? provenanceSource;
  if (candidate === "manual") return "manual";
  if (candidate === "test" || candidate === "validated_test") return "validated_test";
  if (candidate === "estimated") return "estimated";
  if (candidate === "derived" || candidate === "modeled") return "modeled";
  if (candidate === "provider" || candidate === "imported") {
    return "provider";
  }
  return "estimated";
}

function hasLockedManualOverride(provenance: unknown): boolean {
  if (!provenance || typeof provenance !== "object" || !("manual_override" in provenance)) {
    return false;
  }
  const manualOverride = (provenance as { manual_override?: unknown }).manual_override;
  return (
    !!manualOverride &&
    typeof manualOverride === "object" &&
    "locked" in manualOverride &&
    manualOverride.locked === true
  );
}

function normalizeGender(
  value: ActivityAnalysisContext["profile"]["gender"],
): ActivityAnalysisContext["profile"]["gender"] {
  if (value === "male" || value === "female" || value === "other") {
    return value;
  }

  return null;
}

function compareRecordedAtDesc(
  left: { id?: string; recorded_at: Date },
  right: { id?: string; recorded_at: Date },
) {
  return (
    right.recorded_at.getTime() - left.recorded_at.getTime() ||
    (right.id ?? "").localeCompare(left.id ?? "")
  );
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeSpeedMetersPerSecond(value: number, unit: string): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit === "meters_per_second" || unit === "m/s") return value;
  if (unit === "km_per_hour") return value / 3.6;
  return null;
}

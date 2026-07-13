import type { ActivityAnalysisContext } from "@repo/core";
import {
  resolveCanonicalThresholds,
  type ThresholdActivityEffortObservation,
} from "@repo/core/athlete-inputs";
import type { ActivityAnalysisContextSnapshot, ActivityAnalysisStore } from "../../repositories";

type ResolveActivityContextAsOfInput = {
  store: ActivityAnalysisStore;
  profileId: string;
  activityTimestamp: string | Date;
};

export async function resolveActivityContextAsOf(
  input: ResolveActivityContextAsOfInput,
): Promise<ActivityAnalysisContext> {
  const { store, profileId, activityTimestamp } = input;
  const asOf = activityTimestamp instanceof Date ? activityTimestamp : new Date(activityTimestamp);
  const evidence = store.loadContextEvidence
    ? ((await store.loadContextEvidence({ requests: [{ asOf, profileId }] })).get(profileId) ??
      emptyContextEvidence)
    : await store.getContextSnapshot({ asOf, profileId });
  return resolveActivityContextFromEvidence({ activityTimestamp: asOf, evidence });
}

const emptyContextEvidence: ActivityAnalysisContextSnapshot = {
  profile: { dob: null, gender: null },
  profileMetrics: [],
  recentEfforts: [],
};

export function resolveActivityContextFromEvidence(input: {
  activityTimestamp: string | Date;
  evidence: ActivityAnalysisContextSnapshot;
}): ActivityAnalysisContext {
  const asOf =
    input.activityTimestamp instanceof Date
      ? input.activityTimestamp
      : new Date(input.activityTimestamp);
  const snapshot = input.evidence;
  const cutoff = asOf.getTime();

  const profileMetrics: ActivityAnalysisContext["profileMetrics"] = {};
  const typedMetrics = snapshot.profileMetrics.filter(
    (metric) => new Date(metric.recorded_at).getTime() <= cutoff,
  );
  const typedEfforts = snapshot.recentEfforts
    .filter((effort) => new Date(effort.recorded_at).getTime() <= cutoff)
    .slice(0, 50);

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

    if (metric.metric_type === "lthr" && profileMetrics.lthr == null) {
      profileMetrics.lthr = metricValue;
    }
  }

  const thresholds = resolveCanonicalThresholds({
    now: asOf.toISOString(),
    freshnessWindowMs: 90 * 24 * 60 * 60 * 1000,
    directMetrics: typedMetrics.flatMap((metric) =>
      metric.metric_type === "ftp" && metric.unit === "W"
        ? [
            {
              threshold: "cycling_ftp" as const,
              value: toNumber(metric.value) ?? 0,
              observedAt: toIsoString(metric.recorded_at) ?? asOf.toISOString(),
              source: "provider" as const,
            },
          ]
        : [],
    ),
    activityEfforts: typedEfforts.flatMap((effort): ThresholdActivityEffortObservation[] => {
      const value = normalizeSpeedMetersPerSecond(effort.value, effort.unit);
      if (effort.duration_seconds !== 1200) return [];
      if (effort.activity_category === "bike" && effort.effort_type === "power") {
        return [
          {
            sport: "bike" as const,
            metric: "power" as const,
            value: effort.value,
            durationSeconds: 1200,
            observedAt: toIsoString(effort.recorded_at) ?? asOf.toISOString(),
            observationKind: "actual" as const,
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
            observationKind: "actual" as const,
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

  const activityTimestampIso = asOf.toISOString();

  return {
    profileMetrics,
    recentEfforts: typedEfforts.map((effort) => ({
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

function normalizeGender(
  value: ActivityAnalysisContext["profile"]["gender"],
): ActivityAnalysisContext["profile"]["gender"] {
  if (value === "male" || value === "female" || value === "other") {
    return value;
  }

  return null;
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

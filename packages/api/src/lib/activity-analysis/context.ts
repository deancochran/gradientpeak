import type { ActivityAnalysisContext } from "@repo/core";
import type { ActivityAnalysisStore } from "../../repositories";

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
  const snapshot = await store.getContextSnapshot({ asOf, profileId });

  const profileMetrics: ActivityAnalysisContext["profileMetrics"] = {};
  const typedMetrics = snapshot.profileMetrics;
  const typedEfforts = snapshot.recentEfforts;

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

  const bikePower20mEffort = typedEfforts.find(
    (effort) =>
      effort.effort_type === "power" &&
      effort.activity_category === "bike" &&
      effort.duration_seconds === 1200,
  );

  profileMetrics.ftp = bikePower20mEffort ? Math.round(bikePower20mEffort.value * 0.95) : null;

  const activityTimestampIso = asOf.toISOString();

  return {
    profileMetrics,
    recentEfforts: typedEfforts.map((effort) => ({
      recorded_at: toIsoString(effort.recorded_at) ?? activityTimestampIso,
      effort_type: effort.effort_type,
      duration_seconds: effort.duration_seconds,
      value: effort.value,
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

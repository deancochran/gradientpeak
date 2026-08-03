import type { ActivityAnalysisContext } from "@repo/core";
import type { ActivityAnalysisContextSnapshot, ActivityAnalysisStore } from "../../repositories";
import {
  filterSupersededProfileOverrides,
  resolveLatestObservationsByKey,
} from "../../utils/profile-override-observations";

type ResolveActivityContextAsOfInput = {
  store: ActivityAnalysisStore;
  profileId: string;
  activityTimestamp: string | Date;
  activityId?: string;
  evidenceScope?: "thresholds";
};

/**
 * Reads non-model activity context and attaches the canonical as-of target facts.
 */
export async function resolveActivityContextAsOf(
  input: ResolveActivityContextAsOfInput,
): Promise<ActivityAnalysisContext> {
  const asOf =
    input.activityTimestamp instanceof Date
      ? input.activityTimestamp
      : new Date(input.activityTimestamp);
  const evidence = input.store.loadContextEvidence
    ? ((
        await input.store.loadContextEvidence({
          requests: [
            {
              asOf,
              effortLookbackAsOf: asOf,
              profileId: input.profileId,
              ...(input.activityId === undefined ? {} : { activityIdToExclude: input.activityId }),
            },
          ],
          ...(input.evidenceScope === undefined ? {} : { evidenceScope: input.evidenceScope }),
        })
      ).get(input.profileId) ?? emptyContextEvidence)
    : await input.store.getContextSnapshot({
        asOf,
        effortLookbackAsOf: asOf,
        profileId: input.profileId,
        ...(input.activityId === undefined ? {} : { activityIdToExclude: input.activityId }),
        ...(input.evidenceScope === undefined ? {} : { evidenceScope: input.evidenceScope }),
      });
  const context = resolveActivityContextFromEvidence({
    activityTimestamp: asOf,
    evidence,
    ...(input.activityId === undefined ? {} : { activityId: input.activityId }),
  });
  if (!input.store.getPerformanceTargetsAsOf) return context;
  return {
    ...context,
    performanceTargets: await input.store.getPerformanceTargetsAsOf({
      asOf,
      profileId: input.profileId,
      ...(input.activityId === undefined ? {} : { activityIdToExclude: input.activityId }),
    }),
  };
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
}): ActivityAnalysisContext {
  const asOf =
    input.activityTimestamp instanceof Date
      ? input.activityTimestamp
      : new Date(input.activityTimestamp);
  const cutoff = asOf.getTime();
  const metricRows = input.evidence.profileMetrics
    .filter(
      (metric) =>
        new Date(metric.recorded_at).getTime() <= cutoff &&
        (!input.activityId || metric.reference_activity_id !== input.activityId),
    )
    .sort(compareRecordedAtDesc);
  const latestMetrics = resolveLatestObservationsByKey(
    metricRows.filter((metric) => metric.metric_type !== "lthr"),
    (metric) => metric.metric_type,
  );
  const profileMetrics: ActivityAnalysisContext["profileMetrics"] = {};
  for (const metric of [...latestMetrics.values()].filter((metric) => metric !== null)) {
    const value = toNumber(metric.value);
    if (value === null) continue;
    if (metric.metric_type === "weight_kg" && profileMetrics.weight_kg == null) {
      profileMetrics.weight_kg = value;
    } else if (metric.metric_type === "resting_hr" && profileMetrics.resting_hr == null) {
      profileMetrics.resting_hr = value;
    }
  }
  if (latestMetrics.get("weight_kg") === null) profileMetrics.weight_kg = null;

  const recentEfforts = filterSupersededProfileOverrides(
    input.evidence.recentEfforts
      .filter((effort) => {
        const observedAt = new Date(effort.recorded_at).getTime();
        return (
          Number.isFinite(observedAt) &&
          observedAt <= cutoff &&
          (!input.activityId || effort.activity_id !== input.activityId)
        );
      })
      .sort(compareRecordedAtDesc),
    (effort) =>
      `${effort.activity_category}:${effort.effort_type}:${effort.duration_seconds}:${effort.unit}`,
  );

  return {
    profileMetrics,
    recentEfforts: recentEfforts
      .filter((effort) => effort.effort_type === "power" || effort.effort_type === "speed")
      .slice(0, 50)
      .map((effort) => ({
        recorded_at: toIsoString(effort.recorded_at) ?? asOf.toISOString(),
        effort_type: effort.effort_type as "power" | "speed",
        duration_seconds: effort.duration_seconds,
        value: effort.value,
        unit: effort.unit,
        activity_category: effort.activity_category,
      })),
    profile: {
      dob: toIsoString(input.evidence.profile.dob ?? null),
      gender: normalizeGender(input.evidence.profile.gender),
    },
  };
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

function normalizeGender(value: ActivityAnalysisContext["profile"]["gender"]) {
  return value === "male" || value === "female" || value === "other" ? value : null;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  return value == null ? null : value instanceof Date ? value.toISOString() : value;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

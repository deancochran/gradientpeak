import { type ActivityListDerivedSummary, analyzeActivityDerivedMetrics } from "@repo/core";
import type { ActivityRow } from "@repo/db";
import type { ActivityAnalysisStore } from "../../repositories";
import { resolveActivityContextAsOf } from "./context";

type ActivitySummaryRow = Pick<
  ActivityRow,
  | "id"
  | "type"
  | "started_at"
  | "finished_at"
  | "duration_seconds"
  | "moving_seconds"
  | "distance_meters"
  | "avg_heart_rate"
  | "max_heart_rate"
  | "avg_power"
  | "max_power"
  | "avg_speed_mps"
  | "max_speed_mps"
  | "normalized_power"
  | "normalized_speed_mps"
  | "normalized_graded_speed_mps"
>;

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export async function buildActivityDerivedSummaryMap(input: {
  store: ActivityAnalysisStore;
  profileId: string;
  activities: ActivitySummaryRow[];
}): Promise<Map<string, ActivityListDerivedSummary>> {
  const { store, profileId, activities } = input;
  const derivedEntries = await Promise.all(
    activities.map(async (activity) => {
      const context = await resolveActivityContextAsOf({
        store,
        profileId,
        activityTimestamp:
          activity.finished_at instanceof Date
            ? activity.finished_at
            : new Date(activity.finished_at),
      });

      const derived = analyzeActivityDerivedMetrics({
        activity: {
          id: activity.id,
          type: activity.type,
          started_at: toIsoString(activity.started_at),
          finished_at: toIsoString(activity.finished_at),
          duration_seconds: activity.duration_seconds,
          moving_seconds: activity.moving_seconds,
          distance_meters: activity.distance_meters,
          avg_heart_rate: activity.avg_heart_rate,
          max_heart_rate: activity.max_heart_rate,
          avg_power: activity.avg_power,
          max_power: activity.max_power,
          avg_speed_mps: activity.avg_speed_mps,
          max_speed_mps: activity.max_speed_mps,
          normalized_power: activity.normalized_power,
          normalized_speed_mps: activity.normalized_speed_mps,
          normalized_graded_speed_mps: activity.normalized_graded_speed_mps,
        },
        context,
      });

      return [
        activity.id,
        {
          tss: derived.stress.tss,
          tss_identity: derived.stress.tss_identity,
          intensity_factor: derived.stress.intensity_factor,
          computed_as_of: derived.computed_as_of,
        } satisfies ActivityListDerivedSummary,
      ] as const;
    }),
  );

  return new Map(derivedEntries);
}

export async function buildDynamicStressSeries(input: {
  store: ActivityAnalysisStore;
  profileId: string;
  activities: ActivitySummaryRow[];
}): Promise<{
  byActivityId: Map<string, ActivityListDerivedSummary>;
  byDate: Map<string, number>;
  seriesIdentity: ActivityListDerivedSummary["tss_identity"];
  complete: boolean;
}> {
  const byActivityId = await buildActivityDerivedSummaryMap(input);
  const byDate = new Map<string, number>();
  const identities = new Map<string, NonNullable<ActivityListDerivedSummary["tss_identity"]>>();
  let complete = true;

  for (const activity of input.activities) {
    const dateKey = toIsoString(activity.started_at).split("T")[0];
    if (!dateKey) continue;
    const summary = byActivityId.get(activity.id);
    if (summary?.tss === null || !summary?.tss_identity) {
      complete = false;
      continue;
    }
    const identityKey = JSON.stringify(summary.tss_identity);
    identities.set(identityKey, summary.tss_identity);
    const tss = summary.tss;
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + tss);
  }

  const seriesIdentity = identities.size === 1 ? [...identities.values()][0]! : null;
  return { byActivityId, byDate, seriesIdentity, complete: complete && seriesIdentity !== null };
}

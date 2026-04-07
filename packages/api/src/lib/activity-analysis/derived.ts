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
        activityTimestamp: activity.finished_at,
      });

      const derived = analyzeActivityDerivedMetrics({
        activity: {
          id: activity.id,
          type: activity.type,
          started_at: activity.started_at.toISOString(),
          finished_at: activity.finished_at.toISOString(),
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
}> {
  const byActivityId = await buildActivityDerivedSummaryMap(input);
  const byDate = new Map<string, number>();

  for (const activity of input.activities) {
    const dateKey = activity.started_at.toISOString().split("T")[0];
    if (!dateKey) continue;
    const tss = byActivityId.get(activity.id)?.tss ?? 0;
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + tss);
  }

  return { byActivityId, byDate };
}

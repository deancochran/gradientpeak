import { type ActivityListDerivedSummary, analyzeActivityDerivedMetrics } from "@repo/core";
import type { Database } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveActivityContextAsOf } from "./context";

type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
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
  supabase: SupabaseClient<Database>;
  profileId: string;
  activities: ActivitySummaryRow[];
}): Promise<Map<string, ActivityListDerivedSummary>> {
  const { supabase, profileId, activities } = input;
  const derivedEntries = await Promise.all(
    activities.map(async (activity) => {
      const context = await resolveActivityContextAsOf({
        supabase,
        profileId,
        activityTimestamp: activity.finished_at,
      });

      const derived = analyzeActivityDerivedMetrics({
        activity: {
          id: activity.id,
          type: activity.type,
          started_at: activity.started_at,
          finished_at: activity.finished_at,
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
  supabase: SupabaseClient<Database>;
  profileId: string;
  activities: ActivitySummaryRow[];
}): Promise<{
  byActivityId: Map<string, ActivityListDerivedSummary>;
  byDate: Map<string, number>;
}> {
  const byActivityId = await buildActivityDerivedSummaryMap(input);
  const byDate = new Map<string, number>();

  for (const activity of input.activities) {
    const dateKey = activity.started_at.split("T")[0];
    if (!dateKey) continue;
    const tss = byActivityId.get(activity.id)?.tss ?? 0;
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + tss);
  }

  return { byActivityId, byDate };
}

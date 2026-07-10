import { activities } from "@repo/db";
import { and, eq, gte, lte } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import { buildActivityDerivedSummaryMap } from "../../lib/activity-analysis";

type DbClient = ReturnType<typeof getRequiredDb>;

export async function getProfileStats(db: DbClient, input: { profileId: string; period: number }) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - input.period);

  const activityRows = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.profile_id, input.profileId),
        gte(activities.started_at, startDate),
        lte(activities.started_at, endDate),
      ),
    );

  const derivedMap = await buildActivityDerivedSummaryMap({
    store: createActivityAnalysisStore(db),
    profileId: input.profileId,
    activities: activityRows,
  });

  const totalActivities = activityRows.length;
  const totalDuration = activityRows.reduce((sum, activity) => {
    return sum + (activity.duration_seconds || 0);
  }, 0);
  const totalDistance = activityRows.reduce((sum, activity) => {
    return sum + (activity.distance_meters || 0);
  }, 0);
  const totalTSS = activityRows.reduce((sum, activity) => {
    return sum + (derivedMap.get(activity.id)?.tss || 0);
  }, 0);

  return {
    totalActivities,
    totalDuration,
    totalDistance,
    totalTSS,
    avgDuration: totalActivities > 0 ? totalDuration / totalActivities : 0,
    period: input.period,
  };
}

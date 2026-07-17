import { activities } from "@repo/db";
import { and, eq, gte, lte } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  buildActivitySegmentDerivedSummaries,
  deriveActivityDurations,
  loadActivitySegmentsByActivityId,
} from "../../lib/activity-analysis";

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

  const segments = await loadActivitySegmentsByActivityId(
    db,
    activityRows.map((activity) => activity.id),
  );
  const activitiesWithSegments = activityRows.map((activity) => ({
    ...activity,
    segments: segments.get(activity.id) ?? [],
  }));
  const derivedSegments = await buildActivitySegmentDerivedSummaries({
    store: createActivityAnalysisStore(db),
    profileId: input.profileId,
    activities: activitiesWithSegments,
  });

  const totalActivities = activityRows.length;
  const totalDuration = activityRows.reduce((sum, activity) => {
    const durations = deriveActivityDurations(activity);
    return sum + (durations.active_seconds ?? durations.elapsed_seconds);
  }, 0);
  const totalDistance = activityRows.reduce((sum, activity) => {
    return sum + (activity.distance_meters || 0);
  }, 0);
  const totalTSS = derivedSegments.reduce((sum, segment) => sum + (segment.tss ?? 0), 0);

  return {
    totalActivities,
    totalDuration,
    totalDistance,
    totalTSS,
    avgDuration: totalActivities > 0 ? totalDuration / totalActivities : 0,
    period: input.period,
  };
}

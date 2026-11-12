import { activities, activitySegments, plannedSessions } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { DelegatedCompletedActivitiesRequest } from "../../contracts/delegated-completions";
import { withAuthorizedAthleteReadScopes } from "../organizations/authorize-athlete-read";

export class DelegatedCompletedActivitiesAccessDeniedError extends Error {
  constructor() {
    super("Completed activity access is unavailable");
    this.name = "DelegatedCompletedActivitiesAccessDeniedError";
  }
}

/** A deliberately small coach review feed: only activities linked to completed planned sessions. */
export async function readDelegatedCompletedActivities(input: {
  actorProfileId: string;
  db: DrizzleDbClient;
  request: DelegatedCompletedActivitiesRequest;
}) {
  const authorized = await withAuthorizedAthleteReadScopes({
    actorProfileId: input.actorProfileId,
    athleteProfileId: input.request.athleteProfileId,
    db: input.db,
    organizationId: input.request.organizationId,
    scopes: ["activities", "calendar"],
    read: async (transaction) =>
      transaction
        .select({
          // Manual rows have an explicit manual category. Imported/recorded
          // activities derive category only from their canonical activity segment.
          activityCategory: sql<"run" | "bike" | "swim" | "strength" | "other" | null>`case
            when ${activities.entry_provenance} = 'manual' then ${activities.manual_activity_category}
            else (
              select ${activitySegments.activity_category}
              from ${activitySegments}
              where ${activitySegments.activity_id} = ${activities.id}
                and ${activitySegments.profile_id} = ${activities.profile_id}
                and ${activitySegments.role} = 'activity'
              order by ${activitySegments.ordinal}
              limit 1
            )
          end`,
          activityId: activities.id,
          distanceMeters: activities.distance_meters,
          elapsedMs: activities.elapsed_ms,
          planningDate: plannedSessions.planning_date,
          sessionId: plannedSessions.id,
        })
        .from(plannedSessions)
        .innerJoin(
          activities,
          and(
            eq(activities.id, plannedSessions.completed_activity_id),
            eq(activities.profile_id, plannedSessions.profile_id),
          ),
        )
        .where(
          and(
            eq(plannedSessions.profile_id, input.request.athleteProfileId),
            eq(plannedSessions.status, "completed"),
            eq(plannedSessions.completion_state, "linked"),
            isNotNull(plannedSessions.completed_activity_id),
          ),
        )
        .orderBy(desc(plannedSessions.planning_date), desc(plannedSessions.id))
        .limit(input.request.limit),
  });
  if (!("value" in authorized)) throw new DelegatedCompletedActivitiesAccessDeniedError();
  return {
    items: authorized.value.map((item) => ({
      ...item,
      activityCategory: item.activityCategory,
      distanceMeters: item.distanceMeters ?? null,
      elapsedMs: item.elapsedMs ?? null,
    })),
  };
}

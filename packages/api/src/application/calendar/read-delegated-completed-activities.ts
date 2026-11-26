import {
  activities,
  activitySegments,
  coachingCompletionReviews,
  coachingEngagements,
  plannedSessions,
} from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { DelegatedCompletedActivitiesRequest } from "../../contracts/delegated-completions";
import { withAuthorizedAthleteReadScopes } from "../organizations/authorize-athlete-read";

export class DelegatedCompletedActivitiesAccessDeniedError extends Error {
  constructor() {
    super("Completed activity access is unavailable");
    this.name = "DelegatedCompletedActivitiesAccessDeniedError";
  }
}

/**
 * Version binds the completion link and the coach-approved evidence only.
 * Private title, notes, and visibility edits deliberately do not requeue a
 * completed review. Imported evidence advances through its segment revision;
 * manual evidence has no segments, so its category and summary metrics are
 * explicit version inputs.
 */
export const completionEvidenceVersion = sql<string>`md5(concat_ws(
  ':',
  ${plannedSessions.id}::text,
  ${plannedSessions.completed_activity_id}::text,
  ${plannedSessions.linked_at}::text,
  ${plannedSessions.completion_outcome}::text,
  ${activities.entry_provenance}::text,
  case when ${activities.entry_provenance} = 'manual'
    then ${activities.manual_activity_category}::text end,
  case when ${activities.entry_provenance} = 'manual'
    then ${activities.elapsed_ms}::text end,
  case when ${activities.entry_provenance} = 'manual'
    then ${activities.distance_meters}::text end,
  case when ${activities.entry_provenance} is distinct from 'manual'
    then ${activities.segments_revision}::text end
))`;

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
          completionOutcome: sql<"full" | "partial">`${plannedSessions.completion_outcome}`,
          completionSource: sql<"manual" | "recorded" | "unavailable">`case
            when ${activities.entry_provenance} = 'manual' then 'manual'
            when ${activities.entry_provenance} is null then 'recorded'
            else 'unavailable'
          end`,
          distanceMeters: activities.distance_meters,
          elapsedMs: activities.elapsed_ms,
          evidenceVersion: completionEvidenceVersion,
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
        .innerJoin(
          coachingEngagements,
          and(
            eq(coachingEngagements.organization_id, input.request.organizationId),
            eq(coachingEngagements.athlete_profile_id, input.request.athleteProfileId),
            isNull(coachingEngagements.ended_at),
          ),
        )
        .leftJoin(
          coachingCompletionReviews,
          and(
            eq(coachingCompletionReviews.engagement_id, coachingEngagements.id),
            eq(coachingCompletionReviews.session_id, plannedSessions.id),
            eq(coachingCompletionReviews.evidence_version, completionEvidenceVersion),
          ),
        )
        .where(
          and(
            eq(plannedSessions.profile_id, input.request.athleteProfileId),
            eq(plannedSessions.status, "completed"),
            eq(plannedSessions.completion_state, "linked"),
            isNotNull(plannedSessions.completed_activity_id),
            isNull(coachingCompletionReviews.id),
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
      completionOutcome: item.completionOutcome,
      completionSource: item.completionSource,
      distanceMeters: item.distanceMeters ?? null,
      elapsedMs: item.elapsedMs ?? null,
    })),
  };
}

import {
  activities,
  coachingAssignments,
  coachingCompletionReviews,
  coachingEngagements,
  organizationGroupAthletes,
  organizationGroupCoachAssignments,
  organizationGroups,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  plannedSessions,
} from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { AcknowledgeDelegatedCompletionRequest } from "../../contracts/delegated-completions";
import { withProfileFencedRepeatableReadSnapshot } from "../../db";
import { createAthleteReadAccessRepository } from "../../repositories/athlete-read-access-repository";
import {
  completionEvidenceVersion,
  DelegatedCompletedActivitiesAccessDeniedError,
} from "./read-delegated-completed-activities";

export async function acknowledgeDelegatedCompletion(input: {
  actorProfileId: string;
  db: DrizzleDbClient;
  request: AcknowledgeDelegatedCompletionRequest;
}) {
  type CurrentAuthority = {
    activityId: string;
    assignmentId: string | null;
    engagementId: string;
    evidenceVersion: string;
    groupAthleteMembershipId: string | null;
    groupCoachAssignmentId: string | null;
    membershipId: string;
    reviewAuthorityKind: "direct" | "group";
  };
  return withProfileFencedRepeatableReadSnapshot(
    input.db,
    input.request.athleteProfileId,
    async (tx) => {
      // The athlete fence linearizes completion writers. Take the common
      // organization writer lock before the access function's FOR SHARE locks:
      // the insert trigger uses this same ordering, so acknowledgements cannot
      // queue an organization lock upgrade behind a lifecycle writer.
      await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, input.request.organizationId))
        .limit(1)
        .for("update");

      // Authorization and evidence are re-evaluated at the acknowledgement
      // linearization point, not from a stale queue snapshot.
      const access = createAthleteReadAccessRepository(tx);
      for (const scope of ["activities", "calendar"] as const) {
        const decision = await access.evaluate({
          actorProfileId: input.actorProfileId,
          athleteProfileId: input.request.athleteProfileId,
          organizationId: input.request.organizationId,
          scope,
        });
        if (decision.outcome === "deny") throw new DelegatedCompletedActivitiesAccessDeniedError();
      }
      const [directCurrent] = await tx
        .select({
          activityId: activities.id,
          assignmentId: coachingAssignments.id,
          engagementId: coachingEngagements.id,
          evidenceVersion: completionEvidenceVersion,
          groupAthleteMembershipId: sql<string | null>`null`,
          groupCoachAssignmentId: sql<string | null>`null`,
          membershipId: organizationMemberships.id,
          reviewAuthorityKind: sql<"direct">`'direct'`,
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
        // Review identity comes only from the currently active authority graph.
        // The insert trigger locks and revalidates this graph after the session
        // row lock, so a revoke/reassignment between this read and insertion
        // fails closed rather than creating a historical authority claim.
        .innerJoin(
          coachingAssignments,
          and(
            eq(coachingAssignments.organization_id, coachingEngagements.organization_id),
            eq(coachingAssignments.engagement_id, coachingEngagements.id),
            isNull(coachingAssignments.ended_at),
          ),
        )
        .innerJoin(
          organizationMemberships,
          and(
            eq(organizationMemberships.organization_id, coachingAssignments.organization_id),
            eq(organizationMemberships.id, coachingAssignments.coach_membership_id),
            eq(organizationMemberships.profile_id, input.actorProfileId),
            isNull(organizationMemberships.ended_at),
            isNull(organizationMemberships.suspended_at),
          ),
        )
        .innerJoin(
          organizationMembershipRoleGrants,
          and(
            eq(
              organizationMembershipRoleGrants.organization_id,
              organizationMemberships.organization_id,
            ),
            eq(organizationMembershipRoleGrants.membership_id, organizationMemberships.id),
            eq(organizationMembershipRoleGrants.role_key, "coach"),
            isNull(organizationMembershipRoleGrants.revoked_at),
          ),
        )
        .where(
          and(
            eq(plannedSessions.id, input.request.sessionId),
            eq(plannedSessions.profile_id, input.request.athleteProfileId),
            eq(plannedSessions.status, "completed"),
            eq(plannedSessions.completion_state, "linked"),
          ),
        )
        .limit(1);
      let current: CurrentAuthority | undefined = directCurrent;
      // The shared access function accepts a current direct *or* group path.
      // Persist the exact group facts when that is the path being acknowledged;
      // do not synthesize a direct assignment for historical attribution.
      if (!current) {
        [current] = await tx
          .select({
            activityId: activities.id,
            assignmentId: sql<string | null>`null`,
            engagementId: coachingEngagements.id,
            evidenceVersion: completionEvidenceVersion,
            groupAthleteMembershipId: organizationGroupAthletes.id,
            groupCoachAssignmentId: organizationGroupCoachAssignments.id,
            membershipId: organizationMemberships.id,
            reviewAuthorityKind: sql<"group">`'group'`,
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
          .innerJoin(
            organizationMemberships,
            and(
              eq(organizationMemberships.organization_id, coachingEngagements.organization_id),
              eq(organizationMemberships.profile_id, input.actorProfileId),
              isNull(organizationMemberships.ended_at),
              isNull(organizationMemberships.suspended_at),
            ),
          )
          .innerJoin(
            organizationMembershipRoleGrants,
            and(
              eq(
                organizationMembershipRoleGrants.organization_id,
                organizationMemberships.organization_id,
              ),
              eq(organizationMembershipRoleGrants.membership_id, organizationMemberships.id),
              eq(organizationMembershipRoleGrants.role_key, "coach"),
              isNull(organizationMembershipRoleGrants.revoked_at),
            ),
          )
          .innerJoin(
            organizationGroupCoachAssignments,
            and(
              eq(
                organizationGroupCoachAssignments.organization_id,
                organizationMemberships.organization_id,
              ),
              eq(organizationGroupCoachAssignments.coach_membership_id, organizationMemberships.id),
              isNull(organizationGroupCoachAssignments.ended_at),
            ),
          )
          .innerJoin(
            organizationGroups,
            and(
              eq(
                organizationGroups.organization_id,
                organizationGroupCoachAssignments.organization_id,
              ),
              eq(organizationGroups.id, organizationGroupCoachAssignments.group_id),
              isNull(organizationGroups.archived_at),
            ),
          )
          .innerJoin(
            organizationGroupAthletes,
            and(
              eq(organizationGroupAthletes.organization_id, organizationGroups.organization_id),
              eq(organizationGroupAthletes.group_id, organizationGroups.id),
              eq(organizationGroupAthletes.engagement_id, coachingEngagements.id),
              isNull(organizationGroupAthletes.ended_at),
            ),
          )
          .where(
            and(
              eq(plannedSessions.id, input.request.sessionId),
              eq(plannedSessions.profile_id, input.request.athleteProfileId),
              eq(plannedSessions.status, "completed"),
              eq(plannedSessions.completion_state, "linked"),
            ),
          )
          .limit(1);
      }
      if (!current || current.evidenceVersion !== input.request.evidenceVersion)
        return { outcome: "stale" as const };
      const inserted = await tx
        .insert(coachingCompletionReviews)
        .values({
          activity_id: current.activityId,
          athlete_profile_id: input.request.athleteProfileId,
          engagement_id: current.engagementId,
          evidence_version: current.evidenceVersion,
          organization_id: input.request.organizationId,
          reviewed_by_assignment_id: current.assignmentId,
          reviewed_by_group_athlete_membership_id: current.groupAthleteMembershipId,
          reviewed_by_group_coach_assignment_id: current.groupCoachAssignmentId,
          reviewed_by_membership_id: current.membershipId,
          reviewed_by_profile_id: input.actorProfileId,
          review_authority_kind: current.reviewAuthorityKind,
          session_id: input.request.sessionId,
        })
        .onConflictDoNothing()
        .returning({ id: coachingCompletionReviews.id });
      return {
        outcome: inserted.length ? ("acknowledged" as const) : ("already_acknowledged" as const),
      };
    },
  );
}

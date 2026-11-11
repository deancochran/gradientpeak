import { randomUUID } from "node:crypto";
import {
  getCalendarDateInIanaZone,
  isValidDateOnlyUtc,
  isValidIanaTimeZone,
} from "@repo/core/calendar";
import {
  activityPlans,
  athletePlanEditGrants,
  coachingActivityPlanPublications,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
} from "@repo/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { DrizzleTransactionClient } from "../../db";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories/drizzle-planned-session-repository";
import { duplicateActivityPlan } from "../activity-plans/duplicate-activity-plan";
import { createDirectPlannedSession } from "../calendar/create-direct-planned-session";

export class CoachingPublicationDeniedError extends Error {}
export class CoachingPublicationConflictError extends Error {}

/**
 * Performs no provider delivery. The athlete-owned private copy is the durable
 * frozen source used by the existing planned-session/prescription flow.
 */
export async function publishCoachActivityPlan(input: {
  tx: DrizzleTransactionClient;
  actorProfileId: string;
  organizationId: string;
  athleteProfileId: string;
  coachMembershipId: string;
  activityPlanId: string;
  activityPlanRevision: number;
  planningDate: string;
  operationId: string;
  now: Date;
}) {
  const [athlete] = await input.tx
    .select({ planningTimezone: profiles.planning_timezone })
    .from(profiles)
    .where(eq(profiles.id, input.athleteProfileId))
    .for("update")
    .limit(1);
  if (
    !athlete?.planningTimezone ||
    !isValidIanaTimeZone(athlete.planningTimezone) ||
    !isValidDateOnlyUtc(input.planningDate)
  )
    throw new CoachingPublicationDeniedError("A valid athlete-local planning date is required");
  if (
    input.planningDate <
    getCalendarDateInIanaZone(input.now.toISOString(), athlete.planningTimezone)
  ) {
    throw new CoachingPublicationDeniedError(
      "Coaches can publish only future athlete-local sessions",
    );
  }

  // Lock every authority row before the source or session is read. The athlete
  // profile fence held by the caller serializes competing publications/revokes.
  const [grant] = await input.tx
    .select({ id: athletePlanEditGrants.id, engagementId: athletePlanEditGrants.engagement_id })
    .from(athletePlanEditGrants)
    .where(
      and(
        eq(athletePlanEditGrants.organization_id, input.organizationId),
        eq(athletePlanEditGrants.athlete_profile_id, input.athleteProfileId),
        eq(athletePlanEditGrants.coach_membership_id, input.coachMembershipId),
        isNull(athletePlanEditGrants.revoked_at),
        sql`(${athletePlanEditGrants.expires_at} is null or ${athletePlanEditGrants.expires_at} > ${input.now})`,
      ),
    )
    .for("update")
    .limit(1);
  const [assignment] = await input.tx
    .select({ id: coachingAssignments.id, engagementId: coachingAssignments.engagement_id })
    .from(coachingAssignments)
    .innerJoin(coachingEngagements, eq(coachingEngagements.id, coachingAssignments.engagement_id))
    .innerJoin(
      organizationMemberships,
      eq(organizationMemberships.id, coachingAssignments.coach_membership_id),
    )
    .innerJoin(
      organizationMembershipRoleGrants,
      eq(organizationMembershipRoleGrants.membership_id, coachingAssignments.coach_membership_id),
    )
    .innerJoin(organizations, eq(organizations.id, coachingAssignments.organization_id))
    .where(
      and(
        eq(coachingAssignments.organization_id, input.organizationId),
        eq(coachingAssignments.coach_membership_id, input.coachMembershipId),
        isNull(coachingAssignments.ended_at),
        sql`${coachingAssignments.assigned_at} <= ${input.now}`,
        eq(coachingEngagements.athlete_profile_id, input.athleteProfileId),
        isNull(coachingEngagements.ended_at),
        isNull(coachingEngagements.paused_at),
        eq(organizationMemberships.profile_id, input.actorProfileId),
        isNull(organizationMemberships.ended_at),
        isNull(organizationMemberships.suspended_at),
        eq(organizationMembershipRoleGrants.role_key, "coach"),
        isNull(organizationMembershipRoleGrants.revoked_at),
        sql`${organizationMembershipRoleGrants.granted_at} <= ${input.now}`,
        isNull(organizations.closed_at),
        isNull(organizations.suspended_at),
      ),
    )
    .for("update")
    .limit(1);
  if (!assignment)
    throw new CoachingPublicationDeniedError("Current coaching assignment is unavailable");
  if (!grant || grant.engagementId !== assignment.engagementId) {
    throw new CoachingPublicationDeniedError("Athlete plan-edit permission is unavailable");
  }

  // Authorize the actor before resolving an existing receipt, but resolve that
  // durable operation before consulting mutable source-plan state. A lost
  // response must remain safely retryable after a later source edit.
  const [receipt] = await input.tx
    .select({
      organizationId: coachingActivityPlanPublications.organization_id,
      coachMembershipId: coachingActivityPlanPublications.coach_membership_id,
      sourceActivityPlanId: coachingActivityPlanPublications.source_activity_plan_id,
      sourceActivityPlanRevision: coachingActivityPlanPublications.source_activity_plan_revision,
      planningDate: coachingActivityPlanPublications.planning_date,
      copiedActivityPlanId: coachingActivityPlanPublications.copied_activity_plan_id,
      plannedSessionId: coachingActivityPlanPublications.planned_session_id,
    })
    .from(coachingActivityPlanPublications)
    .where(
      and(
        eq(coachingActivityPlanPublications.athlete_profile_id, input.athleteProfileId),
        eq(coachingActivityPlanPublications.operation_id, input.operationId),
      ),
    )
    .for("update")
    .limit(1);
  if (receipt) {
    if (
      receipt.organizationId !== input.organizationId ||
      receipt.coachMembershipId !== input.coachMembershipId ||
      receipt.sourceActivityPlanId !== input.activityPlanId ||
      receipt.sourceActivityPlanRevision !== input.activityPlanRevision ||
      receipt.planningDate !== input.planningDate
    ) {
      throw new CoachingPublicationConflictError(
        "Operation ID was already used with different input",
      );
    }
    return {
      status: "existing" as const,
      session: { id: receipt.plannedSessionId },
      copiedActivityPlanId: receipt.copiedActivityPlanId,
    };
  }

  const [source] = await input.tx
    .select({ id: activityPlans.id, revision: activityPlans.revision })
    .from(activityPlans)
    .where(
      and(
        eq(activityPlans.id, input.activityPlanId),
        eq(activityPlans.profile_id, input.actorProfileId),
      ),
    )
    .for("update")
    .limit(1);
  if (!source) throw new CoachingPublicationDeniedError("Activity plan is not owned by this coach");
  if (source.revision !== input.activityPlanRevision) {
    throw new CoachingPublicationConflictError(
      "Activity plan changed; preview it again before publishing",
    );
  }

  const copied = await duplicateActivityPlan({
    db: input.tx,
    profileId: input.athleteProfileId,
    sourceOwnerProfileId: input.actorProfileId,
    sourceActivityPlanId: input.activityPlanId,
    now: input.now,
    createId: randomUUID,
  });
  const result = await createDirectPlannedSession({
    db: input.tx,
    repository: createDrizzlePlannedSessionRepository(input.tx),
    profileId: input.athleteProfileId,
    sessionId: randomUUID(),
    planningDate: input.planningDate,
    source: { kind: "direct", operationId: input.operationId },
    activityPlanId: copied.id,
    groupEventId: null,
    capturedAt: input.now,
  });
  await input.tx.insert(coachingActivityPlanPublications).values({
    id: randomUUID(),
    athlete_profile_id: input.athleteProfileId,
    operation_id: input.operationId,
    organization_id: input.organizationId,
    coach_membership_id: input.coachMembershipId,
    source_activity_plan_id: input.activityPlanId,
    source_activity_plan_revision: input.activityPlanRevision,
    planning_date: input.planningDate,
    copied_activity_plan_id: copied.id,
    planned_session_id: result.session.id,
    created_at: input.now,
  });
  return { status: result.status, session: result.session, copiedActivityPlanId: copied.id };
}

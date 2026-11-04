import {
  coachingAssignments,
  coachingEngagements,
  organizationAuditEvents,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
} from "@repo/db";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

/** Persistence boundary for direct assignments.  Organization is always locked first. */
export function createCoachingAssignmentRepository(db: DrizzleQueryExecutor) {
  return {
    lockOrganization: async (organizationId: string) =>
      (
        await db
          .select({
            rootMembershipId: organizations.root_owner_membership_id,
            suspendedAt: organizations.suspended_at,
            closedAt: organizations.closed_at,
          })
          .from(organizations)
          .where(eq(organizations.id, organizationId))
          .for("update")
          .limit(1)
      )[0] ?? null,
    lockManager: async (organizationId: string, profileId: string) =>
      (
        await db
          .select({
            id: organizationMemberships.id,
            suspendedAt: organizationMemberships.suspended_at,
            endedAt: organizationMemberships.ended_at,
            isRoot: sql<boolean>`${organizations.root_owner_membership_id} = ${organizationMemberships.id}`,
          })
          .from(organizationMemberships)
          .innerJoin(organizations, eq(organizations.id, organizationMemberships.organization_id))
          .leftJoin(
            organizationMembershipRoleGrants,
            and(
              eq(organizationMembershipRoleGrants.organization_id, organizationId),
              eq(organizationMembershipRoleGrants.membership_id, organizationMemberships.id),
              eq(organizationMembershipRoleGrants.role_key, "admin"),
              lte(organizationMembershipRoleGrants.granted_at, sql`transaction_timestamp()`),
              isNull(organizationMembershipRoleGrants.revoked_at),
            ),
          )
          .where(
            and(
              eq(organizationMemberships.organization_id, organizationId),
              eq(organizationMemberships.profile_id, profileId),
              or(
                eq(organizations.root_owner_membership_id, organizationMemberships.id),
                sql`${organizationMembershipRoleGrants.id} is not null`,
              ),
            ),
          )
          .for("update", { of: organizationMemberships })
          .limit(1)
      )[0] ?? null,
    lockEngagement: async (organizationId: string, engagementId: string) =>
      (
        await db
          .select({
            id: coachingEngagements.id,
            athleteProfileId: coachingEngagements.athlete_profile_id,
            pausedAt: coachingEngagements.paused_at,
            endedAt: coachingEngagements.ended_at,
          })
          .from(coachingEngagements)
          .where(
            and(
              eq(coachingEngagements.organization_id, organizationId),
              eq(coachingEngagements.id, engagementId),
            ),
          )
          .for("update")
          .limit(1)
      )[0] ?? null,
    lockCoach: async (organizationId: string, membershipId: string) =>
      (
        await db
          .select({
            id: organizationMemberships.id,
            suspendedAt: organizationMemberships.suspended_at,
            endedAt: organizationMemberships.ended_at,
          })
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organization_id, organizationId),
              eq(organizationMemberships.id, membershipId),
            ),
          )
          .for("update")
          .limit(1)
      )[0] ?? null,
    lockActiveCoachGrant: async (organizationId: string, membershipId: string) =>
      (
        await db
          .select({ id: organizationMembershipRoleGrants.id })
          .from(organizationMembershipRoleGrants)
          .where(
            and(
              eq(organizationMembershipRoleGrants.organization_id, organizationId),
              eq(organizationMembershipRoleGrants.membership_id, membershipId),
              eq(organizationMembershipRoleGrants.role_key, "coach"),
              lte(organizationMembershipRoleGrants.granted_at, sql`transaction_timestamp()`),
              isNull(organizationMembershipRoleGrants.revoked_at),
            ),
          )
          .for("update")
          .limit(1)
      )[0] ?? null,
    lockAssignments: (organizationId: string, engagementId: string) =>
      db
        .select({
          id: coachingAssignments.id,
          coachMembershipId: coachingAssignments.coach_membership_id,
          assignmentKind: coachingAssignments.assignment_kind,
          assignedAt: coachingAssignments.assigned_at,
        })
        .from(coachingAssignments)
        .where(
          and(
            eq(coachingAssignments.organization_id, organizationId),
            eq(coachingAssignments.engagement_id, engagementId),
            isNull(coachingAssignments.ended_at),
          ),
        )
        .orderBy(asc(coachingAssignments.id))
        .for("update"),
    findReceipts: (organizationId: string, operationId: string) =>
      db
        .select({
          action: organizationAuditEvents.action,
          actorProfileId: organizationAuditEvents.actor_profile_id,
          actorMembershipId: organizationAuditEvents.actor_membership_id,
          resourceId: organizationAuditEvents.resource_id,
          details: organizationAuditEvents.details,
        })
        .from(organizationAuditEvents)
        .where(
          and(
            eq(organizationAuditEvents.organization_id, organizationId),
            eq(organizationAuditEvents.correlation_id, operationId),
          ),
        )
        .orderBy(asc(organizationAuditEvents.id)),
    endAssignments: (ids: string[]) =>
      ids.length === 0
        ? Promise.resolve([])
        : db
            .update(coachingAssignments)
            .set({ ended_at: sql`transaction_timestamp()` })
            .where(and(inArray(coachingAssignments.id, ids), isNull(coachingAssignments.ended_at)))
            .returning({ id: coachingAssignments.id }),
    insertAssignment: (input: {
      organizationId: string;
      engagementId: string;
      coachMembershipId: string;
      assignmentKind: "primary" | "supporting";
    }) =>
      db
        .insert(coachingAssignments)
        .values({
          organization_id: input.organizationId,
          engagement_id: input.engagementId,
          coach_membership_id: input.coachMembershipId,
          assignment_kind: input.assignmentKind,
        })
        .returning({ id: coachingAssignments.id }),
    recordReceipt: (input: {
      organizationId: string;
      actorProfileId: string;
      actorMembershipId: string;
      engagementId: string;
      operationId: string;
      action: string;
      details: Record<string, unknown>;
    }) =>
      db
        .insert(organizationAuditEvents)
        .values({
          organization_id: input.organizationId,
          actor_profile_id: input.actorProfileId,
          actor_membership_id: input.actorMembershipId,
          resource_type: "coaching_assignment",
          resource_id: input.engagementId,
          action: input.action,
          correlation_id: input.operationId,
          details: input.details,
        })
        .onConflictDoNothing()
        .returning({ id: organizationAuditEvents.id }),
    list: (organizationId: string, engagementId: string) =>
      db
        .select({
          id: coachingAssignments.id,
          coachMembershipId: coachingAssignments.coach_membership_id,
          assignmentKind: coachingAssignments.assignment_kind,
          assignedAt: coachingAssignments.assigned_at,
        })
        .from(coachingAssignments)
        .where(
          and(
            eq(coachingAssignments.organization_id, organizationId),
            eq(coachingAssignments.engagement_id, engagementId),
            isNull(coachingAssignments.ended_at),
          ),
        )
        .orderBy(asc(coachingAssignments.id)),
  };
}
export type CoachingAssignmentRepository = ReturnType<typeof createCoachingAssignmentRepository>;

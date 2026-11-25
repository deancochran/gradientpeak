import {
  coachingAssignments,
  organizationAuditEvents,
  organizationGroupCoachAssignments,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
} from "@repo/db";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

export function createOrganizationStaffRoleRepository(db: DrizzleQueryExecutor) {
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
    lockMembershipByProfile: async (organizationId: string, profileId: string) =>
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
              eq(organizationMemberships.profile_id, profileId),
            ),
          )
          .for("update")
          .limit(1)
      )[0] ?? null,
    lockMembershipById: async (organizationId: string, membershipId: string) =>
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
    activeRoles: (organizationId: string, membershipId: string) =>
      db
        .select({ role: organizationMembershipRoleGrants.role_key })
        .from(organizationMembershipRoleGrants)
        .where(
          and(
            eq(organizationMembershipRoleGrants.organization_id, organizationId),
            eq(organizationMembershipRoleGrants.membership_id, membershipId),
            lte(organizationMembershipRoleGrants.granted_at, sql`transaction_timestamp()`),
            isNull(organizationMembershipRoleGrants.revoked_at),
          ),
        ),
    lockActiveGrant: async (
      organizationId: string,
      membershipId: string,
      role: "admin" | "coach",
    ) =>
      (
        await db
          .select({ id: organizationMembershipRoleGrants.id })
          .from(organizationMembershipRoleGrants)
          .where(
            and(
              eq(organizationMembershipRoleGrants.organization_id, organizationId),
              eq(organizationMembershipRoleGrants.membership_id, membershipId),
              eq(organizationMembershipRoleGrants.role_key, role),
              lte(organizationMembershipRoleGrants.granted_at, sql`transaction_timestamp()`),
              isNull(organizationMembershipRoleGrants.revoked_at),
            ),
          )
          .for("update")
          .limit(1)
      )[0] ?? null,
    findOperationReceipt: async (organizationId: string, operationId: string) =>
      (
        await db
          .select({
            action: organizationAuditEvents.action,
            actorProfileId: organizationAuditEvents.actor_profile_id,
            actorMembershipId: organizationAuditEvents.actor_membership_id,
            targetMembershipId: organizationAuditEvents.resource_id,
            role: sql<"admin" | "coach" | null>`${organizationAuditEvents.details} ->> 'role_key'`,
          })
          .from(organizationAuditEvents)
          .where(
            and(
              eq(organizationAuditEvents.organization_id, organizationId),
              eq(organizationAuditEvents.correlation_id, operationId),
            ),
          )
          .limit(1)
      )[0] ?? null,
    grant: (organizationId: string, membershipId: string, role: "admin" | "coach") =>
      db
        .insert(organizationMembershipRoleGrants)
        .values({ organization_id: organizationId, membership_id: membershipId, role_key: role })
        .onConflictDoNothing()
        .returning({ id: organizationMembershipRoleGrants.id }),
    revoke: (organizationId: string, grantId: string) =>
      db
        .update(organizationMembershipRoleGrants)
        .set({ revoked_at: sql`transaction_timestamp()` })
        .where(
          and(
            eq(organizationMembershipRoleGrants.organization_id, organizationId),
            eq(organizationMembershipRoleGrants.id, grantId),
            isNull(organizationMembershipRoleGrants.revoked_at),
          ),
        ),
    endDirectAssignments: (organizationId: string, membershipId: string) =>
      db
        .update(coachingAssignments)
        .set({ ended_at: sql`transaction_timestamp()` })
        .where(
          and(
            eq(coachingAssignments.organization_id, organizationId),
            eq(coachingAssignments.coach_membership_id, membershipId),
            isNull(coachingAssignments.ended_at),
          ),
        )
        .returning({ id: coachingAssignments.id }),
    endGroupAssignments: (
      organizationId: string,
      membershipId: string,
      actorMembershipId: string,
    ) =>
      db
        .update(organizationGroupCoachAssignments)
        .set({
          ended_at: sql`transaction_timestamp()`,
          ended_by_membership_id: actorMembershipId,
        })
        .where(
          and(
            eq(organizationGroupCoachAssignments.organization_id, organizationId),
            eq(organizationGroupCoachAssignments.coach_membership_id, membershipId),
            isNull(organizationGroupCoachAssignments.ended_at),
          ),
        )
        .returning({ id: organizationGroupCoachAssignments.id }),
    audit: (input: {
      organizationId: string;
      actorProfileId: string;
      actorMembershipId: string;
      targetMembershipId: string;
      action: "organization.staff_role_granted" | "organization.staff_role_revoked";
      operationId: string;
      role: "admin" | "coach";
      endedDirectAssignments?: number;
      endedGroupAssignments?: number;
    }) =>
      db
        .insert(organizationAuditEvents)
        .values({
          organization_id: input.organizationId,
          actor_profile_id: input.actorProfileId,
          actor_membership_id: input.actorMembershipId,
          action: input.action,
          resource_type: "organization_membership_role_grant",
          resource_id: input.targetMembershipId,
          correlation_id: input.operationId,
          details: {
            role_key: input.role,
            ...(input.endedDirectAssignments === undefined
              ? {}
              : { ended_direct_assignments: input.endedDirectAssignments }),
            ...(input.endedGroupAssignments === undefined
              ? {}
              : { ended_group_assignments: input.endedGroupAssignments }),
          },
        })
        .onConflictDoNothing()
        .returning({ id: organizationAuditEvents.id }),
  };
}

export type OrganizationStaffRoleRepository = ReturnType<
  typeof createOrganizationStaffRoleRepository
>;

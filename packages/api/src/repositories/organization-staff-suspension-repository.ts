import {
  coachingAssignments,
  organizationAuditEvents,
  organizationGroupCoachAssignments,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
} from "@repo/db";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

export function createOrganizationStaffSuspensionRepository(db: DrizzleQueryExecutor) {
  return {
    lockOrganization: async (organizationId: string) =>
      (
        await db
          .select({
            id: organizations.id,
            rootMembershipId: organizations.root_owner_membership_id,
            suspendedAt: organizations.suspended_at,
            closedAt: organizations.closed_at,
          })
          .from(organizations)
          .where(eq(organizations.id, organizationId))
          .for("update")
          .limit(1)
      )[0] ?? null,
    lockMembershipForProfile: async (organizationId: string, profileId: string) =>
      (
        await db
          .select({
            membershipId: organizationMemberships.id,
            isRootOwner: sql<boolean>`${organizations.root_owner_membership_id} = ${organizationMemberships.id}`,
            suspendedAt: organizationMemberships.suspended_at,
            endedAt: organizationMemberships.ended_at,
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
    lockMembership: async (organizationId: string, membershipId: string) =>
      (
        await db
          .select({
            membershipId: organizationMemberships.id,
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
    findReceipt: async (organizationId: string, operationId: string) =>
      (
        await db
          .select({
            actorProfileId: organizationAuditEvents.actor_profile_id,
            action: organizationAuditEvents.action,
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
          .limit(1)
      )[0] ?? null,
    suspendMembership: (organizationId: string, membershipId: string) =>
      db
        .update(organizationMemberships)
        .set({ suspended_at: sql`transaction_timestamp()` })
        .where(
          and(
            eq(organizationMemberships.organization_id, organizationId),
            eq(organizationMemberships.id, membershipId),
            isNull(organizationMemberships.suspended_at),
          ),
        ),
    resumeMembership: (organizationId: string, membershipId: string) =>
      db
        .update(organizationMemberships)
        .set({ suspended_at: null })
        .where(
          and(
            eq(organizationMemberships.organization_id, organizationId),
            eq(organizationMemberships.id, membershipId),
            isNull(organizationMemberships.ended_at),
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
        ),
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
        ),
    recordReceipt: (input: {
      organizationId: string;
      actorProfileId: string;
      actorMembershipId: string;
      membershipId: string;
      action: "organization.membership_suspended" | "organization.membership_resumed";
      operationId: string;
      reason: string;
    }) =>
      db.insert(organizationAuditEvents).values({
        organization_id: input.organizationId,
        actor_profile_id: input.actorProfileId,
        actor_membership_id: input.actorMembershipId,
        action: input.action,
        resource_type: "organization_membership",
        resource_id: input.membershipId,
        correlation_id: input.operationId,
        details: { reason_code: input.reason },
      }),
  };
}

export type OrganizationStaffSuspensionRepository = ReturnType<
  typeof createOrganizationStaffSuspensionRepository
>;

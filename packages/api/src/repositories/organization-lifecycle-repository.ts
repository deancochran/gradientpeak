import {
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
} from "@repo/db";
import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

export type OrganizationLifecycleRepository = ReturnType<
  typeof createOrganizationLifecycleRepository
>;

export function createOrganizationLifecycleRepository(db: DrizzleQueryExecutor) {
  const activeOrganization = and(
    isNull(organizations.suspended_at),
    isNull(organizations.closed_at),
  );
  const activeMembership = and(
    isNull(organizationMemberships.suspended_at),
    isNull(organizationMemberships.ended_at),
  );
  const effectiveGrant = and(
    lte(organizationMembershipRoleGrants.granted_at, sql`transaction_timestamp()`),
    isNull(organizationMembershipRoleGrants.revoked_at),
  );

  return {
    async getCurrentAdministrativeAuthority(organizationId: string, profileId: string) {
      const [row] = await db
        .select({
          membershipId: organizationMemberships.id,
          isRootOwner: sql<boolean>`${organizations.root_owner_membership_id} = ${organizationMemberships.id}`,
          rootMembershipId: organizations.root_owner_membership_id,
        })
        .from(organizationMemberships)
        .innerJoin(organizations, eq(organizations.id, organizationMemberships.organization_id))
        .leftJoin(
          organizationMembershipRoleGrants,
          and(
            eq(organizationMembershipRoleGrants.organization_id, organizationId),
            eq(organizationMembershipRoleGrants.membership_id, organizationMemberships.id),
            eq(organizationMembershipRoleGrants.role_key, "admin"),
            effectiveGrant,
          ),
        )
        .where(
          and(
            eq(organizationMemberships.organization_id, organizationId),
            eq(organizationMemberships.profile_id, profileId),
            activeOrganization,
            activeMembership,
            or(
              eq(organizations.root_owner_membership_id, organizationMemberships.id),
              sql`${organizationMembershipRoleGrants.id} is not null`,
            ),
          ),
        )
        .limit(1);
      return row ?? null;
    },
    async staffCursorBelongsToOrganization(
      organizationId: string,
      cursor: string,
      status: "active" | "suspended",
    ) {
      const [row] = await db
        .select({ id: organizationMemberships.id })
        .from(organizationMemberships)
        .innerJoin(organizations, eq(organizations.id, organizationMemberships.organization_id))
        .where(
          and(
            eq(organizationMemberships.organization_id, organizationId),
            eq(organizationMemberships.id, cursor),
            activeOrganization,
            isNull(organizationMemberships.ended_at),
            status === "active"
              ? isNull(organizationMemberships.suspended_at)
              : sql`${organizationMemberships.suspended_at} is not null`,
          ),
        )
        .limit(1);
      return row !== undefined;
    },
    listCurrentStaff(
      organizationId: string,
      limit: number,
      cursor: string | null,
      status: "active" | "suspended",
    ) {
      return db
        .select({
          membershipId: organizationMemberships.id,
          isRootOwner: sql<boolean>`${organizations.root_owner_membership_id} = ${organizationMemberships.id}`,
          profileId: profiles.id,
          displayName: profiles.full_name,
          username: profiles.username,
          suspendedAt: organizationMemberships.suspended_at,
          roleKeys: sql<
            string[]
          >`array_agg(${organizationMembershipRoleGrants.role_key} order by ${organizationMembershipRoleGrants.role_key})`,
        })
        .from(organizationMemberships)
        .innerJoin(organizations, eq(organizations.id, organizationMemberships.organization_id))
        .innerJoin(profiles, eq(profiles.id, organizationMemberships.profile_id))
        .innerJoin(
          organizationMembershipRoleGrants,
          and(
            eq(organizationMembershipRoleGrants.organization_id, organizationId),
            eq(organizationMembershipRoleGrants.membership_id, organizationMemberships.id),
            effectiveGrant,
          ),
        )
        .where(
          and(
            eq(organizationMemberships.organization_id, organizationId),
            activeOrganization,
            isNull(organizationMemberships.ended_at),
            status === "active"
              ? isNull(organizationMemberships.suspended_at)
              : sql`${organizationMemberships.suspended_at} is not null`,
            ...(cursor ? [gt(organizationMemberships.id, cursor)] : []),
          ),
        )
        .groupBy(
          organizationMemberships.id,
          organizations.root_owner_membership_id,
          profiles.id,
          profiles.full_name,
          profiles.username,
        )
        .orderBy(asc(organizationMemberships.id))
        .limit(limit + 1);
    },
    async rosterCursorBelongsToOrganization(organizationId: string, cursor: string) {
      const [row] = await db
        .select({ id: coachingEngagements.id })
        .from(coachingEngagements)
        .innerJoin(organizations, eq(organizations.id, coachingEngagements.organization_id))
        .where(
          and(
            eq(coachingEngagements.organization_id, organizationId),
            eq(coachingEngagements.id, cursor),
            activeOrganization,
            isNull(coachingEngagements.ended_at),
          ),
        )
        .limit(1);
      return row !== undefined;
    },
    listCurrentAthleteRoster(organizationId: string, limit: number, cursor: string | null) {
      return db
        .select({
          engagementId: coachingEngagements.id,
          profileId: profiles.id,
          displayName: profiles.full_name,
          username: profiles.username,
          pausedAt: coachingEngagements.paused_at,
        })
        .from(coachingEngagements)
        .innerJoin(organizations, eq(organizations.id, coachingEngagements.organization_id))
        .innerJoin(profiles, eq(profiles.id, coachingEngagements.athlete_profile_id))
        .where(
          and(
            eq(coachingEngagements.organization_id, organizationId),
            activeOrganization,
            isNull(coachingEngagements.ended_at),
            ...(cursor ? [gt(coachingEngagements.id, cursor)] : []),
          ),
        )
        .orderBy(asc(coachingEngagements.id))
        .limit(limit + 1);
    },
    async endMembership(input: {
      actorProfileId: string;
      organizationId: string;
      membershipId: string;
      reason: string;
      correlationId: string;
    }) {
      const [row] = await db
        .select({
          invoked: sql<unknown>`public.end_organization_membership(
            ${input.actorProfileId}::uuid,
            ${input.organizationId}::uuid,
            ${input.membershipId}::uuid,
            ${input.reason},
            ${input.correlationId}::uuid
          )`,
        })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1);
      return row ?? null;
    },
    async endEngagement(input: {
      actorProfileId: string;
      organizationId: string;
      engagementId: string;
      reason: string;
      correlationId: string;
    }) {
      const [row] = await db
        .select({
          invoked: sql<unknown>`public.end_coaching_engagement(
            ${input.actorProfileId}::uuid,
            ${input.organizationId}::uuid,
            ${input.engagementId}::uuid,
            ${input.reason},
            ${input.correlationId}::uuid
          )`,
        })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1);
      return row ?? null;
    },
    async withdrawConsent(input: {
      actorProfileId: string;
      organizationId: string;
      consentId: string;
      reason: string;
      correlationId: string;
    }) {
      const [row] = await db
        .select({
          invoked: sql<unknown>`public.withdraw_athlete_consent(
            ${input.actorProfileId}::uuid,
            ${input.organizationId}::uuid,
            ${input.consentId}::uuid,
            ${input.reason},
            ${input.correlationId}::uuid
          )`,
        })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1);
      return row ?? null;
    },
  };
}

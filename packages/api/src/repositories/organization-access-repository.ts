import { organizationMembershipRoleGrants, organizationMemberships, organizations } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

export type OrganizationListCursor = {
  name: string;
  slug: string;
  organizationId: string;
};

export type OrganizationMembershipContextRow = {
  organizationId: string;
  rootOwnerMembershipId: string;
  name: string;
  slug: string;
  timezone: string;
  organizationSuspendedAt: Date | null;
  organizationClosedAt: Date | null;
  organizationCreatedAt: Date;
  organizationUpdatedAt: Date;
  membershipId: string;
  profileId: string;
  membershipSuspendedAt: Date | null;
  membershipEndedAt: Date | null;
  roleKeys: string[];
};

export type OrganizationAccessRepository = {
  listActiveMembershipContexts(input: {
    profileId: string;
    limit: number;
    cursor: OrganizationListCursor | null;
  }): Promise<OrganizationMembershipContextRow[]>;
  findActiveMembershipContext(input: {
    organizationId: string;
    profileId: string;
  }): Promise<OrganizationMembershipContextRow | null>;
};

export function createOrganizationAccessRepository(
  db: DrizzleDbClient,
): OrganizationAccessRepository {
  const selectContext = (
    profileId: string,
    organizationId?: string,
    cursor?: OrganizationListCursor | null,
  ) =>
    db
      .select({
        organizationId: organizations.id,
        rootOwnerMembershipId: organizations.root_owner_membership_id,
        name: organizations.name,
        slug: organizations.slug,
        timezone: organizations.timezone,
        organizationSuspendedAt: organizations.suspended_at,
        organizationClosedAt: organizations.closed_at,
        organizationCreatedAt: organizations.created_at,
        organizationUpdatedAt: organizations.updated_at,
        membershipId: organizationMemberships.id,
        profileId: organizationMemberships.profile_id,
        membershipSuspendedAt: organizationMemberships.suspended_at,
        membershipEndedAt: organizationMemberships.ended_at,
        roleKeys: sql<
          string[]
        >`coalesce(array_agg(${organizationMembershipRoleGrants.role_key}) filter (where ${organizationMembershipRoleGrants.role_key} is not null), array[]::text[])`,
      })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizations.id, organizationMemberships.organization_id))
      .leftJoin(
        organizationMembershipRoleGrants,
        and(
          eq(organizationMembershipRoleGrants.organization_id, organizations.id),
          eq(organizationMembershipRoleGrants.membership_id, organizationMemberships.id),
          lte(organizationMembershipRoleGrants.granted_at, sql`transaction_timestamp()`),
          isNull(organizationMembershipRoleGrants.revoked_at),
        ),
      )
      .where(
        and(
          eq(organizationMemberships.profile_id, profileId),
          isNull(organizationMemberships.suspended_at),
          isNull(organizationMemberships.ended_at),
          isNull(organizations.suspended_at),
          isNull(organizations.closed_at),
          ...(organizationId === undefined ? [] : [eq(organizations.id, organizationId)]),
          ...(cursor
            ? [
                or(
                  gt(organizations.name, cursor.name),
                  and(eq(organizations.name, cursor.name), gt(organizations.slug, cursor.slug)),
                  and(
                    eq(organizations.name, cursor.name),
                    eq(organizations.slug, cursor.slug),
                    gt(organizations.id, cursor.organizationId),
                  ),
                ),
              ]
            : []),
        ),
      )
      .groupBy(
        organizations.id,
        organizations.root_owner_membership_id,
        organizations.name,
        organizations.slug,
        organizations.timezone,
        organizations.suspended_at,
        organizations.closed_at,
        organizations.created_at,
        organizations.updated_at,
        organizationMemberships.id,
        organizationMemberships.profile_id,
        organizationMemberships.suspended_at,
        organizationMemberships.ended_at,
      )
      .orderBy(asc(organizations.name), asc(organizations.slug), asc(organizations.id));

  return {
    listActiveMembershipContexts: ({ profileId, limit, cursor }) =>
      selectContext(profileId, undefined, cursor).limit(limit + 1),
    async findActiveMembershipContext({ organizationId, profileId }) {
      const rows = await selectContext(profileId, organizationId).limit(1);
      return rows[0] ?? null;
    },
  };
}

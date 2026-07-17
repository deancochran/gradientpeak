import type { OrganizationCapabilityCheck } from "@repo/core/organizations";
import {
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizationRolePermissionGrants,
  organizationRoles,
  organizations,
} from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { and, eq } from "drizzle-orm";

export type OrganizationIdentity = {
  id: string;
  name: string;
  slug: string;
};

export type OrganizationAccessRepository = {
  findOrganizationWithCapability(
    check: OrganizationCapabilityCheck,
  ): Promise<OrganizationIdentity | null>;
};

export function createOrganizationAccessRepository(
  db: DrizzleDbClient,
): OrganizationAccessRepository {
  return {
    async findOrganizationWithCapability(check) {
      const rows = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
        })
        .from(organizations)
        .innerJoin(
          organizationMemberships,
          eq(organizationMemberships.organization_id, organizations.id),
        )
        .innerJoin(
          organizationMembershipRoleGrants,
          and(
            eq(organizationMembershipRoleGrants.membership_id, organizationMemberships.id),
            eq(organizationMembershipRoleGrants.organization_id, organizations.id),
          ),
        )
        .innerJoin(
          organizationRoles,
          and(
            eq(organizationRoles.id, organizationMembershipRoleGrants.role_id),
            eq(organizationRoles.organization_id, organizations.id),
          ),
        )
        .innerJoin(
          organizationRolePermissionGrants,
          eq(organizationRolePermissionGrants.role_id, organizationRoles.id),
        )
        .where(
          and(
            eq(organizations.id, check.organizationId),
            eq(organizationMemberships.profile_id, check.profileId),
            eq(organizationMemberships.status, "active"),
            eq(organizationMembershipRoleGrants.status, "active"),
            eq(organizationRolePermissionGrants.permission_key, check.permission),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    },
  };
}

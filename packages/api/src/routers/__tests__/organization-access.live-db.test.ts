import { randomUUID } from "node:crypto";
import { COACHING_ACCESS_PERMISSION } from "@repo/core/organizations";
import { db, pool } from "@repo/db/client";
import {
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizationPermissions,
  organizationRolePermissionGrants,
  organizationRoles,
  organizations,
  profiles,
  users,
} from "@repo/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createOrganizationAccessRepository } from "../../repositories/organization-access-repository";

const seededOrganizationIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedProfile(label: string) {
  const id = randomUUID();
  const email = `${id}@organization-access.test`;
  const now = new Date();

  await db.insert(users).values({
    id,
    name: label,
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(profiles).values({
    id,
    email,
    full_name: label,
    username: `${label}-${id.slice(0, 8)}`,
    onboarded: true,
    is_public: false,
    created_at: now,
    updated_at: now,
  });
  seededProfileIds.push(id);
  return id;
}

async function seedOrganization(createdByProfileId: string, label: string) {
  const id = randomUUID();
  await db.insert(organizations).values({
    id,
    created_by_profile_id: createdByProfileId,
    name: label,
    slug: `${label.toLowerCase().replaceAll(" ", "-")}-${id}`,
  });
  seededOrganizationIds.push(id);
  return id;
}

afterEach(async () => {
  if (seededOrganizationIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, seededOrganizationIds));
  }
  if (seededProfileIds.length > 0) {
    await db.delete(profiles).where(inArray(profiles.id, seededProfileIds));
    await db.delete(users).where(inArray(users.id, seededProfileIds));
  }
  seededOrganizationIds.length = 0;
  seededProfileIds.length = 0;
});

afterAll(async () => pool.end());

describe("organization coaching access against PostgreSQL", () => {
  it("grants only a fully active same-organization membership and permission chain", async () => {
    const coachProfileId = await seedProfile("coach");
    const otherProfileId = await seedProfile("other");
    const organizationId = await seedOrganization(coachProfileId, "Peak Coaching");
    const otherOrganizationId = await seedOrganization(otherProfileId, "Other Coaching");
    const [membership] = await db
      .insert(organizationMemberships)
      .values({ organization_id: organizationId, profile_id: coachProfileId, status: "active" })
      .returning();
    const [role] = await db
      .insert(organizationRoles)
      .values({ organization_id: organizationId, key: "coach", name: "Coach" })
      .returning();
    const [otherRole] = await db
      .insert(organizationRoles)
      .values({ organization_id: otherOrganizationId, key: "coach", name: "Coach" })
      .returning();

    if (!membership || !role || !otherRole) throw new Error("Expected organization seed rows");

    await db
      .insert(organizationPermissions)
      .values({
        key: COACHING_ACCESS_PERMISSION,
        description: "Access the organization coaching workspace",
      })
      .onConflictDoNothing();
    await db.insert(organizationRolePermissionGrants).values({
      role_id: role.id,
      permission_key: COACHING_ACCESS_PERMISSION,
    });
    await db.insert(organizationMembershipRoleGrants).values({
      organization_id: organizationId,
      membership_id: membership.id,
      role_id: role.id,
      status: "active",
    });

    const repository = createOrganizationAccessRepository(db);
    const check = {
      organizationId,
      profileId: coachProfileId,
      permission: COACHING_ACCESS_PERMISSION,
    } as const;

    await expect(repository.findOrganizationWithCapability(check)).resolves.toMatchObject({
      id: organizationId,
      name: "Peak Coaching",
    });
    await expect(
      repository.findOrganizationWithCapability({ ...check, profileId: otherProfileId }),
    ).resolves.toBeNull();

    await db
      .update(organizationMemberships)
      .set({ status: "inactive" })
      .where(eq(organizationMemberships.id, membership.id));
    await expect(repository.findOrganizationWithCapability(check)).resolves.toBeNull();

    await db
      .update(organizationMemberships)
      .set({ status: "active" })
      .where(eq(organizationMemberships.id, membership.id));
    await db
      .update(organizationMembershipRoleGrants)
      .set({ status: "inactive" })
      .where(
        and(
          eq(organizationMembershipRoleGrants.membership_id, membership.id),
          eq(organizationMembershipRoleGrants.role_id, role.id),
        ),
      );
    await expect(repository.findOrganizationWithCapability(check)).resolves.toBeNull();

    await db
      .update(organizationMembershipRoleGrants)
      .set({ status: "active" })
      .where(
        and(
          eq(organizationMembershipRoleGrants.membership_id, membership.id),
          eq(organizationMembershipRoleGrants.role_id, role.id),
        ),
      );
    await db
      .delete(organizationRolePermissionGrants)
      .where(eq(organizationRolePermissionGrants.role_id, role.id));
    await expect(repository.findOrganizationWithCapability(check)).resolves.toBeNull();

    await expect(
      db.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: membership.id,
        role_id: otherRole.id,
        status: "active",
      }),
    ).rejects.toThrow();
  });
});

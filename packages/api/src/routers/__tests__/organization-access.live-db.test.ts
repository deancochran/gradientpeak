import { randomUUID } from "node:crypto";
import { pool } from "@repo/db/client";
import {
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
  relationalSchema,
  users,
} from "@repo/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it } from "vitest";
import { createOrganizationAccessRepository } from "../../repositories/organization-access-repository";

function hasExplicitDisposableLocalDatabase(): boolean {
  if (process.env.RUN_LIVE_DB_TESTS !== "1") return false;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      ["127.0.0.1", "[::1]"].includes(parsed.hostname) &&
      /^gradientpeak_[a-z_]+_\d+_\d+$/.test(parsed.pathname.slice(1))
    );
  } catch {
    return false;
  }
}

const describeDisposable = hasExplicitDisposableLocalDatabase() ? describe : describe.skip;

afterAll(async () => pool.end());

describeDisposable("organization access against a disposable migrated PostgreSQL database", () => {
  it("uses only active fixed grants and membership lifecycle state", async () => {
    const connection = await pool.connect();
    try {
      await connection.query("begin");
      await connection.query("set constraints all deferred");
      const db = drizzle({ client: connection, schema: relationalSchema, casing: "snake_case" });
      const coachProfileId = randomUUID();
      const rootProfileId = randomUUID();
      const otherProfileId = randomUUID();
      const organizationId = randomUUID();
      const otherOrganizationId = randomUUID();
      const rootMembershipId = randomUUID();
      const coachMembershipId = randomUUID();
      const otherRootMembershipId = randomUUID();
      const now = new Date();
      const future = new Date(now.getTime() + 60_000);

      for (const [id, label] of [
        [coachProfileId, "coach"],
        [rootProfileId, "root"],
        [otherProfileId, "other"],
      ] as const) {
        const email = `${id}@organization-access.test`;
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
          onboarding_status: "completed",
          is_public: false,
          created_at: now,
          updated_at: now,
        });
      }

      // The organization/root-member/admin-grant graph must commit together under deferred FKs.
      await db.insert(organizations).values({
        id: organizationId,
        created_by_profile_id: rootProfileId,
        root_owner_membership_id: rootMembershipId,
        name: "Peak Coaching",
        slug: `peak-coaching-${organizationId}`,
        timezone: "UTC",
      });
      await db.insert(organizations).values({
        id: otherOrganizationId,
        created_by_profile_id: otherProfileId,
        root_owner_membership_id: otherRootMembershipId,
        name: "Other Coaching",
        slug: `other-coaching-${otherOrganizationId}`,
        timezone: "UTC",
      });
      await db.insert(organizationMemberships).values([
        { id: rootMembershipId, organization_id: organizationId, profile_id: rootProfileId },
        { id: coachMembershipId, organization_id: organizationId, profile_id: coachProfileId },
        {
          id: otherRootMembershipId,
          organization_id: otherOrganizationId,
          profile_id: otherProfileId,
        },
      ]);
      await db.insert(organizationMembershipRoleGrants).values([
        { organization_id: organizationId, membership_id: rootMembershipId, role_key: "admin" },
        {
          organization_id: organizationId,
          membership_id: coachMembershipId,
          role_key: "coach",
          granted_at: future,
        },
        {
          organization_id: otherOrganizationId,
          membership_id: otherRootMembershipId,
          role_key: "admin",
        },
      ]);

      const repository = createOrganizationAccessRepository(
        db as unknown as typeof import("@repo/db/client").db,
      );
      await expect(
        repository.findActiveMembershipContext({ organizationId, profileId: coachProfileId }),
      ).resolves.toBeNull();
      await db
        .update(organizationMembershipRoleGrants)
        .set({ revoked_at: future })
        .where(
          and(
            eq(organizationMembershipRoleGrants.organization_id, organizationId),
            eq(organizationMembershipRoleGrants.membership_id, coachMembershipId),
          ),
        );
      await db.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: coachMembershipId,
        role_key: "coach",
        granted_at: now,
      });
      await expect(
        repository.findActiveMembershipContext({ organizationId, profileId: coachProfileId }),
      ).resolves.toEqual(expect.objectContaining({ membershipId: coachMembershipId }));
      await expect(
        repository.findActiveMembershipContext({ organizationId, profileId: rootProfileId }),
      ).resolves.toEqual(
        expect.objectContaining({ membershipId: rootMembershipId, roleKeys: ["admin"] }),
      );
      await expect(
        repository.findActiveMembershipContext({
          organizationId: otherOrganizationId,
          profileId: coachProfileId,
        }),
      ).resolves.toBeNull();

      await db
        .update(organizations)
        .set({ suspended_at: now })
        .where(eq(organizations.id, organizationId));
      await expect(
        repository.findActiveMembershipContext({ organizationId, profileId: coachProfileId }),
      ).resolves.toBeNull();
      await db
        .update(organizations)
        .set({ suspended_at: null })
        .where(eq(organizations.id, organizationId));

      await db
        .update(organizationMemberships)
        .set({ suspended_at: now })
        .where(eq(organizationMemberships.id, coachMembershipId));
      await expect(
        repository.findActiveMembershipContext({ organizationId, profileId: coachProfileId }),
      ).resolves.toBeNull();

      await db
        .update(organizationMemberships)
        .set({ suspended_at: null })
        .where(eq(organizationMemberships.id, coachMembershipId));

      await db
        .update(organizationMembershipRoleGrants)
        .set({ revoked_at: now })
        .where(
          and(
            eq(organizationMembershipRoleGrants.organization_id, organizationId),
            eq(organizationMembershipRoleGrants.membership_id, coachMembershipId),
            isNull(organizationMembershipRoleGrants.revoked_at),
          ),
        );
      await expect(
        repository.findActiveMembershipContext({ organizationId, profileId: coachProfileId }),
      ).resolves.toBeNull();

      await db
        .update(organizationMemberships)
        .set({ ended_at: now })
        .where(eq(organizationMemberships.id, coachMembershipId));
      await expect(
        repository.findActiveMembershipContext({ organizationId, profileId: coachProfileId }),
      ).resolves.toBeNull();

      await connection.query("set constraints all immediate");
    } finally {
      await connection.query("rollback");
      connection.release();
    }
  });
});

import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { groupInvitations, groupMemberships, groups, profiles, users } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createRouterCaller } from "../../test/router";
import { groupsRouter } from "../groups";

afterAll(async () => pool.end());

describe("groups admin invitation idempotency against PostgreSQL", () => {
  it("returns the same invitation and stores one pending row across repeated public calls", async () => {
    const adminId = randomUUID();
    const targetId = randomUUID();
    const groupId = randomUUID();
    const adminEmail = `${adminId}@groups-admin-idempotency.test`;
    const targetEmail = `${targetId}@groups-admin-idempotency.test`;
    const now = new Date();

    try {
      await db.insert(users).values([
        {
          id: adminId,
          name: "Invitation admin",
          email: adminEmail,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: targetId,
          name: "Invitation target",
          email: targetEmail,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await db.insert(profiles).values([
        {
          id: adminId,
          email: adminEmail,
          full_name: "Invitation admin",
          username: `invitation-admin-${adminId.slice(0, 8)}`,
          language: "en",
          preferred_units: "metric",
          onboarding_status: "completed",
          is_public: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: targetId,
          email: targetEmail,
          full_name: "Invitation target",
          username: `invitation-target-${targetId.slice(0, 8)}`,
          language: "en",
          preferred_units: "metric",
          onboarding_status: "completed",
          is_public: true,
          created_at: now,
          updated_at: now,
        },
      ]);
      await db.insert(groups).values({
        id: groupId,
        created_by_profile_id: adminId,
        name: `Invitation idempotency ${groupId.slice(0, 8)}`,
        slug: `invitation-idempotency-${groupId}`,
        access_level: "public",
        join_policy: "invite_only",
      });
      await db.insert(groupMemberships).values({
        group_id: groupId,
        profile_id: adminId,
        role: "admin",
        status: "active",
      });

      const caller = createRouterCaller(groupsRouter, { db, userId: adminId });
      const first = await caller.inviteProfiles({ groupId, profileIds: [targetId] });
      const second = await caller.inviteProfiles({ groupId, profileIds: [targetId] });
      const invitations = await db
        .select()
        .from(groupInvitations)
        .where(
          and(
            eq(groupInvitations.group_id, groupId),
            eq(groupInvitations.invited_profile_id, targetId),
            eq(groupInvitations.status, "pending"),
          ),
        );

      expect(first.invitations).toHaveLength(1);
      expect(second.invitations).toEqual(first.invitations);
      expect(invitations).toHaveLength(1);
      expect(second.invitations[0]?.id).toBe(invitations[0]?.id);
    } finally {
      await db.delete(groupInvitations).where(eq(groupInvitations.group_id, groupId));
      await db.delete(groupMemberships).where(eq(groupMemberships.group_id, groupId));
      await db.delete(groups).where(eq(groups.id, groupId));
      await db.delete(profiles).where(eq(profiles.id, adminId));
      await db.delete(profiles).where(eq(profiles.id, targetId));
      await db.delete(users).where(eq(users.id, adminId));
      await db.delete(users).where(eq(users.id, targetId));
    }
  });
});

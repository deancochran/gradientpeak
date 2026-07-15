import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  groupInvitations,
  groupJoinRequests,
  groupMemberships,
  groups,
  profiles,
  users,
} from "@repo/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { setGroupMembershipActive } from "../../application/groups/membershipMutations";
import { createRouterCaller } from "../../test/router";
import { groupsRouter } from "../groups";

const seededUserIds: string[] = [];
const seededGroupIds: string[] = [];

async function seedProfile(label: string) {
  const id = randomUUID();
  const email = `${id}@groups-concurrency.test`;
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
    language: "en",
    preferred_units: "metric",
    onboarded: true,
    is_public: true,
    created_at: now,
    updated_at: now,
  });
  seededUserIds.push(id);
  return id;
}

async function seedGroup(creatorId: string, joinPolicy: "open" | "invite_only") {
  const id = randomUUID();
  await db.insert(groups).values({
    id,
    created_by_profile_id: creatorId,
    name: `Concurrent group ${id.slice(0, 8)}`,
    slug: `concurrent-${id}`,
    access_level: "public",
    join_policy: joinPolicy,
  });
  seededGroupIds.push(id);
  return id;
}

afterEach(async () => {
  if (seededGroupIds.length > 0) {
    await db.delete(groups).where(inArray(groups.id, seededGroupIds));
  }
  if (seededUserIds.length > 0) {
    await db.delete(profiles).where(inArray(profiles.id, seededUserIds));
    await db.delete(users).where(inArray(users.id, seededUserIds));
  }
  seededGroupIds.length = 0;
  seededUserIds.length = 0;
});

afterAll(async () => pool.end());

describe("group onboarding concurrency against PostgreSQL", () => {
  it("keeps duplicate canonical joins idempotent and preserves elevated or removed memberships", async () => {
    const creatorId = await seedProfile("join-creator");
    const viewerId = await seedProfile("join-viewer");
    const groupId = await seedGroup(creatorId, "open");
    const caller = createRouterCaller(groupsRouter, { db, userId: viewerId });

    await Promise.all(Array.from({ length: 8 }, () => caller.joinOrRequest({ groupId })));

    const memberships = await db
      .select()
      .from(groupMemberships)
      .where(
        and(eq(groupMemberships.group_id, groupId), eq(groupMemberships.profile_id, viewerId)),
      );
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ role: "member", status: "active" });

    await db
      .update(groupMemberships)
      .set({ role: "admin", status: "left" })
      .where(
        and(eq(groupMemberships.group_id, groupId), eq(groupMemberships.profile_id, viewerId)),
      );
    await setGroupMembershipActive(db, { groupId, profileId: viewerId });
    await expect(
      db
        .select({ role: groupMemberships.role, status: groupMemberships.status })
        .from(groupMemberships)
        .where(
          and(eq(groupMemberships.group_id, groupId), eq(groupMemberships.profile_id, viewerId)),
        ),
    ).resolves.toEqual([{ role: "admin", status: "active" }]);

    await db
      .update(groupMemberships)
      .set({ status: "removed" })
      .where(
        and(eq(groupMemberships.group_id, groupId), eq(groupMemberships.profile_id, viewerId)),
      );
    await setGroupMembershipActive(db, { groupId, profileId: viewerId });
    await expect(
      db
        .select({ status: groupMemberships.status })
        .from(groupMemberships)
        .where(
          and(eq(groupMemberships.group_id, groupId), eq(groupMemberships.profile_id, viewerId)),
        ),
    ).resolves.toEqual([{ status: "removed" }]);
    await expect(caller.joinOrRequest({ groupId })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot join this group",
    });
  });

  it("returns the winning pending request under concurrent canonical retries", async () => {
    const creatorId = await seedProfile("request-creator");
    const viewerId = await seedProfile("request-viewer");
    const groupId = await seedGroup(creatorId, "invite_only");
    const caller = createRouterCaller(groupsRouter, { db, userId: viewerId });

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => caller.joinOrRequest({ groupId })),
    );
    const requests = await db
      .select()
      .from(groupJoinRequests)
      .where(
        and(eq(groupJoinRequests.group_id, groupId), eq(groupJoinRequests.profile_id, viewerId)),
      );

    expect(requests).toHaveLength(1);
    expect(outcomes.every((outcome) => "id" in outcome.result)).toBe(true);
    expect(
      new Set(outcomes.map((outcome) => ("id" in outcome.result ? outcome.result.id : null))),
    ).toEqual(new Set([requests[0]?.id]));
  });

  it("conditionally claims one invitation while concurrent accept retries share the result", async () => {
    const creatorId = await seedProfile("invite-creator");
    const viewerId = await seedProfile("invite-viewer");
    const groupId = await seedGroup(creatorId, "invite_only");
    const [invitation] = await db
      .insert(groupInvitations)
      .values({ group_id: groupId, invited_profile_id: viewerId, status: "pending" })
      .returning();
    const caller = createRouterCaller(groupsRouter, { db, userId: viewerId });

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () =>
        caller.acceptInvite({ invitationId: invitation?.id as string }),
      ),
    );
    const [storedInvitation] = await db
      .select()
      .from(groupInvitations)
      .where(eq(groupInvitations.id, invitation?.id as string));
    const memberships = await db
      .select()
      .from(groupMemberships)
      .where(
        and(eq(groupMemberships.group_id, groupId), eq(groupMemberships.profile_id, viewerId)),
      );

    expect(storedInvitation?.status).toBe("accepted");
    expect(memberships).toHaveLength(1);
    expect(outcomes.every((outcome) => outcome.membership.status === "active")).toBe(true);
  });

  it("excludes elapsed invitations while retaining null and future expirations", async () => {
    const creatorId = await seedProfile("expiry-creator");
    const viewerId = await seedProfile("expiry-viewer");
    const nullGroupId = await seedGroup(creatorId, "invite_only");
    const futureGroupId = await seedGroup(creatorId, "invite_only");
    const elapsedGroupId = await seedGroup(creatorId, "invite_only");
    const now = new Date();
    await db.insert(groupInvitations).values([
      { group_id: nullGroupId, invited_profile_id: viewerId, status: "pending", expires_at: null },
      {
        group_id: futureGroupId,
        invited_profile_id: viewerId,
        status: "pending",
        expires_at: new Date(now.getTime() + 60_000),
      },
      {
        group_id: elapsedGroupId,
        invited_profile_id: viewerId,
        status: "pending",
        expires_at: now,
      },
    ]);
    const caller = createRouterCaller(groupsRouter, { db, userId: viewerId });

    const discoverable = await caller.listDiscoverable({ limit: 20 });
    const viewerByGroup = new Map(
      discoverable.items.map((group) => [group.id, group.viewer.hasPendingInvite]),
    );
    expect(viewerByGroup.get(nullGroupId)).toBe(true);
    expect(viewerByGroup.get(futureGroupId)).toBe(true);
    expect(viewerByGroup.get(elapsedGroupId)).toBe(false);

    const invitations = await caller.myInvitations({ limit: 20 });
    expect(new Set(invitations.items.map((item) => item.group_id))).toEqual(
      new Set([nullGroupId, futureGroupId]),
    );
  });
});

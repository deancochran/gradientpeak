import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { follows, notifications, profiles, users } from "@repo/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  acceptFollowRequest,
  followUser,
  rejectFollowRequest,
} from "../../application/social/followMutations";
import { searchSocialUsers } from "../../repositories/social-user-search-repository";

const seededUserIds: string[] = [];

async function seedProfile(label: string, isPublic: boolean) {
  const id = randomUUID();
  const email = `${id}@social-concurrency.test`;
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
    is_public: isPublic,
    created_at: now,
    updated_at: now,
  });
  seededUserIds.push(id);
  return id;
}

afterEach(async () => {
  if (seededUserIds.length === 0) return;
  await db.delete(notifications).where(inArray(notifications.user_id, seededUserIds));
  await db.delete(follows).where(inArray(follows.follower_id, seededUserIds));
  await db.delete(profiles).where(inArray(profiles.id, seededUserIds));
  await db.delete(users).where(inArray(users.id, seededUserIds));
  seededUserIds.length = 0;
});

afterAll(async () => pool.end());

describe("social follow concurrency against PostgreSQL", () => {
  it("limits full-name discovery and disclosure to public or accepted-access profiles", async () => {
    const viewerId = await seedProfile("privacy-viewer", true);
    const publicId = await seedProfile("privacy-public", true);
    const unrelatedId = await seedProfile("privacy-unrelated", false);
    const pendingId = await seedProfile("privacy-pending", false);
    const acceptedId = await seedProfile("privacy-accepted", false);
    await db
      .update(profiles)
      .set({ full_name: "Public Full Name" })
      .where(eq(profiles.id, publicId));
    await db
      .update(profiles)
      .set({ full_name: "Unrelated Private Name" })
      .where(eq(profiles.id, unrelatedId));
    await db
      .update(profiles)
      .set({ full_name: "Pending Private Name" })
      .where(eq(profiles.id, pendingId));
    await db
      .update(profiles)
      .set({ full_name: "Accepted Private Name" })
      .where(eq(profiles.id, acceptedId));
    const now = new Date();
    await db.insert(follows).values([
      {
        follower_id: viewerId,
        following_id: pendingId,
        status: "pending",
        created_at: now,
        updated_at: now,
      },
      {
        follower_id: viewerId,
        following_id: acceptedId,
        status: "accepted",
        created_at: now,
        updated_at: now,
      },
    ]);

    const search = (query: string) =>
      searchSocialUsers({
        db,
        viewerId,
        input: { query, limit: 20, offset: 0 },
      });

    await expect(search("Public Full Name")).resolves.toMatchObject({
      total: 1,
      users: [{ id: publicId, full_name: "Public Full Name" }],
    });
    await expect(search("Unrelated Private Name")).resolves.toMatchObject({ total: 0, users: [] });
    await expect(search("Pending Private Name")).resolves.toMatchObject({ total: 0, users: [] });
    await expect(search("Accepted Private Name")).resolves.toMatchObject({
      total: 1,
      users: [{ id: acceptedId, full_name: "Accepted Private Name", follow_status: "accepted" }],
    });

    await expect(search("privacy-unrelated")).resolves.toMatchObject({
      users: [{ id: unrelatedId, full_name: null, follow_status: null }],
    });
    await expect(search("privacy-pending")).resolves.toMatchObject({
      users: [{ id: pendingId, full_name: null, follow_status: "pending" }],
    });
  });

  it("creates one pending relationship and one request notification under concurrent retries", async () => {
    const followerId = await seedProfile("follower", true);
    const privateTargetId = await seedProfile("private-target", false);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        followUser({ db, viewerId: followerId, targetUserId: privateTargetId }),
      ),
    );

    const relationships = await db
      .select()
      .from(follows)
      .where(and(eq(follows.follower_id, followerId), eq(follows.following_id, privateTargetId)));
    const requestNotifications = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.user_id, privateTargetId),
          eq(notifications.actor_id, followerId),
          eq(notifications.type, "follow_request"),
        ),
      );

    expect(relationships).toHaveLength(1);
    expect(relationships[0]?.status).toBe("pending");
    expect(requestNotifications).toHaveLength(1);
    expect(results.filter((result) => !("already_pending" in result))).toHaveLength(1);
  });

  it("accepts once and emits one new-follower notification under concurrent decisions", async () => {
    const followerId = await seedProfile("accept-follower", true);
    const privateTargetId = await seedProfile("accept-target", false);
    await followUser({ db, viewerId: followerId, targetUserId: privateTargetId });

    await Promise.all(
      Array.from({ length: 8 }, () => acceptFollowRequest(db, privateTargetId, followerId)),
    );

    const [relationship] = await db
      .select()
      .from(follows)
      .where(and(eq(follows.follower_id, followerId), eq(follows.following_id, privateTargetId)));
    const acceptedNotifications = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.user_id, followerId),
          eq(notifications.actor_id, privateTargetId),
          eq(notifications.type, "new_follower"),
        ),
      );

    expect(relationship?.status).toBe("accepted");
    expect(acceptedNotifications).toHaveLength(1);
  });

  it("rejects once without emitting an accepted notification", async () => {
    const followerId = await seedProfile("reject-follower", true);
    const privateTargetId = await seedProfile("reject-target", false);
    await followUser({ db, viewerId: followerId, targetUserId: privateTargetId });

    await Promise.all(
      Array.from({ length: 8 }, () => rejectFollowRequest(db, privateTargetId, followerId)),
    );

    const relationships = await db
      .select()
      .from(follows)
      .where(and(eq(follows.follower_id, followerId), eq(follows.following_id, privateTargetId)));
    const acceptedNotifications = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.user_id, followerId),
          eq(notifications.actor_id, privateTargetId),
          eq(notifications.type, "new_follower"),
        ),
      );

    expect(relationships).toHaveLength(0);
    expect(acceptedNotifications).toHaveLength(0);
  });
});

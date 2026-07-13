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

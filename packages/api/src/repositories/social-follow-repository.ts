import { randomUUID } from "node:crypto";
import { follows, notifications, profiles, type publicNotificationTypeSchema } from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import type { getRequiredDb } from "../db";
import { followRecordSchema, getFollowRecord } from "./social-graph-repository";

type DbClient = ReturnType<typeof getRequiredDb>;
type DeleteExecutor = Pick<DbClient, "delete">;
type InsertExecutor = Pick<DbClient, "insert">;
type FollowNotificationType = Extract<
  z.infer<typeof publicNotificationTypeSchema>,
  "follow_request" | "new_follower"
>;

export async function deleteFollowRequestNotification(
  db: DeleteExecutor,
  userId: string,
  actorId: string,
) {
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.user_id, userId),
        eq(notifications.actor_id, actorId),
        eq(notifications.type, "follow_request"),
      ),
    );
}

export async function createFollowNotification(
  db: InsertExecutor,
  userId: string,
  actorId: string,
  type: FollowNotificationType,
) {
  const now = new Date();
  await db.insert(notifications).values({
    id: randomUUID(),
    user_id: userId,
    actor_id: actorId,
    type,
    created_at: now,
  });
}

export async function createFollowRelationshipIfAbsent(
  db: DbClient,
  followerId: string,
  followingId: string,
) {
  return db.transaction(async (tx) => {
    const [targetProfile] = await tx
      .select({ is_public: profiles.is_public })
      .from(profiles)
      .where(eq(profiles.id, followingId))
      .limit(1);
    if (!targetProfile) return { kind: "missing_profile" as const };
    const status = targetProfile.is_public ? "accepted" : "pending";
    const now = new Date();
    const [insertedRow] = await tx
      .insert(follows)
      .values({
        follower_id: followerId,
        following_id: followingId,
        status,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoNothing({ target: [follows.follower_id, follows.following_id] })
      .returning({
        follower_id: follows.follower_id,
        following_id: follows.following_id,
        status: follows.status,
      });
    const inserted = insertedRow ? followRecordSchema.parse(insertedRow) : null;
    if (inserted) return { kind: "follow" as const, created: true, follow: inserted };
    const existing = await getFollowRecord(tx, followerId, followingId);
    if (!existing) throw new Error("Follow conflict did not resolve to an existing relationship");
    return { kind: "follow" as const, created: false, follow: existing };
  });
}

export async function cancelFollowRelationship(
  db: DbClient,
  followerId: string,
  followingId: string,
) {
  await db.transaction(async (tx) => {
    await tx
      .delete(follows)
      .where(and(eq(follows.follower_id, followerId), eq(follows.following_id, followingId)));
    await deleteFollowRequestNotification(tx, followingId, followerId);
  });
}

export async function transitionFollowRequest(
  db: DbClient,
  followingId: string,
  followerId: string,
  transition: "accept" | "reject",
) {
  return db.transaction(async (tx) => {
    const [lockedRow] = await tx
      .select({
        follower_id: follows.follower_id,
        following_id: follows.following_id,
        status: follows.status,
      })
      .from(follows)
      .where(and(eq(follows.follower_id, followerId), eq(follows.following_id, followingId)))
      .for("update");
    const current = lockedRow ? followRecordSchema.parse(lockedRow) : null;
    if (!current) return "missing" as const;
    if (current.status === "accepted") return "already_accepted" as const;

    const [transitioned] =
      transition === "accept"
        ? await tx
            .update(follows)
            .set({ status: "accepted", updated_at: new Date() })
            .where(
              and(
                eq(follows.follower_id, followerId),
                eq(follows.following_id, followingId),
                eq(follows.status, "pending"),
              ),
            )
            .returning({ follower_id: follows.follower_id })
        : await tx
            .delete(follows)
            .where(
              and(
                eq(follows.follower_id, followerId),
                eq(follows.following_id, followingId),
                eq(follows.status, "pending"),
              ),
            )
            .returning({ follower_id: follows.follower_id });
    if (!transitioned) return "missing" as const;
    await deleteFollowRequestNotification(tx, followingId, followerId);
    return transition === "accept" ? ("accepted" as const) : ("rejected" as const);
  });
}

import { randomUUID } from "node:crypto";
import { profiles, type publicNotificationTypeSchema } from "@repo/db";
import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { getRequiredDb } from "../db";
import { followRecordSchema, getFollowRecord } from "./social-graph-repository";

type DbClient = ReturnType<typeof getRequiredDb>;
type SqlExecutor = Pick<DbClient, "execute">;
type FollowNotificationType = Extract<
  z.infer<typeof publicNotificationTypeSchema>,
  "follow_request" | "new_follower"
>;

export async function deleteFollowRequestNotification(
  db: SqlExecutor,
  userId: string,
  actorId: string,
) {
  await db.execute(sql`
    delete from notifications where user_id = ${userId}::uuid
      and actor_id = ${actorId}::uuid and type = 'follow_request'
  `);
}

export async function createFollowNotification(
  db: SqlExecutor,
  userId: string,
  actorId: string,
  type: FollowNotificationType,
) {
  const now = new Date();
  await db.execute(sql`
    insert into notifications (id, user_id, actor_id, type, created_at)
    values (${randomUUID()}::uuid, ${userId}::uuid, ${actorId}::uuid, ${type}, ${now})
  `);
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
    const insertResult = await tx.execute(sql`
      insert into follows (follower_id, following_id, status, created_at, updated_at)
      values (${followerId}::uuid, ${followingId}::uuid, ${status}, ${now}, ${now})
      on conflict (follower_id, following_id) do nothing
      returning follower_id, following_id, status
    `);
    const inserted = insertResult.rows[0] ? followRecordSchema.parse(insertResult.rows[0]) : null;
    if (inserted) return { kind: "follow" as const, created: true, follow: inserted };
    const existing = await getFollowRecord(tx, followerId, followingId);
    if (!existing) throw new Error("Follow conflict did not resolve to an existing relationship");
    return { kind: "follow" as const, created: false, follow: existing };
  });
}

export async function removeFollowRelationship(
  db: DbClient,
  followerId: string,
  followingId: string,
) {
  await db.execute(sql`
    delete from follows where follower_id = ${followerId}::uuid
      and following_id = ${followingId}::uuid
  `);
}

export async function transitionFollowRequest(
  db: DbClient,
  followingId: string,
  followerId: string,
  transition: "accept" | "reject",
) {
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      select follower_id, following_id, status from follows
      where follower_id = ${followerId}::uuid and following_id = ${followingId}::uuid
      for update
    `);
    const current = locked.rows[0] ? followRecordSchema.parse(locked.rows[0]) : null;
    if (!current) return "missing" as const;
    if (current.status === "accepted") return "already_accepted" as const;

    const transitioned =
      transition === "accept"
        ? await tx.execute(sql`
            update follows set status = 'accepted', updated_at = ${new Date()}
            where follower_id = ${followerId}::uuid and following_id = ${followingId}::uuid
              and status = 'pending'
            returning follower_id
          `)
        : await tx.execute(sql`
            delete from follows
            where follower_id = ${followerId}::uuid and following_id = ${followingId}::uuid
              and status = 'pending'
            returning follower_id
          `);
    if (!transitioned.rows[0]) return "missing" as const;
    await deleteFollowRequestNotification(tx, followingId, followerId);
    return transition === "accept" ? ("accepted" as const) : ("rejected" as const);
  });
}

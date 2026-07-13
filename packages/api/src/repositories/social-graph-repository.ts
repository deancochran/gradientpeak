import { profiles } from "@repo/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../db";
import { buildUuidInList, getSqlCount } from "../utils/sql";
import { socialProfileListItemSchema } from "./social-user-search-repository";

type DbClient = ReturnType<typeof getRequiredDb>;
type SqlExecutor = Pick<DbClient, "execute">;
const followStatusSchema = z.enum(["pending", "accepted"]);
export const followRecordSchema = z
  .object({
    follower_id: z.string().uuid(),
    following_id: z.string().uuid(),
    status: followStatusSchema,
  })
  .strict();
const followingRelationshipRowSchema = z
  .object({ following_id: z.string().uuid(), status: followStatusSchema })
  .strict();

export async function getFollowRecord(db: SqlExecutor, followerId: string, followingId: string) {
  const result = await db.execute(sql`
    select follower_id, following_id, status from follows
    where follower_id = ${followerId}::uuid and following_id = ${followingId}::uuid
    limit 1
  `);
  const row = result.rows[0];
  return row ? followRecordSchema.parse(row) : null;
}

export async function getProfileVisibility(db: DbClient, profileId: string) {
  const [profile] = await db
    .select({ is_public: profiles.is_public })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  return profile ? profile.is_public : null;
}

/** One directional social-graph read plan parameterized for follower and following lists. */
/** Loads one graph direction and annotates every listed profile with the viewer's outbound status. */
export async function loadSocialGraph(
  db: DbClient,
  input: {
    viewerId: string;
    targetUserId: string;
    direction: "followers" | "following";
    limit: number;
    offset: number;
  },
) {
  const listCondition =
    input.direction === "followers"
      ? sql`f.following_id = ${input.targetUserId}::uuid`
      : sql`f.follower_id = ${input.targetUserId}::uuid`;
  const profileJoin =
    input.direction === "followers" ? sql`p.id = f.follower_id` : sql`p.id = f.following_id`;
  const countCondition =
    input.direction === "followers"
      ? sql`following_id = ${input.targetUserId}::uuid`
      : sql`follower_id = ${input.targetUserId}::uuid`;
  const usersResult = await db.execute(sql`
    select p.id, p.username, p.avatar_url, p.is_public, p.created_at, p.updated_at
    from follows f join profiles p on ${profileJoin}
    where ${listCondition} and f.status = 'accepted'
    order by p.created_at desc, p.id asc
    limit ${input.limit} offset ${input.offset}
  `);
  const users = z.array(socialProfileListItemSchema).parse(usersResult.rows);
  const total = await getSqlCount(
    db.execute(sql`
      select count(*)::int as value from follows
      where ${countCondition} and status = 'accepted'
    `),
  );
  const userIds = users.map((user) => user.id);
  const statusMap = new Map<string, z.infer<typeof followStatusSchema>>();
  if (userIds.length > 0) {
    const result = await db.execute(sql`
      select following_id, status from follows
      where follower_id = ${input.viewerId}::uuid
        and following_id in (${buildUuidInList(userIds)})
    `);
    for (const relationship of z.array(followingRelationshipRowSchema).parse(result.rows)) {
      statusMap.set(relationship.following_id, relationship.status);
    }
  }
  return {
    users: users.map((user) => ({ ...user, follow_status: statusMap.get(user.id) ?? null })),
    total,
  };
}

import { follows, profiles } from "@repo/db";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { resolveProfileMediaUrl } from "../application/storage/profile-media-url";
import type { getRequiredDb } from "../db";
import { socialProfileListItemSchema } from "./social-user-search-repository";

type DbClient = ReturnType<typeof getRequiredDb>;
type SelectExecutor = Pick<DbClient, "select">;
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

export async function getFollowRecord(db: SelectExecutor, followerId: string, followingId: string) {
  const [row] = await db
    .select({
      follower_id: follows.follower_id,
      following_id: follows.following_id,
      status: follows.status,
    })
    .from(follows)
    .where(and(eq(follows.follower_id, followerId), eq(follows.following_id, followingId)))
    .limit(1);
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
      ? eq(follows.following_id, input.targetUserId)
      : eq(follows.follower_id, input.targetUserId);
  const profileJoin =
    input.direction === "followers"
      ? eq(profiles.id, follows.follower_id)
      : eq(profiles.id, follows.following_id);
  const selectProfiles = {
    id: profiles.id,
    username: profiles.username,
    full_name: profiles.full_name,
    avatar_url: profiles.avatar_url,
    is_public: profiles.is_public,
    created_at: profiles.created_at,
    updated_at: profiles.updated_at,
  };
  const users = z.array(socialProfileListItemSchema).parse(
    await db
      .select(selectProfiles)
      .from(follows)
      .innerJoin(profiles, profileJoin)
      .where(and(listCondition, eq(follows.status, "accepted")))
      .orderBy(desc(profiles.created_at), asc(profiles.id))
      .limit(input.limit)
      .offset(input.offset),
  );
  const [totalRow] = await db
    .select({ value: count() })
    .from(follows)
    .where(and(listCondition, eq(follows.status, "accepted")));
  const total = z.object({ value: z.number().int().nonnegative() }).parse(totalRow).value;
  const userIds = users.map((user) => user.id);
  const statusMap = new Map<string, z.infer<typeof followStatusSchema>>();
  if (userIds.length > 0) {
    const relationships = await db
      .select({ following_id: follows.following_id, status: follows.status })
      .from(follows)
      .where(and(eq(follows.follower_id, input.viewerId), inArray(follows.following_id, userIds)));
    for (const relationship of z.array(followingRelationshipRowSchema).parse(relationships)) {
      statusMap.set(relationship.following_id, relationship.status);
    }
  }
  return {
    users: users.map((user) => ({
      ...user,
      avatar_url: resolveProfileMediaUrl(user.avatar_url, user.id),
      follow_status: statusMap.get(user.id) ?? null,
    })),
    total,
  };
}

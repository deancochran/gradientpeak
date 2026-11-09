import { follows, profiles } from "@repo/db";
import { and, asc, count, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { resolveProfileMediaUrl } from "../application/storage/profile-media-url";
import type { getRequiredDb } from "../db";
import { buildIndexPageInfo, parseIndexCursor } from "../utils/index-cursor";

type DbClient = ReturnType<typeof getRequiredDb>;

const uuidSchema = z.string().uuid();
const nullableAvatarUrlSchema = z.string().nullable();
const nullableUsernameSchema = z.string().nullable();
const nullableFullNameSchema = z.string().nullable();
const nullableFollowStatusSchema = z.enum(["pending", "accepted"]).nullable();

export const socialProfileListItemSchema = z
  .object({
    id: uuidSchema,
    username: nullableUsernameSchema,
    full_name: nullableFullNameSchema,
    avatar_url: nullableAvatarUrlSchema,
    is_public: z.boolean().nullable(),
    created_at: z.union([z.date(), z.string()]),
    updated_at: z.union([z.date(), z.string()]),
  })
  .strict();

const socialUserSearchResultSchema = socialProfileListItemSchema.extend({
  follow_status: nullableFollowStatusSchema,
});

export type SearchSocialUsersInput = {
  query?: string;
  limit: number;
  cursor?: string;
  offset: number;
  sort_by?: "newest" | "oldest" | "username_asc" | "username_desc";
};

export async function searchSocialUsers({
  db,
  viewerId,
  input,
}: {
  db: DbClient;
  viewerId: string;
  input: SearchSocialUsersInput;
}) {
  const trimmedQuery = input.query?.trim() ?? "";
  const searchPattern = `%${trimmedQuery}%`;
  const offset = input.cursor ? parseIndexCursor(input.cursor) : input.offset;
  const profileSort =
    input.sort_by === "oldest"
      ? [asc(profiles.created_at), asc(profiles.id)]
      : input.sort_by === "username_asc"
        ? [sql`${profiles.username} asc nulls last`, desc(profiles.created_at), asc(profiles.id)]
        : input.sort_by === "username_desc"
          ? [sql`${profiles.username} desc nulls last`, desc(profiles.created_at), asc(profiles.id)]
          : [desc(profiles.created_at), asc(profiles.id)];

  const fullNameVisible = or(eq(profiles.is_public, true), eq(follows.status, "accepted"));
  const searchCondition = trimmedQuery
    ? or(
        ilike(profiles.username, searchPattern),
        and(fullNameVisible, ilike(profiles.full_name, searchPattern)),
      )
    : undefined;
  const where = and(ne(profiles.id, viewerId), searchCondition);
  const usersResult = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      full_name: sql`case when ${fullNameVisible} then ${profiles.full_name} else null end`,
      avatar_url: profiles.avatar_url,
      is_public: profiles.is_public,
      follow_status: follows.status,
      created_at: profiles.created_at,
      updated_at: profiles.updated_at,
    })
    .from(profiles)
    .leftJoin(
      follows,
      and(eq(follows.following_id, profiles.id), eq(follows.follower_id, viewerId)),
    )
    .where(where)
    .orderBy(...profileSort)
    .limit(input.limit)
    .offset(offset);

  const users = z.array(socialUserSearchResultSchema).parse(usersResult);
  const [totalRow] = trimmedQuery
    ? await db
        .select({ value: count() })
        .from(profiles)
        .leftJoin(
          follows,
          and(eq(follows.following_id, profiles.id), eq(follows.follower_id, viewerId)),
        )
        .where(where)
    : await db.select({ value: count() }).from(profiles).where(ne(profiles.id, viewerId));
  const total = z.object({ value: z.number().int().nonnegative() }).parse(totalRow).value;

  return {
    users: users.map((user) => ({
      ...user,
      avatar_url: resolveProfileMediaUrl(user.avatar_url, user.id),
    })),
    total,
    ...buildIndexPageInfo({ offset, limit: input.limit, total }),
  };
}

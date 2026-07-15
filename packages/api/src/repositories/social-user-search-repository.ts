import { sql } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../db";
import { buildIndexPageInfo, parseIndexCursor } from "../utils/index-cursor";
import { getSqlCount } from "../utils/sql";

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
  const profileSortClause =
    input.sort_by === "oldest"
      ? sql`p.created_at asc, p.id asc`
      : input.sort_by === "username_asc"
        ? sql`p.username asc nulls last, p.created_at desc, p.id asc`
        : input.sort_by === "username_desc"
          ? sql`p.username desc nulls last, p.created_at desc, p.id asc`
          : sql`p.created_at desc, p.id asc`;

  const usersResult = trimmedQuery
    ? await db.execute(sql`
        select p.id, p.username,
          case when p.is_public is true or f.status = 'accepted' then p.full_name else null end as full_name,
          p.avatar_url, p.is_public,
          f.status as follow_status, p.created_at, p.updated_at
        from profiles p
        left join follows f
          on f.following_id = p.id
          and f.follower_id = ${viewerId}::uuid
        where p.id != ${viewerId}::uuid
          and (
            p.username ilike ${searchPattern}
            or ((p.is_public is true or f.status = 'accepted') and p.full_name ilike ${searchPattern})
          )
        order by ${profileSortClause}
        limit ${input.limit}
        offset ${offset}
      `)
    : await db.execute(sql`
        select p.id, p.username,
          case when p.is_public is true or f.status = 'accepted' then p.full_name else null end as full_name,
          p.avatar_url, p.is_public,
          f.status as follow_status, p.created_at, p.updated_at
        from profiles p
        left join follows f
          on f.following_id = p.id
          and f.follower_id = ${viewerId}::uuid
        where p.id != ${viewerId}::uuid
        order by ${profileSortClause}
        limit ${input.limit}
        offset ${offset}
      `);

  const users = z.array(socialUserSearchResultSchema).parse(usersResult.rows);
  const total = await getSqlCount(
    trimmedQuery
      ? db.execute(sql`
          select count(*)::int as value
          from profiles p
          left join follows f
            on f.following_id = p.id
            and f.follower_id = ${viewerId}::uuid
          where p.id != ${viewerId}::uuid
            and (
              p.username ilike ${searchPattern}
              or ((p.is_public is true or f.status = 'accepted') and p.full_name ilike ${searchPattern})
            )
        `)
      : db.execute(sql`
          select count(*)::int as value
          from profiles p
          where p.id != ${viewerId}::uuid
        `),
  );

  return {
    users,
    total,
    ...buildIndexPageInfo({ offset, limit: input.limit, total }),
  };
}

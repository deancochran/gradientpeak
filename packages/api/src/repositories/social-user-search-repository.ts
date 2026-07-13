import { sql } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../db";
import { buildIndexPageInfo, parseIndexCursor } from "../utils/index-cursor";
import { getSqlCount } from "../utils/sql";

type DbClient = ReturnType<typeof getRequiredDb>;

const uuidSchema = z.string().uuid();
const nullableAvatarUrlSchema = z.string().nullable();
const nullableUsernameSchema = z.string().nullable();

export const socialProfileListItemSchema = z
  .object({
    id: uuidSchema,
    username: nullableUsernameSchema,
    avatar_url: nullableAvatarUrlSchema,
    is_public: z.boolean().nullable(),
    created_at: z.union([z.date(), z.string()]),
    updated_at: z.union([z.date(), z.string()]),
  })
  .strict();

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
        select p.id, p.username, p.avatar_url, p.is_public, p.created_at, p.updated_at
        from profiles p
        where p.id != ${viewerId}::uuid
          and p.username ilike ${searchPattern}
        order by ${profileSortClause}
        limit ${input.limit}
        offset ${offset}
      `)
    : await db.execute(sql`
        select p.id, p.username, p.avatar_url, p.is_public, p.created_at, p.updated_at
        from profiles p
        where p.id != ${viewerId}::uuid
        order by ${profileSortClause}
        limit ${input.limit}
        offset ${offset}
      `);

  const users = z.array(socialProfileListItemSchema).parse(usersResult.rows);
  const total = await getSqlCount(
    trimmedQuery
      ? db.execute(sql`
          select count(*)::int as value
          from profiles p
          where p.id != ${viewerId}::uuid
            and p.username ilike ${searchPattern}
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

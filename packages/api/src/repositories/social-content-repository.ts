import { randomUUID } from "node:crypto";
import { activities, events, likes } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../db";
import { createContentAccessPermissions } from "../permissions/content-access";
import { getSqlCount } from "../utils/sql";

type DbClient = ReturnType<typeof getRequiredDb>;
export type LikeEntityType = "activity" | "training_plan" | "activity_plan" | "route";
export type CommentEntityType = LikeEntityType | "event";
const commentEntityTypeSchema = z.enum([
  "activity",
  "training_plan",
  "activity_plan",
  "route",
  "event",
]);
const commentInsertRowSchema = z
  .object({
    id: z.string().uuid(),
    profile_id: z.string().uuid(),
    entity_id: z.string().uuid(),
    entity_type: commentEntityTypeSchema,
    content: z.string(),
    created_at: z.union([z.date(), z.string()]),
  })
  .strict();
const commentOwnerRowSchema = z.object({ profile_id: z.string().uuid() }).strict();
const commentListRowSchema = z
  .object({
    id: z.string().uuid(),
    content: z.string(),
    created_at: z.union([z.date(), z.string()]),
    profile_id: z.string().uuid().nullable(),
    profile_username: z.string().nullable(),
    profile_avatar_url: z.string().nullable(),
  })
  .strict();

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export async function canAccessSocialContent(
  db: DbClient,
  entityId: string,
  entityType: CommentEntityType,
  viewerId: string,
) {
  if (entityType === "activity") {
    const activity = await db.query.activities.findFirst({
      columns: { profile_id: true, is_private: true },
      where: eq(activities.id, entityId),
    });
    return Boolean(activity && (activity.profile_id === viewerId || !activity.is_private));
  }
  if (entityType === "training_plan" || entityType === "activity_plan") {
    return (
      await createContentAccessPermissions(db).canRead(viewerId, { type: entityType, id: entityId })
    ).allowed;
  }
  if (entityType === "route") {
    return (
      await createContentAccessPermissions(db).canRead(viewerId, {
        type: "activity_route",
        id: entityId,
      })
    ).allowed;
  }
  const event = await db.query.events.findFirst({
    columns: { profile_id: true },
    where: eq(events.id, entityId),
  });
  return event?.profile_id === viewerId;
}

export async function toggleContentLikeRecord(
  db: DbClient,
  viewerId: string,
  entityId: string,
  entityType: LikeEntityType,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${viewerId}:${entityType}:${entityId}`}, 0))`,
    );
    const deleted = await tx
      .delete(likes)
      .where(
        and(
          eq(likes.profile_id, viewerId),
          eq(likes.entity_id, entityId),
          eq(likes.entity_type, entityType),
        ),
      )
      .returning({ id: likes.id });
    if (deleted.length > 0) return { liked: false };
    await tx
      .insert(likes)
      .values({
        id: randomUUID(),
        created_at: new Date(),
        profile_id: viewerId,
        entity_id: entityId,
        entity_type: entityType,
      })
      .onConflictDoNothing({ target: [likes.profile_id, likes.entity_type, likes.entity_id] });
    return { liked: true };
  });
}

export async function addContentCommentRecord(
  db: DbClient,
  viewerId: string,
  input: { entity_id: string; entity_type: CommentEntityType; content: string },
) {
  const insertResult = await db.execute(sql`
    insert into comments (profile_id, entity_id, entity_type, content)
    values (${viewerId}::uuid, ${input.entity_id}::uuid, ${input.entity_type}, ${input.content.trim()})
    returning id, profile_id, entity_id, entity_type, content, created_at
  `);
  const insertedComment = commentInsertRowSchema.parse(insertResult.rows[0]);
  return { ...insertedComment, created_at: toIsoString(insertedComment.created_at) };
}

export async function deleteOwnedCommentRecord(db: DbClient, viewerId: string, commentId: string) {
  return db.transaction(async (tx) => {
    const commentResult = await tx.execute(sql`
      select profile_id from comments where id = ${commentId}::uuid limit 1
    `);
    const existingComment = commentResult.rows[0]
      ? commentOwnerRowSchema.parse(commentResult.rows[0])
      : null;
    if (!existingComment) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
    if (existingComment.profile_id !== viewerId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own comments" });
    }
    await tx.execute(sql`delete from comments where id = ${commentId}::uuid`);
    return { success: true };
  });
}

export async function loadContentComments(
  db: DbClient,
  input: {
    entityId: string;
    entityType: CommentEntityType;
    limit: number;
    offset: number;
  },
) {
  const commentsResult = await db.execute(sql`
    select c.id, c.content, c.created_at, p.id as profile_id,
      p.username as profile_username, p.avatar_url as profile_avatar_url
    from comments c left join profiles p on p.id = c.profile_id
    where c.entity_id = ${input.entityId}::uuid and c.entity_type = ${input.entityType}
    order by c.created_at asc limit ${input.limit} offset ${input.offset}
  `);
  const comments = z.array(commentListRowSchema).parse(commentsResult.rows);
  const total = await getSqlCount(
    db.execute(sql`
      select count(*)::int as value from comments
      where entity_id = ${input.entityId}::uuid and entity_type = ${input.entityType}
    `),
  );
  return {
    comments: comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      created_at: toIsoString(comment.created_at),
      profile: comment.profile_id
        ? {
            id: comment.profile_id,
            username: comment.profile_username,
            avatar_url: comment.profile_avatar_url,
          }
        : null,
    })),
    total,
  };
}

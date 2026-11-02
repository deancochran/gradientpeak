import { randomUUID } from "node:crypto";
import {
  type SocialCommentEntityType,
  type SocialLikeEntityType,
  socialCommentEntityTypeSchema,
} from "@repo/core";
import { activities, comments, events, follows, likes, profiles } from "@repo/db";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { resolveProfileMediaUrl } from "../application/storage/profile-media-url";
import type { getRequiredDb } from "../db";
import { createContentAccessPermissions } from "../permissions/content-access";

type DbClient = ReturnType<typeof getRequiredDb>;
const commentInsertRowSchema = z
  .object({
    id: z.string().uuid(),
    profile_id: z.string().uuid(),
    entity_id: z.string().uuid(),
    entity_type: socialCommentEntityTypeSchema,
    content: z.string(),
    created_at: z.union([z.date(), z.string()]),
  })
  .strict();
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
  entityType: SocialCommentEntityType,
  viewerId: string,
) {
  if (entityType === "activity") {
    const activity = await db.query.activities.findFirst({
      columns: { profile_id: true, content_visibility: true },
      where: eq(activities.id, entityId),
    });
    if (!activity) return false;
    if (activity.profile_id === viewerId) return true;

    const visibility = activity.content_visibility;
    if (visibility === "public") return true;
    if (visibility !== "followers") return false;

    const [acceptedFollow] = await db
      .select({ followerId: follows.follower_id })
      .from(follows)
      .where(
        and(
          eq(follows.follower_id, viewerId),
          eq(follows.following_id, activity.profile_id),
          eq(follows.status, "accepted"),
        ),
      )
      .limit(1);

    return Boolean(acceptedFollow);
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
  entityType: SocialLikeEntityType,
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
  input: {
    comment_id?: string;
    entity_id: string;
    entity_type: SocialCommentEntityType;
    content: string;
  },
) {
  const commentId = input.comment_id ?? randomUUID();
  const now = new Date();
  const content = input.content.trim();
  const [insertedRow] = await db
    .insert(comments)
    .values({
      id: commentId,
      profile_id: viewerId,
      entity_id: input.entity_id,
      entity_type: input.entity_type,
      content,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: comments.id,
      set: { id: comments.id },
      setWhere: sql`${comments.profile_id} = ${viewerId}
        and ${comments.entity_id} = ${input.entity_id}
        and ${comments.entity_type} = ${input.entity_type}
        and ${comments.content} = ${content}`,
    })
    .returning({
      id: comments.id,
      profile_id: comments.profile_id,
      entity_id: comments.entity_id,
      entity_type: comments.entity_type,
      content: comments.content,
      created_at: comments.created_at,
    });
  const insertedComment = commentInsertRowSchema.parse(insertedRow);
  return { ...insertedComment, created_at: toIsoString(insertedComment.created_at) };
}

export async function loadContentComments(
  db: DbClient,
  input: {
    entityId: string;
    entityType: SocialCommentEntityType;
    limit: number;
    offset: number;
  },
) {
  const commentsList = await db
    .select({
      id: comments.id,
      content: comments.content,
      created_at: comments.created_at,
      profile_id: profiles.id,
      profile_username: profiles.username,
      profile_avatar_url: profiles.avatar_url,
    })
    .from(comments)
    .leftJoin(profiles, eq(profiles.id, comments.profile_id))
    .where(and(eq(comments.entity_id, input.entityId), eq(comments.entity_type, input.entityType)))
    .orderBy(asc(comments.created_at))
    .limit(input.limit)
    .offset(input.offset);
  const parsedComments = z.array(commentListRowSchema).parse(commentsList);
  const [totalRow] = await db
    .select({ value: count() })
    .from(comments)
    .where(and(eq(comments.entity_id, input.entityId), eq(comments.entity_type, input.entityType)));
  const total = z.object({ value: z.number().int().nonnegative() }).parse(totalRow).value;
  return {
    comments: parsedComments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      created_at: toIsoString(comment.created_at),
      profile: comment.profile_id
        ? {
            id: comment.profile_id,
            username: comment.profile_username,
            avatar_url: resolveProfileMediaUrl(comment.profile_avatar_url, comment.profile_id),
          }
        : null,
    })),
    total,
  };
}

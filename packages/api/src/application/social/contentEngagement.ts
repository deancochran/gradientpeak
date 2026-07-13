import { TRPCError } from "@trpc/server";
import type { getRequiredDb } from "../../db";
import {
  addContentCommentRecord,
  type CommentEntityType,
  canAccessSocialContent,
  deleteOwnedCommentRecord,
  type LikeEntityType,
  loadContentComments,
  toggleContentLikeRecord,
} from "../../repositories/social-content-repository";
import { buildIndexPageInfo, parseIndexCursor } from "../../utils/index-cursor";

type DbClient = ReturnType<typeof getRequiredDb>;

export type { CommentEntityType, LikeEntityType };

function accessError(action: "like" | "comment on" | "view comments on", type: CommentEntityType) {
  const eventMessage = action === "comment on" ? "view comments on" : action;
  return new TRPCError({
    code: "FORBIDDEN",
    message: `You don't have permission to ${type === "event" ? eventMessage : action} this ${type}`,
  });
}

async function requireAccess(
  db: DbClient,
  viewerId: string,
  entityId: string,
  entityType: CommentEntityType,
  action: "like" | "comment on" | "view comments on",
) {
  if (!(await canAccessSocialContent(db, entityId, entityType, viewerId))) {
    throw accessError(action, entityType);
  }
}

export async function toggleContentLike(input: {
  db: DbClient;
  viewerId: string;
  entityId: string;
  entityType: LikeEntityType;
}) {
  await requireAccess(input.db, input.viewerId, input.entityId, input.entityType, "like");
  return toggleContentLikeRecord(input.db, input.viewerId, input.entityId, input.entityType);
}

export async function addContentComment({
  db,
  viewerId,
  input,
}: {
  db: DbClient;
  viewerId: string;
  input: { entity_id: string; entity_type: CommentEntityType; content: string };
}) {
  await requireAccess(db, viewerId, input.entity_id, input.entity_type, "comment on");
  return addContentCommentRecord(db, viewerId, input);
}

export async function deleteOwnedComment(db: DbClient, viewerId: string, commentId: string) {
  return deleteOwnedCommentRecord(db, viewerId, commentId);
}

export async function readContentComments({
  db,
  viewerId,
  input,
}: {
  db: DbClient;
  viewerId: string;
  input: { entity_id: string; entity_type: CommentEntityType; limit: number; cursor?: string };
}) {
  await requireAccess(db, viewerId, input.entity_id, input.entity_type, "view comments on");
  const offset = parseIndexCursor(input.cursor);
  const result = await loadContentComments(db, {
    entityId: input.entity_id,
    entityType: input.entity_type,
    limit: input.limit,
    offset,
  });
  return {
    ...result,
    ...buildIndexPageInfo({ offset, limit: input.limit, total: result.total }),
  };
}

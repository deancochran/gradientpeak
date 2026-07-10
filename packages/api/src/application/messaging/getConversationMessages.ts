import { normalizeMessageList } from "@repo/core";
import { conversationParticipants, messages, publicMessagesRowSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../../db";

const timestampSchema = z.union([z.date(), z.string()]);

const messageRowSchema = z.object({
  id: publicMessagesRowSchema.shape.id,
  conversation_id: publicMessagesRowSchema.shape.conversation_id,
  sender_id: publicMessagesRowSchema.shape.sender_id,
  content: publicMessagesRowSchema.shape.content,
  created_at: timestampSchema,
  deleted_at: timestampSchema.nullable().optional(),
  read_at: timestampSchema.nullable().optional(),
});

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function toMessage(value: z.infer<typeof messageRowSchema>) {
  return {
    id: value.id,
    conversation_id: value.conversation_id,
    sender_id: value.sender_id,
    content: value.content,
    created_at: toIsoString(value.created_at),
    deleted_at: toIsoString(value.deleted_at),
    read_at: toIsoString(value.read_at),
  };
}

export async function requireConversationParticipant(
  db: ReturnType<typeof getRequiredDb>,
  input: {
    conversationId: string;
    userId: string;
  },
) {
  const membership = await db
    .select({ user_id: conversationParticipants.user_id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversation_id, input.conversationId),
        eq(conversationParticipants.user_id, input.userId),
      ),
    )
    .limit(1);

  if (!membership[0]) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation not found",
    });
  }
}

export async function getConversationMessagesForViewer(
  db: ReturnType<typeof getRequiredDb>,
  input: {
    conversationId: string;
    viewerId: string;
  },
) {
  await requireConversationParticipant(db, {
    conversationId: input.conversationId,
    userId: input.viewerId,
  });

  const rows = await db
    .select({
      id: messages.id,
      conversation_id: messages.conversation_id,
      sender_id: messages.sender_id,
      content: messages.content,
      created_at: messages.created_at,
      deleted_at: messages.deleted_at,
      read_at: messages.read_at,
    })
    .from(messages)
    .where(and(eq(messages.conversation_id, input.conversationId), isNull(messages.deleted_at)))
    .orderBy(asc(messages.created_at));

  return normalizeMessageList(rows.map((row) => toMessage(messageRowSchema.parse(row))));
}

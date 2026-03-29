import { z } from "zod";

import { normalizeProfileSummary, profileSummarySchema } from "../profile";

export const messageListItemSchema = z.object({
  content: z.string(),
  conversation_id: z.string().uuid(),
  created_at: z.string(),
  deleted_at: z.string().nullable().optional(),
  id: z.string().uuid(),
  read_at: z.string().nullable().optional(),
  sender_id: z.string().uuid(),
});

export type MessageListItem = z.infer<typeof messageListItemSchema>;

export const conversationSummarySchema = z.object({
  created_at: z.string(),
  group_name: z.string().nullable(),
  id: z.string().uuid(),
  is_group: z.boolean(),
  last_message: messageListItemSchema.nullable(),
  last_message_at: z.string().nullable(),
  peer_profile: profileSummarySchema.nullable(),
  unread_count: z.number().int().min(0),
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export function normalizeMessageListItem(value: unknown): MessageListItem | null {
  const parsed = messageListItemSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function normalizeMessageList(values: readonly unknown[]): MessageListItem[] {
  return values
    .map((value) => normalizeMessageListItem(value))
    .filter((value): value is MessageListItem => value !== null);
}

export function normalizeConversationSummary(value: unknown): ConversationSummary | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as {
    created_at?: unknown;
    group_name?: unknown;
    id?: unknown;
    is_group?: unknown;
    last_message?: unknown;
    last_message_at?: unknown;
    messages?: readonly unknown[];
    peer_profile?: unknown;
    unread_count?: unknown;
  };

  const lastMessageFromLegacyArray = Array.isArray(candidate.messages)
    ? normalizeMessageListItem(candidate.messages[0])
    : null;

  const parsed = conversationSummarySchema.safeParse({
    created_at: candidate.created_at,
    group_name: candidate.group_name,
    id: candidate.id,
    is_group: candidate.is_group,
    last_message: normalizeMessageListItem(candidate.last_message) ?? lastMessageFromLegacyArray,
    last_message_at:
      typeof candidate.last_message_at === "string" ? candidate.last_message_at : null,
    peer_profile: normalizeProfileSummary(candidate.peer_profile),
    unread_count: candidate.unread_count ?? 0,
  });

  return parsed.success ? parsed.data : null;
}

export function normalizeConversationSummaryList(
  values: readonly unknown[],
): ConversationSummary[] {
  return values
    .map((value) => normalizeConversationSummary(value))
    .filter((value): value is ConversationSummary => value !== null);
}

export function getConversationDisplayName(
  conversation: Pick<ConversationSummary, "group_name" | "peer_profile">,
): string {
  return (
    conversation.group_name ||
    conversation.peer_profile?.full_name ||
    conversation.peer_profile?.username ||
    "Conversation"
  );
}

export function getConversationPreviewText(
  conversation: Pick<ConversationSummary, "last_message">,
): string {
  return conversation.last_message?.content || "No messages";
}

export function getConversationInitials(
  conversation: Pick<ConversationSummary, "group_name" | "peer_profile">,
): string {
  return getConversationDisplayName(conversation).slice(0, 2).toUpperCase();
}

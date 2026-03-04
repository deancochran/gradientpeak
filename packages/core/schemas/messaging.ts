import {
  publicConversationsRowSchema,
  publicMessagesRowSchema,
} from "@repo/supabase";
import { z } from "zod";

export const ConversationSchema = publicConversationsRowSchema;
export type Conversation = z.infer<typeof ConversationSchema>;

export const CreateConversationSchema = z.object({
  participant_ids: z.array(z.string().uuid()).min(1),
  group_name: z.string().optional(),
  initial_message: z.string().min(1).max(5000).optional(),
});
export type CreateConversation = z.infer<typeof CreateConversationSchema>;

export const MessageSchema = publicMessagesRowSchema;
export type Message = z.infer<typeof MessageSchema>;

export const CreateMessageSchema = publicMessagesRowSchema.pick({
  conversation_id: true,
  content: true,
});
export type CreateMessage = z.infer<typeof CreateMessageSchema>;

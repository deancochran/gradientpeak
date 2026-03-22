import { z } from "zod";

export const ConversationSchema = z.object({
  created_at: z.string(),
  group_name: z.string().nullable(),
  id: z.string().uuid(),
  is_group: z.boolean(),
  last_message_at: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const CreateConversationSchema = z.object({
  participant_ids: z.array(z.string().uuid()).min(1),
  group_name: z.string().optional(),
  initial_message: z.string().min(1).max(5000).optional(),
});
export type CreateConversation = z.infer<typeof CreateConversationSchema>;

export const MessageSchema = z.object({
  content: z.string(),
  conversation_id: z.string().uuid(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
  id: z.string().uuid(),
  sender_id: z.string().uuid(),
});
export type Message = z.infer<typeof MessageSchema>;

export const CreateMessageSchema = MessageSchema.pick({
  content: true,
  conversation_id: true,
});
export type CreateMessage = z.infer<typeof CreateMessageSchema>;

import { z } from "zod";

export const CreateConversationSchema = z.object({
  participant_ids: z.array(z.string().uuid()).min(1),
  group_name: z.string().optional(),
  initial_message: z.string().min(1).max(5000).optional(),
});
export type CreateConversation = z.infer<typeof CreateConversationSchema>;

export const CreateMessageSchema = z.object({
  content: z.string(),
  conversation_id: z.string().uuid(),
});
export type CreateMessage = z.infer<typeof CreateMessageSchema>;

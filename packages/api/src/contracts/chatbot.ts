import { z } from "zod";

export const chatbotRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    text: z.string().trim().min(1).max(4_000),
    threadId: z.string().uuid().optional(),
  })
  .strict();
export const chatbotHistoryMessageSchema = z
  .object({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(16_000) })
  .strict();
export type ChatbotRequest = z.output<typeof chatbotRequestSchema>;
export type ChatbotHistoryMessage = z.output<typeof chatbotHistoryMessageSchema>;
export type ChatbotTurnStatus = "completed" | "failed" | "interrupted" | "running";

export const chatbotRecoveryRequestSchema = z
  .object({ type: z.literal("recover"), threadId: z.string().uuid(), turnId: z.string().uuid() })
  .strict();

export const chatbotStatusRequestSchema = z.object({ threadId: z.string().uuid() }).strict();

export type ChatbotRecoveryRequest = z.output<typeof chatbotRecoveryRequestSchema>;

import { z } from "zod";

export const accountDeletionStageSchema = z.enum([
  "requested",
  "sessions-revoked",
  "app-cleanup-complete",
  "identity-deleted",
]);

export const accountDeletionRequestSchema = z.object({
  userId: z.string().min(1),
  requestedByUserId: z.string().min(1),
  initiatedAt: z.string().datetime(),
  reason: z.string().min(1).optional(),
});

export const accountDeletionResultSchema = z.object({
  userId: z.string().min(1),
  stage: accountDeletionStageSchema,
  cleanupJobId: z.string().min(1).optional(),
});

export type AccountDeletionStage = z.infer<typeof accountDeletionStageSchema>;
export type AccountDeletionRequest = z.infer<typeof accountDeletionRequestSchema>;
export type AccountDeletionResult = z.infer<typeof accountDeletionResultSchema>;

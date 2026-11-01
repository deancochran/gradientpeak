import { z } from "zod";

/**
 * Account deletion remains unavailable until its complete, durable cleanup
 * workflow is implemented. Keep this copy shared so clients do not imply that
 * a destructive operation can succeed.
 */
export const accountDeletionUnavailableTitle = "Account deletion is unavailable";
export const accountDeletionUnavailableReason =
  "Account deletion is unavailable while we complete the safeguards required to remove account data safely.";

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

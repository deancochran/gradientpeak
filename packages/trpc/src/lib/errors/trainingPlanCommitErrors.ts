import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const trainingPlanCommitErrorCodeSchema = z.enum([
  "TRAINING_PLAN_COMMIT_STALE_PREVIEW",
  "TRAINING_PLAN_COMMIT_CONFLICT",
  "TRAINING_PLAN_COMMIT_INVALID_PAYLOAD",
  "TRAINING_PLAN_COMMIT_NOT_FOUND",
]);

export const trainingPlanCommitOperationSchema = z.enum([
  "createFromCreationConfig",
  "updateFromCreationConfig",
]);

const trainingPlanCommitErrorCauseSchema = z.object({
  domain: z.literal("training_plan_commit"),
  code: trainingPlanCommitErrorCodeSchema,
  operation: trainingPlanCommitOperationSchema,
  recoverable: z.boolean(),
  user_action: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type TrainingPlanCommitErrorCause = z.infer<
  typeof trainingPlanCommitErrorCauseSchema
>;

type TrainingPlanCommitOperation = z.infer<
  typeof trainingPlanCommitOperationSchema
>;

export function isTrainingPlanCommitErrorCause(
  value: unknown,
): value is TrainingPlanCommitErrorCause {
  return trainingPlanCommitErrorCauseSchema.safeParse(value).success;
}

export function buildStalePreviewCommitError(input: {
  operation: TrainingPlanCommitOperation;
  providedToken: string;
}) {
  return new TRPCError({
    code: "BAD_REQUEST",
    message:
      input.operation === "createFromCreationConfig"
        ? "Creation preview is stale or invalid. Refresh preview and retry createFromCreationConfig."
        : "Creation preview is stale or invalid. Refresh preview and retry updateFromCreationConfig.",
    cause: {
      domain: "training_plan_commit",
      code: "TRAINING_PLAN_COMMIT_STALE_PREVIEW",
      operation: input.operation,
      recoverable: true,
      user_action: "refresh_preview_and_retry",
      details: {
        provided_preview_snapshot_token: input.providedToken,
      },
    } satisfies TrainingPlanCommitErrorCause,
  });
}

export function buildConflictCommitError(input: {
  operation: TrainingPlanCommitOperation;
  blockingConflictCodes: string[];
}) {
  return new TRPCError({
    code: "BAD_REQUEST",
    message:
      "Creation blocked by unresolved conflicts. Resolve blocking conflicts or submit an explicit override_policy for objective/risk-budget conflicts.",
    cause: {
      domain: "training_plan_commit",
      code: "TRAINING_PLAN_COMMIT_CONFLICT",
      operation: input.operation,
      recoverable: true,
      user_action: "resolve_conflicts_or_apply_explicit_override",
      details: {
        blocking_conflict_codes: input.blockingConflictCodes,
      },
    } satisfies TrainingPlanCommitErrorCause,
  });
}

export function buildInvalidPayloadCommitError(input: {
  operation: TrainingPlanCommitOperation;
  reason: string;
  details?: Record<string, unknown>;
}) {
  return new TRPCError({
    code: "BAD_REQUEST",
    message: "Generated training plan structure is invalid",
    cause: {
      domain: "training_plan_commit",
      code: "TRAINING_PLAN_COMMIT_INVALID_PAYLOAD",
      operation: input.operation,
      recoverable: true,
      user_action: "fix_inputs_and_retry",
      details: {
        reason: input.reason,
        ...(input.details ?? {}),
      },
    } satisfies TrainingPlanCommitErrorCause,
  });
}

export function buildNotFoundCommitError(input: {
  operation: TrainingPlanCommitOperation;
}) {
  return new TRPCError({
    code: "NOT_FOUND",
    message: "Training plan not found or you do not have access to edit it",
    cause: {
      domain: "training_plan_commit",
      code: "TRAINING_PLAN_COMMIT_NOT_FOUND",
      operation: input.operation,
      recoverable: false,
      user_action: "refresh_plans_and_select_an_existing_plan",
    } satisfies TrainingPlanCommitErrorCause,
  });
}

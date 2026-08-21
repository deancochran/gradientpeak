import { executableIntegrationProviderIdSchema } from "@repo/core";
import { completeOnboardingSchema, onboardingStatusSchema } from "@repo/core/schemas/onboarding";
import { schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { profileGoalWriteDataSchema } from "../application/goals/profile-goal-write";
import {
  completeLifecycleSetup,
  lifecycleSettingsPatchSchema,
} from "../application/onboarding/complete-lifecycle-setup";
import { saveOnboardingDraft } from "../application/onboarding/complete-onboarding";
import { OnboardingProfileNotFoundError } from "../application/onboarding/persist-onboarding-profile";
import {
  getOnboardingProgress,
  onboardingProgressSchema,
} from "../application/onboarding/progress";
import {
  getOnboardingReadiness,
  reconcileOnboardingStatus,
} from "../application/onboarding/readiness";
import {
  OnboardingRestartConflictError,
  restartOnboardingProviderSelection,
} from "../application/onboarding/restart-provider-selection";
import {
  OnboardingProviderRecoveryConflictError,
  retryOnboardingProviderProcessing,
} from "../application/onboarding/retry-provider-processing";
import {
  OnboardingWorkOwnershipConflictError,
  startOnboardingProcessing,
} from "../application/onboarding/start-processing";
import { getRequiredDb } from "../db";
import {
  OnboardingCompletedReplayConflictError,
  OnboardingGoalContentConflictError,
  OnboardingPendingOAuthError,
  OnboardingProfileNotFoundForLockError,
  OnboardingReadinessBarrierError,
  OnboardingStatusConflictError,
} from "../repositories/onboarding-lifecycle-repository";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const completeLifecycleSetupInputSchema = z
  .object({
    profile: completeOnboardingSchema,
    goal: profileGoalWriteDataSchema.optional(),
    settings_patch: lifecycleSettingsPatchSchema.optional(),
  })
  .strict();
const completeLifecycleSetupOutputSchema = z
  .object({
    status: z.enum(["completed", "already_completed"]),
    goal: z.object({ status: z.enum(["saved", "unchanged", "skipped"]) }).strict(),
    settings: z.object({ status: z.enum(["saved", "unchanged", "skipped"]) }).strict(),
    created: z.object({ profile_metrics: z.number().int().nonnegative() }).strict(),
  })
  .strict();
const saveDraftInputSchema = z.object({ profile: completeOnboardingSchema }).strict();
const saveDraftOutputSchema = z
  .object({ status: z.enum(["provider_selection", "processing", "review"]) })
  .strict();
const startProcessingOutputSchema = z
  .object({
    status: z.enum(["processing", "review"]),
    providers: z.array(executableIntegrationProviderIdSchema),
  })
  .strict();
const retryProviderProcessingInputSchema = z
  .object({ provider: executableIntegrationProviderIdSchema })
  .strict();
const retryProviderProcessingOutputSchema = z
  .object({
    provider: executableIntegrationProviderIdSchema,
    status: z.literal("processing"),
    queued: z.boolean(),
  })
  .strict();
const restartProviderSelectionOutputSchema = z
  .object({ status: z.literal("provider_selection") })
  .strict();
const nextActionSchema = z.enum([
  "connect_provider",
  "wait",
  "retry",
  "restart_selection",
  "review",
  "finalize",
]);
const readinessOutputSchema = z
  .object({
    status: onboardingStatusSchema,
    ready_to_finalize: z.boolean(),
    providers: z.array(
      z
        .object({
          provider: executableIntegrationProviderIdSchema,
          state: z.enum([
            "connected",
            "queued",
            "importing",
            "deriving",
            "complete",
            "complete_no_data",
            "complete_with_limitations",
            "recovery_required",
          ]),
          executable: z.boolean(),
          integration_active: z.boolean(),
          progress: z
            .object({
              imported_count: z.number().int().nonnegative(),
              skipped_count: z.number().int().nonnegative(),
              failed_count: z.number().int().nonnegative(),
              profile: z.enum(["queued", "running", "complete", "recovery_required"]),
            })
            .strict(),
          next_actions: z.array(nextActionSchema),
        })
        .strict(),
    ),
    next_actions: z.array(nextActionSchema),
  })
  .strict();
const checkUsernameAvailabilityInputSchema = z
  .object({ username: completeOnboardingSchema.shape.username })
  .strict();
const checkUsernameAvailabilityOutputSchema = z.object({ available: z.boolean() }).strict();

function isUsernameConflict(error: unknown): boolean {
  let candidate = error;
  const visited = new Set<unknown>();
  while (candidate && typeof candidate === "object" && !visited.has(candidate)) {
    visited.add(candidate);
    const record = candidate as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (record.code === "23505" && record.constraint === "profiles_username_unique_idx")
      return true;
    candidate = record.cause;
  }
  return false;
}

function throwOnboardingError(error: unknown): never {
  if (
    error instanceof OnboardingProfileNotFoundError ||
    error instanceof OnboardingProfileNotFoundForLockError
  ) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
  }
  if (
    error instanceof OnboardingStatusConflictError ||
    error instanceof OnboardingCompletedReplayConflictError ||
    error instanceof OnboardingPendingOAuthError ||
    error instanceof OnboardingReadinessBarrierError ||
    error instanceof OnboardingGoalContentConflictError ||
    error instanceof OnboardingProviderRecoveryConflictError ||
    error instanceof OnboardingRestartConflictError ||
    error instanceof OnboardingWorkOwnershipConflictError
  ) {
    throw new TRPCError({ code: "CONFLICT", message: error.message, cause: error });
  }
  if (isUsernameConflict(error)) {
    throw new TRPCError({ code: "CONFLICT", message: "That username is already taken" });
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Onboarding operation failed",
    cause: error,
  });
}

export const onboardingRouter = createTRPCRouter({
  checkUsernameAvailability: protectedProcedure
    .input(checkUsernameAvailabilityInputSchema)
    .output(checkUsernameAvailabilityOutputSchema)
    .query(async ({ ctx, input }) => {
      const [conflict] = await getRequiredDb(ctx)
        .select({ id: schema.profiles.id })
        .from(schema.profiles)
        .where(
          and(
            sql`lower(${schema.profiles.username}) = ${input.username.toLowerCase()}`,
            ne(schema.profiles.id, ctx.session.user.id),
          ),
        )
        .limit(1);
      return { available: !conflict };
    }),

  saveDraft: protectedProcedure
    .input(saveDraftInputSchema)
    .output(saveDraftOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveOnboardingDraft({
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
          data: input.profile,
        });
      } catch (error) {
        throwOnboardingError(error);
      }
    }),

  startProcessing: protectedProcedure
    .output(startProcessingOutputSchema)
    .mutation(async ({ ctx }) => {
      try {
        return await startOnboardingProcessing({
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
        });
      } catch (error) {
        throwOnboardingError(error);
      }
    }),

  retryProviderProcessing: protectedProcedure
    .input(retryProviderProcessingInputSchema)
    .output(retryProviderProcessingOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await retryOnboardingProviderProcessing({
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
          provider: input.provider,
        });
      } catch (error) {
        throwOnboardingError(error);
      }
    }),

  restartProviderSelection: protectedProcedure
    .output(restartProviderSelectionOutputSchema)
    .mutation(async ({ ctx }) => {
      try {
        return await restartOnboardingProviderSelection({
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
        });
      } catch (error) {
        throwOnboardingError(error);
      }
    }),

  getReadiness: protectedProcedure.output(readinessOutputSchema).query(async ({ ctx }) => {
    try {
      const readiness = await getOnboardingReadiness({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
      });
      if (!readiness) throw new OnboardingProfileNotFoundForLockError();
      return readiness;
    } catch (error) {
      throwOnboardingError(error);
    }
  }),

  getProgress: protectedProcedure.output(onboardingProgressSchema).query(async ({ ctx }) => {
    try {
      const progress = await getOnboardingProgress({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
      });
      if (!progress) throw new OnboardingProfileNotFoundForLockError();
      return progress;
    } catch (error) {
      throwOnboardingError(error);
    }
  }),

  reconcileStatus: protectedProcedure.output(readinessOutputSchema).mutation(async ({ ctx }) => {
    try {
      const readiness = await reconcileOnboardingStatus({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
      });
      if (!readiness) throw new OnboardingProfileNotFoundForLockError();
      return readiness;
    } catch (error) {
      throwOnboardingError(error);
    }
  }),

  completeLifecycleSetup: protectedProcedure
    .input(completeLifecycleSetupInputSchema)
    .output(completeLifecycleSetupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await completeLifecycleSetup({
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
          ...input,
        });
      } catch (error) {
        throwOnboardingError(error);
      }
    }),
});

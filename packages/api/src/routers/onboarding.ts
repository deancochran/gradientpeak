/**
 * Onboarding Router
 *
 * Handles the smart onboarding flow that derives activity_efforts and profile_metrics
 * from minimal user input. Supports experience-based paths:
 * - Beginner: Auto-apply conservative defaults
 * - Intermediate: Validate estimates
 * - Advanced: Manual entry
 * - Skip: Minimal setup
 */

import { completeOnboardingSchema } from "@repo/core/schemas/onboarding";
import { schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { profileGoalWriteDataSchema } from "../application/goals/profile-goal-write";
import {
  completeLifecycleSetup,
  lifecycleSettingsPatchSchema,
} from "../application/onboarding/complete-lifecycle-setup";
import { OnboardingProfileNotFoundError } from "../application/onboarding/persist-onboarding-profile";
import { getRequiredDb } from "../db";
import { OnboardingProfileNotFoundForLockError } from "../repositories/onboarding-lifecycle-repository";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const lifecycleSectionFailureCodeSchema = z.enum(["content_conflict", "temporarily_unavailable"]);
const lifecycleGoalStatusSchema = z
  .object({
    status: z.enum(["saved", "skipped", "failed"]),
    retryable: z.boolean(),
    failure_code: lifecycleSectionFailureCodeSchema.optional(),
  })
  .strict();
const lifecycleSettingsStatusSchema = z
  .object({
    status: z.enum(["saved", "unchanged", "skipped", "failed"]),
    retryable: z.boolean(),
    failure_code: lifecycleSectionFailureCodeSchema.optional(),
  })
  .strict();
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
    goal: lifecycleGoalStatusSchema,
    settings: lifecycleSettingsStatusSchema,
    retryable: z.boolean(),
    cache_tags: z.tuple([
      // biome-ignore lint/security/noSecrets: Public tRPC cache tag, not a credential.
      z.literal("integrations.getSyncOverview"),
      z.literal("goals.list"),
      z.literal("profileSettings.getForProfile"),
    ]),
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
    if (record.code === "23505" && record.constraint === "profiles_username_unique_idx") {
      return true;
    }
    candidate = record.cause;
  }

  return false;
}

function throwCompletionError(error: unknown): never {
  if (
    error instanceof OnboardingProfileNotFoundError ||
    error instanceof OnboardingProfileNotFoundForLockError
  ) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
  }
  if (isUsernameConflict(error)) {
    throw new TRPCError({ code: "CONFLICT", message: "That username is already taken" });
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Failed to complete onboarding",
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
        throwCompletionError(error);
      }
    }),
});

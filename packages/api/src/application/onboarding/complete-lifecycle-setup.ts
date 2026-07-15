import type { CompleteOnboarding } from "@repo/core/schemas/onboarding";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import {
  OnboardingGoalContentConflictError,
  saveChangedOnboardingSettings,
  saveIdempotentOnboardingGoal,
} from "../../repositories/onboarding-lifecycle-repository";
import {
  parseOwnedProfileGoalWrite,
  type profileGoalWriteDataSchema,
} from "../goals/profile-goal-write";
import { completeRequiredOnboarding } from "./complete-onboarding";

type Db = ReturnType<typeof getRequiredDb>;

export const lifecycleSettingsPatchSchema = z
  .object({
    preset: z.enum(["safer", "balanced", "push_harder"]).optional(),
    minSessionsPerWeek: z.number().int().min(0).max(21).optional(),
    maxSessionsPerWeek: z.number().int().min(0).max(21).optional(),
    maxSingleSessionMinutes: z.number().int().min(20).max(600).optional(),
    maxWeeklyMinutes: z.number().int().min(30).max(10080).optional(),
  })
  .strict()
  .superRefine((patch, ctx) => {
    if (
      patch.minSessionsPerWeek !== undefined &&
      patch.maxSessionsPerWeek !== undefined &&
      patch.minSessionsPerWeek > patch.maxSessionsPerWeek
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["minSessionsPerWeek"],
        message: "Minimum sessions per week cannot exceed maximum sessions",
      });
    }
  });

type SectionStatus<T extends string> = {
  status: T;
  retryable: boolean;
  failure_code?: "content_conflict" | "temporarily_unavailable";
};

export async function completeLifecycleSetup(input: {
  db: Db;
  profileId: string;
  profile: CompleteOnboarding;
  goal?: z.infer<typeof profileGoalWriteDataSchema>;
  settings_patch?: z.infer<typeof lifecycleSettingsPatchSchema>;
}) {
  const required = await completeRequiredOnboarding({
    db: input.db,
    profileId: input.profileId,
    data: input.profile,
  });

  let goal: SectionStatus<"saved" | "skipped" | "failed"> = {
    status: "skipped",
    retryable: false,
  };
  if (input.goal) {
    try {
      await saveIdempotentOnboardingGoal(
        input.db,
        parseOwnedProfileGoalWrite({ profileId: input.profileId, data: input.goal }),
      );
      goal = { status: "saved", retryable: false };
    } catch (error) {
      goal =
        error instanceof OnboardingGoalContentConflictError
          ? { status: "failed", retryable: false, failure_code: "content_conflict" }
          : { status: "failed", retryable: true, failure_code: "temporarily_unavailable" };
    }
  }

  let settings: SectionStatus<"saved" | "unchanged" | "skipped" | "failed"> = {
    status: "skipped",
    retryable: false,
  };
  if (input.settings_patch) {
    try {
      settings = {
        status: await saveChangedOnboardingSettings({
          db: input.db,
          profileId: input.profileId,
          patch: input.settings_patch,
          onboardingIntents: input.profile.intents,
        }),
        retryable: false,
      };
    } catch {
      settings = {
        status: "failed",
        retryable: true,
        failure_code: "temporarily_unavailable",
      };
    }
  }

  return {
    status: required.status,
    goal,
    settings,
    retryable: goal.retryable || settings.retryable,
    cache_tags: [
      // biome-ignore lint/security/noSecrets: Public tRPC cache tag, not a credential.
      "onboarding.getImportedOnboardingValues",
      "goals.list",
      "profileSettings.getForProfile",
    ] as ["onboarding.getImportedOnboardingValues", "goals.list", "profileSettings.getForProfile"],
  };
}

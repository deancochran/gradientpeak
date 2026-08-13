import type { CompleteOnboarding } from "@repo/core/schemas/onboarding";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import {
  completedOnboardingReplayMatches,
  lockOnboardingProfile,
  OnboardingCompletedReplayConflictError,
  OnboardingGoalContentConflictError,
  OnboardingReadinessBarrierError,
  OnboardingStatusConflictError,
  onboardingGoalMatches,
  onboardingSettingsSatisfyRequest,
  readLockedFinalOnboardingState,
  readOnboardingReadinessSnapshot,
  saveChangedOnboardingSettings,
  saveIdempotentOnboardingGoal,
} from "../../repositories/onboarding-lifecycle-repository";
import {
  parseOwnedProfileGoalWrite,
  type profileGoalWriteDataSchema,
} from "../goals/profile-goal-write";
import {
  finalOnboardingMetricsMatch,
  finalOnboardingProfileMatches,
  persistFinalOnboardingProfile,
  prepareFinalOnboardingProfile,
} from "./complete-onboarding";
import { deriveOnboardingReadiness } from "./readiness";

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

/** Finalization is one transaction and fails closed if the required lifecycle goal is absent. */
export async function completeLifecycleSetup(input: {
  db: Db;
  profileId: string;
  profile: CompleteOnboarding;
  goal: z.infer<typeof profileGoalWriteDataSchema>;
  settings_patch?: z.infer<typeof lifecycleSettingsPatchSchema>;
}) {
  const settingsPatch = normalizeLifecycleSettingsPatch(input.settings_patch);
  const goalWrite = parseOwnedProfileGoalWrite({ profileId: input.profileId, data: input.goal });
  const preparedMetrics = await prepareFinalOnboardingProfile({
    db: input.db,
    profileId: input.profileId,
    data: input.profile,
  });
  return input.db.transaction(async (tx) => {
    const profile = await lockOnboardingProfile(tx, input.profileId);
    if (profile.onboarding_status === "completed") {
      const finalState = await readLockedFinalOnboardingState(tx, input.profileId);
      const proof = {
        goalMatches: Boolean(finalState.goal && onboardingGoalMatches(finalState.goal, goalWrite)),
        metricsMatch: finalOnboardingMetricsMatch(finalState.metrics, preparedMetrics),
        profileMatches: finalOnboardingProfileMatches(finalState.profile, input.profile),
        settingsMatch: Boolean(
          finalState.settings &&
            onboardingSettingsSatisfyRequest({
              stored: finalState.settings,
              patch: settingsPatch,
              onboardingIntents: input.profile.intents,
            }),
        ),
      };
      if (completedOnboardingReplayMatches(proof)) {
        return {
          status: "already_completed" as const,
          goal: { status: "unchanged" as const },
          settings: { status: "unchanged" as const },
          created: { profile_metrics: 0 },
        };
      }
      throw new OnboardingCompletedReplayConflictError(
        Object.entries(proof)
          .filter(([, matches]) => !matches)
          .map(([field]) => field),
      );
    }
    if (profile.onboarding_status !== "review") {
      throw new OnboardingStatusConflictError(["review"], profile.onboarding_status);
    }
    const snapshot = await readOnboardingReadinessSnapshot(tx, input.profileId);
    if (!snapshot || !deriveOnboardingReadiness(snapshot).ready_to_finalize) {
      throw new OnboardingReadinessBarrierError();
    }
    try {
      await saveIdempotentOnboardingGoal(tx, goalWrite);
    } catch (error) {
      if (error instanceof OnboardingGoalContentConflictError) throw error;
      throw new Error("Required onboarding goal could not be persisted", { cause: error });
    }
    const settings = await saveChangedOnboardingSettings({
      db: tx,
      profileId: input.profileId,
      patch: settingsPatch,
      onboardingIntents: input.profile.intents,
    });
    const profileMetrics = await persistFinalOnboardingProfile({
      tx,
      profileId: input.profileId,
      data: input.profile,
      metrics: preparedMetrics,
    });
    return {
      status: "completed" as const,
      goal: { status: "saved" as const },
      settings: { status: settings },
      created: { profile_metrics: profileMetrics },
    };
  });
}

function normalizeLifecycleSettingsPatch(
  input: z.infer<typeof lifecycleSettingsPatchSchema> | undefined,
) {
  const settingsPatch: {
    preset?: "safer" | "balanced" | "push_harder";
    minSessionsPerWeek?: number;
    maxSessionsPerWeek?: number;
    maxSingleSessionMinutes?: number;
    maxWeeklyMinutes?: number;
  } = {};
  if (input?.preset !== undefined) settingsPatch.preset = input.preset;
  if (input?.minSessionsPerWeek !== undefined)
    settingsPatch.minSessionsPerWeek = input.minSessionsPerWeek;
  if (input?.maxSessionsPerWeek !== undefined)
    settingsPatch.maxSessionsPerWeek = input.maxSessionsPerWeek;
  if (input?.maxSingleSessionMinutes !== undefined)
    settingsPatch.maxSingleSessionMinutes = input.maxSingleSessionMinutes;
  if (input?.maxWeeklyMinutes !== undefined)
    settingsPatch.maxWeeklyMinutes = input.maxWeeklyMinutes;
  return settingsPatch;
}

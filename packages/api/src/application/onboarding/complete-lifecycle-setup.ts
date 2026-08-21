import type { CompleteOnboarding } from "@repo/core/schemas/onboarding";
import { schema } from "@repo/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import {
  completedOnboardingReplayMatches,
  hasPendingOnboardingOAuthState,
  lockOnboardingProfile,
  OnboardingCompletedReplayConflictError,
  OnboardingGoalContentConflictError,
  OnboardingPendingOAuthError,
  OnboardingProfileNotFoundForLockError,
  OnboardingReadinessBarrierError,
  OnboardingStatusConflictError,
  onboardingGoalMatches,
  onboardingSettingsSatisfyRequest,
  readLockedFinalOnboardingState,
  readOnboardingReadinessSnapshot,
  saveChangedOnboardingSettings,
  saveIdempotentOnboardingGoal,
} from "../../repositories/onboarding-lifecycle-repository";
import { batchInsertProfileMetrics } from "../../utils/onboarding-helpers";
import {
  parseOwnedProfileGoalWrite,
  type profileGoalWriteDataSchema,
} from "../goals/profile-goal-write";
import { finalOnboardingMetricsMatch, prepareFinalOnboardingProfile } from "./complete-onboarding";
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

/** Finalization is one transaction. Provider data, goals, metrics, and settings are optional. */
export async function completeLifecycleSetup(input: {
  db: Db;
  profileId: string;
  profile: CompleteOnboarding;
  goal?: z.infer<typeof profileGoalWriteDataSchema>;
  settings_patch?: z.infer<typeof lifecycleSettingsPatchSchema>;
}) {
  const settingsPatch = normalizeLifecycleSettingsPatch(input.settings_patch);
  const goalWrite = input.goal
    ? parseOwnedProfileGoalWrite({ profileId: input.profileId, data: input.goal })
    : undefined;
  const settingsRequested = input.settings_patch !== undefined || input.profile.intents.length > 0;
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
        goalMatches:
          goalWrite === undefined ||
          Boolean(finalState.goal && onboardingGoalMatches(finalState.goal, goalWrite)),
        metricsMatch: finalOnboardingMetricsMatch(finalState.metrics, preparedMetrics),
        profileMatches: lifecycleProfileMatches(finalState.profile, input.profile),
        settingsMatch:
          !settingsRequested ||
          Boolean(
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
          goal: { status: goalWrite ? ("unchanged" as const) : ("skipped" as const) },
          settings: {
            status: settingsRequested ? ("unchanged" as const) : ("skipped" as const),
          },
          created: { profile_metrics: 0 },
        };
      }
      throw new OnboardingCompletedReplayConflictError(
        Object.entries(proof)
          .filter(([, matches]) => !matches)
          .map(([field]) => field),
      );
    }
    if (profile.onboarding_status === "provider_selection") {
      if (await hasPendingOnboardingOAuthState(tx, input.profileId)) {
        throw new OnboardingPendingOAuthError();
      }
    } else if (profile.onboarding_status === "review") {
      const snapshot = await readOnboardingReadinessSnapshot(tx, input.profileId);
      if (!snapshot || !deriveOnboardingReadiness(snapshot).ready_to_finalize) {
        throw new OnboardingReadinessBarrierError();
      }
    } else {
      throw new OnboardingStatusConflictError(
        ["provider_selection", "review"],
        profile.onboarding_status,
      );
    }
    if (goalWrite) {
      try {
        await saveIdempotentOnboardingGoal(tx, goalWrite);
      } catch (error) {
        if (error instanceof OnboardingGoalContentConflictError) throw error;
        throw new Error("Optional onboarding goal could not be persisted", { cause: error });
      }
    }
    const settings = settingsRequested
      ? await saveChangedOnboardingSettings({
          db: tx,
          profileId: input.profileId,
          patch: settingsPatch,
          onboardingIntents: input.profile.intents,
        })
      : ("skipped" as const);
    const profileMetrics = await persistLifecycleProfile({
      tx,
      profileId: input.profileId,
      data: input.profile,
      metrics: preparedMetrics,
    });
    return {
      status: "completed" as const,
      goal: { status: goalWrite ? ("saved" as const) : ("skipped" as const) },
      settings: { status: settings },
      created: { profile_metrics: profileMetrics },
    };
  });
}

async function persistLifecycleProfile(input: {
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0];
  profileId: string;
  data: CompleteOnboarding;
  metrics: Awaited<ReturnType<typeof prepareFinalOnboardingProfile>>;
}) {
  const [updated] = await input.tx
    .update(schema.profiles)
    .set({
      dob:
        input.data.baseline_field_sources.dob === "cleared"
          ? null
          : input.data.dob
            ? new Date(input.data.dob)
            : undefined,
      full_name: input.data.full_name,
      gender: input.data.baseline_field_sources.gender === "cleared" ? null : input.data.gender,
      onboarding_status: "completed",
      planning_timezone: input.data.planning_timezone,
      username: input.data.username.toLowerCase(),
      updated_at: new Date(),
    })
    .where(eq(schema.profiles.id, input.profileId))
    .returning({ id: schema.profiles.id });
  if (!updated) throw new OnboardingProfileNotFoundForLockError();
  if (input.metrics.length > 0) {
    await batchInsertProfileMetrics(input.tx, input.profileId, input.metrics);
  }
  return input.metrics.length;
}

function lifecycleProfileMatches(
  persisted: {
    dob: Date | null;
    full_name: string | null;
    gender: "male" | "female" | "other" | null;
    planning_timezone: string | null;
    username: string | null;
  },
  requested: CompleteOnboarding,
) {
  const requestedDob = requested.dob
    ? requested.dob
    : requested.baseline_field_sources.dob === "cleared"
      ? null
      : undefined;
  const persistedDob = persisted.dob ? persisted.dob.toISOString().slice(0, 10) : null;
  const requestedGender =
    requested.baseline_field_sources.gender === "cleared" ? null : requested.gender;
  return (
    persisted.full_name === requested.full_name &&
    persisted.username === requested.username.toLowerCase() &&
    (requestedDob === undefined || persistedDob === requestedDob) &&
    (requestedGender === undefined || persisted.gender === requestedGender) &&
    (requested.planning_timezone === undefined ||
      persisted.planning_timezone === requested.planning_timezone)
  );
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

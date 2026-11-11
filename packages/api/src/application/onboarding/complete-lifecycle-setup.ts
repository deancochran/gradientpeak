import type { CompleteOnboarding } from "@repo/core/schemas/onboarding";
import { schema } from "@repo/db";
import { eq } from "drizzle-orm";
import type { z } from "zod";
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
  readLockedFinalOnboardingState,
  readOnboardingReadinessSnapshot,
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

/** Finalization is one transaction. Provider data, goals, and metrics are optional. */
export async function completeLifecycleSetup(input: {
  db: Db;
  profileId: string;
  profile: CompleteOnboarding;
  goal?: z.infer<typeof profileGoalWriteDataSchema>;
}) {
  const goalWrite = input.goal
    ? parseOwnedProfileGoalWrite({ profileId: input.profileId, data: input.goal })
    : undefined;
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
      };
      if (completedOnboardingReplayMatches(proof)) {
        return {
          status: "already_completed" as const,
          goal: { status: goalWrite ? ("unchanged" as const) : ("skipped" as const) },
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
    const profileMetrics = await persistLifecycleProfile({
      tx,
      profileId: input.profileId,
      data: input.profile,
      metrics: preparedMetrics,
    });
    return {
      status: "completed" as const,
      goal: { status: goalWrite ? ("saved" as const) : ("skipped" as const) },
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

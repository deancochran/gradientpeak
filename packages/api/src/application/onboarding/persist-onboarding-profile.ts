import type { CompleteOnboarding } from "@repo/core/schemas/onboarding";
import { profiles } from "@repo/db";
import { eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

export class OnboardingProfileNotFoundError extends Error {
  constructor() {
    super("Profile not found");
    this.name = "OnboardingProfileNotFoundError";
  }
}

type PersistOnboardingProfileInput = {
  tx: Parameters<Parameters<ReturnType<typeof getRequiredDb>["transaction"]>[0]>[0];
  profileId: string;
  input: CompleteOnboarding;
  onboardingStatus?: "provider_selection" | "completed";
};

/** Persists the profile fields owned by the authenticated onboarding subject. */
export async function persistOnboardingProfile({
  tx,
  profileId,
  input,
  onboardingStatus,
}: PersistOnboardingProfileInput): Promise<void> {
  const [updatedProfile] = await tx
    .update(profiles)
    .set({
      dob:
        input.baseline_field_sources?.dob === "cleared"
          ? null
          : input.dob
            ? new Date(input.dob)
            : undefined,
      full_name: input.full_name,
      gender: input.baseline_field_sources?.gender === "cleared" ? null : input.gender,
      onboarding_status: onboardingStatus,
      planning_timezone: input.planning_timezone,
      username: input.username,
      updated_at: new Date(),
    })
    .where(eq(profiles.id, profileId))
    .returning({ id: profiles.id });

  if (!updatedProfile?.id) {
    throw new OnboardingProfileNotFoundError();
  }
}

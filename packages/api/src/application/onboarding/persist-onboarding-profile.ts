import { athletePreferenceProfileSchema, defaultAthletePreferenceProfile } from "@repo/core";
import type { CompleteOnboarding } from "@repo/core/schemas/onboarding";
import { profiles, profileTrainingSettings } from "@repo/db";
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
};

/** Persists the profile fields owned by the authenticated onboarding subject. */
export async function persistOnboardingProfile({
  tx,
  profileId,
  input,
}: PersistOnboardingProfileInput): Promise<void> {
  const [updatedProfile] = await tx
    .update(profiles)
    .set({
      dob: input.dob ? new Date(input.dob) : undefined,
      full_name: input.full_name,
      gender: input.gender,
      onboarded: true,
      username: input.username,
      updated_at: new Date(),
    })
    .where(eq(profiles.id, profileId))
    .returning({ id: profiles.id });

  if (!updatedProfile?.id) {
    throw new OnboardingProfileNotFoundError();
  }

  const [existingRow] = await tx
    .select({ settings: profileTrainingSettings.settings })
    .from(profileTrainingSettings)
    .where(eq(profileTrainingSettings.profile_id, profileId))
    .limit(1);
  const existingSettings = existingRow
    ? athletePreferenceProfileSchema.parse(existingRow.settings)
    : defaultAthletePreferenceProfile;
  const settings = athletePreferenceProfileSchema.parse({
    ...existingSettings,
    onboarding_intents: input.intents,
  });
  const now = new Date();

  await tx
    .insert(profileTrainingSettings)
    .values({ profile_id: profileId, settings, updated_at: now })
    .onConflictDoUpdate({
      target: profileTrainingSettings.profile_id,
      set: { settings, updated_at: now },
    });
}

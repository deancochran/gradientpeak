import type { CompleteOnboarding } from "@repo/core/schemas/onboarding";
import { type DrizzleDbClient, profiles } from "@repo/db";
import { eq } from "drizzle-orm";

export class OnboardingProfileNotFoundError extends Error {
  constructor() {
    super("Profile not found");
    this.name = "OnboardingProfileNotFoundError";
  }
}

type PersistOnboardingProfileInput = {
  db: DrizzleDbClient;
  profileId: string;
  input: CompleteOnboarding;
};

/** Persists the profile fields owned by the authenticated onboarding subject. */
export async function persistOnboardingProfile({
  db,
  profileId,
  input,
}: PersistOnboardingProfileInput): Promise<void> {
  const [updatedProfile] = await db
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
}

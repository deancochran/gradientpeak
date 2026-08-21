type DraftProfile = {
  full_name: string | null;
  username: string | null;
};

/** Only identity is part of initial onboarding. Optional profile data stays in later workflows. */
export function buildOnboardingDraftDefaults(input: { profile: DraftProfile }) {
  return {
    full_name: input.profile.full_name ?? "",
    username: input.profile.username ?? "",
  };
}

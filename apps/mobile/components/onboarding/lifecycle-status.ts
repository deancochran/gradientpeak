import type { OnboardingStatus } from "@repo/core";

export function resolveOnboardingLifecycleStatus(input: {
  overrideStatus?: OnboardingStatus | null;
  profileStatus?: OnboardingStatus | null;
  progressStatus?: OnboardingStatus | null;
}): OnboardingStatus {
  if (input.overrideStatus) return input.overrideStatus;
  if (input.profileStatus && input.profileStatus !== "processing") return input.profileStatus;
  return input.progressStatus ?? input.profileStatus ?? "provider_selection";
}

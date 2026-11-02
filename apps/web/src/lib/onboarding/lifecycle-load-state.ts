import type { OnboardingStatus } from "@repo/core";

export function resolveLoadedOnboardingStatus(input: {
  readinessStatus?: OnboardingStatus | null;
  profileStatus?: OnboardingStatus | null;
}) {
  return input.readinessStatus ?? input.profileStatus ?? null;
}

import { type CompleteOnboarding, completeOnboardingSchema } from "@repo/core";
import type { OnboardingData, OnboardingFieldSources } from "@/components/onboarding/types";

type BuildCompleteOnboardingInputResult =
  | { ok: true; input: CompleteOnboarding; profile: { full_name: string; username: string } }
  | { ok: false; error: string };

/** Initial onboarding intentionally submits identity only; optional profile data is configured later. */
export function buildCompleteOnboardingInput(
  data: OnboardingData,
  _fieldSources: OnboardingFieldSources = {},
): BuildCompleteOnboardingInputResult {
  const result = completeOnboardingSchema.safeParse({
    full_name: data.full_name,
    username: data.username,
  });
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues[0]?.message ?? "Review your name and username.",
    };
  }
  return {
    ok: true,
    input: result.data,
    profile: { full_name: result.data.full_name, username: result.data.username },
  };
}

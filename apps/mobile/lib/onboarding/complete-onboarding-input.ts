import type { CompleteOnboarding } from "@repo/core";
import type { OnboardingData, OnboardingFieldSources } from "@/components/onboarding/types";

type BuildCompleteOnboardingInputResult =
  | { ok: true; input: CompleteOnboarding; profile: { full_name: string; username: string } }
  | { ok: false; error: string };

export function buildCompleteOnboardingInput(
  data: OnboardingData,
  fieldSources: OnboardingFieldSources = {},
): BuildCompleteOnboardingInputResult {
  const fullName = data.full_name.trim();
  const username = data.username.trim();

  if (!fullName || !username) {
    return { ok: false, error: "Full name and username are required." };
  }

  const dob = data.dob?.trim() || undefined;

  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return { ok: false, error: "Please enter a valid date of birth." };
  }

  const baselineFieldSources: NonNullable<CompleteOnboarding["baseline_field_sources"]> = {};
  const sourceMappings = [
    ["dob", "dob"],
    ["gender", "gender"],
    ["weight_kg", "weight_kg"],
    ["max_hr", "max_hr"],
    ["resting_hr", "resting_hr"],
  ] as const;

  for (const [mobileField, transportField] of sourceMappings) {
    const source = fieldSources[mobileField]?.kind;
    if (source) baselineFieldSources[transportField] = source;
  }

  return {
    ok: true,
    input: {
      dob,
      experience_level: data.experience_level ?? "skip",
      full_name: fullName,
      gender: data.gender ?? undefined,
      intents: data.intent,
      planning_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      max_hr: data.max_hr ?? undefined,
      resting_hr: data.resting_hr ?? undefined,
      username,
      vo2max: data.vo2max ?? undefined,
      weight_kg: data.weight_kg ?? undefined,
      ...(Object.keys(baselineFieldSources).length > 0
        ? { baseline_field_sources: baselineFieldSources }
        : null),
    },
    profile: { full_name: fullName, username },
  };
}

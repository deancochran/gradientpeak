import type { CompleteOnboarding } from "@repo/core";
import type { OnboardingData } from "@/components/onboarding/types";

type BuildCompleteOnboardingInputResult =
  | { ok: true; input: CompleteOnboarding; profile: { full_name: string; username: string } }
  | { ok: false; error: string };

export function buildCompleteOnboardingInput(
  data: OnboardingData,
): BuildCompleteOnboardingInputResult {
  const fullName = data.full_name.trim();
  const username = data.username.trim();

  if (!fullName || !username) {
    return { ok: false, error: "Full name and username are required." };
  }

  const dobDate = data.dob ? new Date(data.dob) : undefined;

  if (dobDate && Number.isNaN(dobDate.getTime())) {
    return { ok: false, error: "Please enter a valid date of birth." };
  }

  return {
    ok: true,
    input: {
      css_seconds_per_hundred_meters: data.css ?? undefined,
      dob: dobDate?.toISOString(),
      experience_level: data.experience_level ?? "skip",
      ftp: data.ftp ?? undefined,
      full_name: fullName,
      gender: data.gender ?? undefined,
      lthr: data.lthr ?? undefined,
      max_hr: data.max_hr ?? undefined,
      resting_hr: data.resting_hr ?? undefined,
      threshold_pace_seconds_per_km: data.threshold_pace ?? undefined,
      username,
      vo2max: data.vo2max ?? undefined,
      weight_kg: data.weight_kg ?? undefined,
    },
    profile: { full_name: fullName, username },
  };
}

import type { OnboardingData } from "@/components/onboarding/types";

export function isValidOnboardingUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username.trim());
}

export function isValidIdentity(data: OnboardingData): boolean {
  return data.full_name.trim().length > 0 && isValidOnboardingUsername(data.username);
}

export function isValidDateString(value: string | null): boolean {
  return !!value && !Number.isNaN(new Date(value).getTime());
}

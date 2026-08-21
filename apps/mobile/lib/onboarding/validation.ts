import { completeOnboardingSchema } from "@repo/core";
import type { OnboardingData } from "@/components/onboarding/types";

export function isValidOnboardingUsername(username: string): boolean {
  return completeOnboardingSchema.shape.username.safeParse(username).success;
}

export function isValidIdentity(data: OnboardingData): boolean {
  return completeOnboardingSchema
    .pick({ full_name: true, username: true })
    .safeParse({ full_name: data.full_name, username: data.username }).success;
}

export function isValidDateString(value: string | null): boolean {
  return !!value && !Number.isNaN(new Date(value).getTime());
}

import type { ExperienceLevel } from "../estimators/types";
import { calculateDateOfBirthAge, formatDateOfBirth } from "../profile/date-of-birth";
import { calculateVO2MaxFromHR, estimateMaxHRFromAge } from "./heart-rate";

export interface OnboardingBaselineProfile {
  max_hr: number;
  resting_hr: number;
  vo2_max: number;
  confidence: "high" | "medium" | "low";
  source: "baseline_beginner" | "baseline_intermediate";
}

/**
 * Generates optional non-threshold onboarding measurements.
 * Performance thresholds remain unavailable until canonical evidence exists.
 */
export function getOnboardingBaselineProfile(
  experienceLevel: ExperienceLevel | "skip",
  gender: "male" | "female" | "other",
  age: number,
): OnboardingBaselineProfile | null {
  if (experienceLevel === "skip" || experienceLevel === "advanced") {
    return null;
  }
  if (age <= 0) {
    throw new Error("Age must be greater than 0");
  }

  const max_hr = estimateMaxHRFromAge(age);
  const restingHrBaselines = {
    beginner: { male: 70, female: 75, other: 72 },
    intermediate: { male: 60, female: 65, other: 62 },
  } as const;
  const resting_hr = restingHrBaselines[experienceLevel][gender];

  return {
    max_hr,
    resting_hr,
    vo2_max: calculateVO2MaxFromHR(max_hr, resting_hr),
    confidence: experienceLevel === "beginner" ? "low" : "medium",
    source: experienceLevel === "beginner" ? "baseline_beginner" : "baseline_intermediate",
  };
}

export function calculateAge(dob: string | Date): number {
  return (
    calculateDateOfBirthAge(typeof dob === "string" ? dob : formatDateOfBirth(dob)) ?? Number.NaN
  );
}

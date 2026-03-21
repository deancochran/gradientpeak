import { calculateAge as calculateAgeFromDOB } from "../calculations/baseline-profiles";
import { calculateVO2MaxFromHR } from "../calculations/heart-rate";
import { estimateLTHRFromMaxHR, estimateMaxHRFromAge } from "../zones/hr";
import type { ExperienceLevel, MetricEstimationResult, ValidationResult } from "./types";

export function estimateFTPFromWeight(weightKg: number): MetricEstimationResult {
  const wattsPerKg = 2.5;
  return {
    value: Math.round(weightKg * wattsPerKg),
    source: "estimated",
    confidence: "low",
    notes: `Estimated from weight (${weightKg}kg) using ${wattsPerKg} W/kg ratio`,
  };
}

export function estimateConservativeFTPFromWeight(
  weightKg: number | null | undefined,
): number | null {
  if (!weightKg || weightKg <= 0) return null;
  return estimateFTPFromWeight(weightKg).value;
}

export function estimateFTPFromWeightByProfile(
  weightKg: number,
  gender: "male" | "female" | "other",
  experienceLevel: ExperienceLevel = "intermediate",
): number {
  if (weightKg <= 0) throw new Error("Weight must be greater than 0");
  if (weightKg < 30 || weightKg > 200) {
    throw new Error("Weight must be between 30 and 200 kg");
  }

  const ratios: Record<ExperienceLevel, Record<"male" | "female" | "other", number>> = {
    beginner: { male: 2.0, female: 1.5, other: 1.75 },
    intermediate: { male: 2.75, female: 2.25, other: 2.5 },
    advanced: { male: 3.5, female: 3.0, other: 3.25 },
  };

  return Math.round(weightKg * ratios[experienceLevel][gender]);
}

export function estimateMaxHR(age: number): MetricEstimationResult {
  return {
    value: estimateMaxHRFromAge(age),
    source: "estimated",
    confidence: "low",
    notes: `Estimated from age (${age}) using 220 - age formula`,
  };
}

export function estimateMaxHRFromDOB(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const age = calculateAgeFromDOB(dob);
  if (!Number.isFinite(age) || age <= 0) return null;
  return estimateMaxHRFromAge(age);
}

export function estimateLTHR(maxHR: number): MetricEstimationResult {
  return {
    value: estimateLTHRFromMaxHR(maxHR),
    source: "estimated",
    confidence: "low",
    notes: `Estimated from max HR (${maxHR} bpm) using 85% ratio`,
  };
}

export function estimateThresholdPaceFromFitnessLevel(
  fitnessLevel: ExperienceLevel,
): MetricEstimationResult {
  const paceByLevel: Record<ExperienceLevel, number> = {
    beginner: 360,
    intermediate: 300,
    advanced: 240,
  };
  const estimatedPace = paceByLevel[fitnessLevel];
  const minutes = Math.floor(estimatedPace / 60);
  const seconds = estimatedPace % 60;
  return {
    value: estimatedPace,
    source: "estimated",
    confidence: "low",
    notes: `Estimated from fitness level (${fitnessLevel}): ${minutes}:${seconds.toString().padStart(2, "0")} min/km`,
  };
}

export function estimateThresholdPaceFromGender(
  gender: "male" | "female" | "other",
  experienceLevel: ExperienceLevel = "intermediate",
): number {
  const paces: Record<ExperienceLevel, Record<"male" | "female" | "other", number>> = {
    beginner: { male: 390, female: 420, other: 405 },
    intermediate: { male: 315, female: 345, other: 330 },
    advanced: { male: 270, female: 300, other: 285 },
  };
  return paces[experienceLevel][gender];
}

export function estimateCSSFromGender(
  gender: "male" | "female" | "other",
  experienceLevel: ExperienceLevel = "intermediate",
): number {
  const cssByLevel: Record<ExperienceLevel, Record<"male" | "female" | "other", number>> = {
    beginner: { male: 120, female: 135, other: 127 },
    intermediate: { male: 100, female: 110, other: 105 },
    advanced: { male: 80, female: 90, other: 85 },
  };
  return cssByLevel[experienceLevel][gender];
}

export function estimateVO2MaxFromHrProfile(maxHR: number, restingHR: number): number {
  return calculateVO2MaxFromHR(maxHR, restingHR);
}

export function validatePerformanceMetric(
  metric: "ftp" | "threshold_pace" | "css" | "vo2_max",
  value: number,
  context: {
    weightKg?: number;
    age?: number;
    gender?: "male" | "female" | "other";
    experienceLevel?: ExperienceLevel;
  },
): ValidationResult {
  const warnings: string[] = [];
  let isValid = true;
  let confidence: "high" | "medium" | "low" = "high";
  let percentileEstimate: number | undefined;

  if (metric === "ftp") {
    if (!context.weightKg) {
      return {
        isValid: true,
        warnings: ["Cannot validate FTP without weight information"],
        confidence: "low",
      };
    }
    const wattsPerKg = value / context.weightKg;
    if (wattsPerKg < 1.0 || wattsPerKg > 5.0) {
      isValid = false;
      confidence = "low";
    }
    percentileEstimate = wattsPerKg < 2 ? 25 : wattsPerKg < 2.75 ? 50 : wattsPerKg < 3.5 ? 75 : 90;
  }

  if (metric === "threshold_pace") {
    if (value < 180 || value > 480) {
      isValid = false;
      confidence = "low";
    }
    percentileEstimate = value > 390 ? 25 : value > 315 ? 50 : value > 270 ? 75 : 90;
  }

  if (metric === "css") {
    if (value < 60 || value > 180) {
      isValid = false;
      confidence = "low";
    }
    percentileEstimate = value > 120 ? 25 : value > 100 ? 50 : value > 90 ? 75 : 90;
  }

  if (metric === "vo2_max") {
    if (value < 20 || value > 80) {
      isValid = false;
      confidence = "low";
    }
    percentileEstimate = value < 40 ? 40 : value < 50 ? 60 : value < 60 ? 80 : 90;
  }

  return { isValid, warnings, confidence, percentileEstimate };
}

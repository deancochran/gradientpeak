import { calculateAge as calculateAgeFromDOB } from "../calculations/baseline-profiles";
import {
  estimateLTHR as estimateLTHRFromMaxHR,
  estimateMaxHRFromAge,
} from "../calculations/heart-rate";
import {
  estimateCSSFromGender,
  estimateFTPFromWeight,
  estimateThresholdPaceFromGender,
  validatePerformanceMetric,
} from "../calculations/performance-estimates";
import type { ExperienceLevel, ValidationResult } from "../estimators/types";
import type { MetricSource } from "../schemas/activity_efforts";

export interface BaselineEstimationResult {
  value: number;
  source: MetricSource;
  confidence?: "high" | "medium" | "low";
  notes?: string;
}

export function estimateConservativeFTPFromWeight(
  weightKg: number | null | undefined,
): number | null {
  if (!weightKg || weightKg <= 0) {
    return null;
  }

  return estimateFTPFromWeight(weightKg, "other", "beginner");
}

export function estimateFTPBaseline(weightKg: number): BaselineEstimationResult {
  const estimatedFTP = estimateFTPFromWeight(weightKg, "other", "beginner");
  return {
    value: estimatedFTP,
    source: "estimated",
    confidence: "low",
    notes: `Estimated from weight (${weightKg}kg) using a conservative beginner baseline`,
  };
}

export function estimateMaxHRBaseline(age: number): BaselineEstimationResult {
  const estimatedMaxHR = estimateMaxHRFromAge(age);
  return {
    value: estimatedMaxHR,
    source: "estimated",
    confidence: "low",
    notes: `Estimated from age (${age}) using 220 - age formula`,
  };
}

export function estimateMaxHRFromDOB(dob: string | null | undefined): number | null {
  if (!dob) {
    return null;
  }

  const age = calculateAgeFromDOB(dob);
  if (!Number.isFinite(age) || age <= 0) {
    return null;
  }

  return estimateMaxHRBaseline(age).value;
}

export function estimateLTHRBaseline(maxHR: number): BaselineEstimationResult {
  return {
    value: estimateLTHRFromMaxHR(maxHR),
    source: "estimated",
    confidence: "low",
    notes: `Estimated from max HR (${maxHR} bpm) using 85% ratio`,
  };
}

export function estimateThresholdPaceBaseline(
  fitnessLevel: "beginner" | "intermediate" | "advanced",
): BaselineEstimationResult {
  const estimatedPace =
    fitnessLevel === "beginner" ? 360 : fitnessLevel === "intermediate" ? 300 : 240;

  return {
    value: estimatedPace,
    source: "estimated",
    confidence: "low",
    notes: `Estimated from fitness level (${fitnessLevel})`,
  };
}

export function estimateThresholdPaceFromExperience(
  gender: "male" | "female" | "other",
  experienceLevel: ExperienceLevel = "intermediate",
): number {
  return estimateThresholdPaceFromGender(gender, experienceLevel);
}

export function estimateCSSBaseline(
  gender: "male" | "female" | "other",
  experienceLevel: ExperienceLevel = "intermediate",
): number {
  return estimateCSSFromGender(gender, experienceLevel);
}

export function validateEstimatedPerformanceMetric(
  metric: "ftp" | "threshold_pace" | "css" | "vo2_max",
  value: number,
  context: {
    weightKg?: number;
    age?: number;
    gender?: "male" | "female" | "other";
    experienceLevel?: ExperienceLevel;
  },
): ValidationResult {
  return validatePerformanceMetric(metric, value, context);
}

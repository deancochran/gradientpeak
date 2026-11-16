import { calculateAge as calculateAgeFromDOB } from "../calculations/baseline-profiles";
import { estimateMaxHRFromAge } from "../zones/hr";
import type { MetricEstimationResult } from "./types";

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

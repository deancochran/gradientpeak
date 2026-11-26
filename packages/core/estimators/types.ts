import type { MetricSource } from "../schemas/activity_efforts";

export interface MetricEstimationResult {
  value: number;
  source: MetricSource;
  confidence?: "high" | "medium" | "low";
  notes?: string;
}

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

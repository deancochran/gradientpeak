import { z } from "zod";
import { activityEffortTypeSchema } from "../athlete-inputs/activity-efforts";
import { canonicalActivityCategorySchema } from "./activity-category";

export const effortTypeSchema = activityEffortTypeSchema;

// Domain/calculation input only. Persisted row ownership lives in @repo/db.
export const BestEffortSchema = z.object({
  activity_category: canonicalActivityCategorySchema,
  duration_seconds: z.number().int().positive(),
  effort_type: effortTypeSchema,
  value: z.number(),
  unit: z.string(),
  recorded_at: z.string().datetime(),
});

export type BestEffort = z.infer<typeof BestEffortSchema>;
export type EffortType = z.infer<typeof effortTypeSchema>;
export type MetricSource = "manual" | "test" | "estimated" | "imported";

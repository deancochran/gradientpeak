import { z } from "zod";
import {
  activityEffortTypeSchema,
  createActivityEffortInputSchema,
  updateActivityEffortInputSchema,
} from "../athlete-inputs/activity-efforts";
import { canonicalSportSchema } from "./sport";

export const effortTypeSchema = activityEffortTypeSchema;

export const activityEffortCreateInputSchema = createActivityEffortInputSchema;

export const activityEffortUpdateInputSchema = updateActivityEffortInputSchema;

// Domain/calculation input only. Persisted row ownership lives in @repo/db.
export const BestEffortSchema = z.object({
  activity_category: canonicalSportSchema,
  duration_seconds: z.number().int().positive(),
  effort_type: effortTypeSchema,
  value: z.number(),
  unit: z.string(),
  recorded_at: z.string().datetime(),
});

export type BestEffort = z.infer<typeof BestEffortSchema>;
export type ActivityEffortCreateInput = z.infer<typeof activityEffortCreateInputSchema>;
export type ActivityEffortUpdateInput = z.infer<typeof activityEffortUpdateInputSchema>;
export type EffortType = z.infer<typeof effortTypeSchema>;
export type MetricSource = "manual" | "test" | "estimated" | "imported";

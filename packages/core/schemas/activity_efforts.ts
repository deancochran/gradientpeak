import { z } from "zod";
import { canonicalSportSchema } from "./sport";

export const effortTypeSchema = z.enum(["power", "speed"]);

const activityEffortWritableFieldsSchema = z
  .object({
    activity_id: z.string().uuid().optional().nullable(),
    activity_category: canonicalSportSchema,
    duration_seconds: z.number().int().positive(),
    effort_type: effortTypeSchema,
    value: z.number(),
    unit: z.string().min(1),
    start_offset: z.number().int().nonnegative().optional().nullable(),
    recorded_at: z.string().datetime(),
  })
  .strict();

export const activityEffortCreateInputSchema = activityEffortWritableFieldsSchema;

export const activityEffortUpdateInputSchema = activityEffortWritableFieldsSchema
  .partial()
  .extend({ id: z.string().uuid() })
  .strict();

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

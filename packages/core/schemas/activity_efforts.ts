import { z } from "zod";
import { publicActivityCategorySchema } from "@repo/supabase";

export const effortTypeSchema = z.enum(["power", "speed"]);

export const BestEffortSchema = z.object({
  id: z.string().uuid().optional(), // Optional for creation
  activity_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  activity_category: publicActivityCategorySchema,
  duration_seconds: z.number().int().positive(),
  effort_type: effortTypeSchema,
  value: z.number(),
  unit: z.string(),
  start_offset: z.number().int().optional().nullable(),
  recorded_at: z.string().datetime(),
  created_at: z.string().datetime().optional(), // Optional for creation
});

export type BestEffort = z.infer<typeof BestEffortSchema>;
export type EffortType = z.infer<typeof effortTypeSchema>;
export type MetricSource = "manual" | "test" | "estimated" | "imported";

import { z } from "zod";
import { canonicalActivityCategorySchema } from "../activity-category";

const nonNegativeFiniteNumberSchema = z.number().finite().min(0);

export const dailyAllocationTargetSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    activity_category: canonicalActivityCategorySchema,
    target_load: nonNegativeFiniteNumberSchema,
    max_duration_minutes: nonNegativeFiniteNumberSchema.optional(),
    rationale_codes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const weeklyAllocationBudgetSchema = z
  .object({
    week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    activity_category: canonicalActivityCategorySchema,
    target_load: nonNegativeFiniteNumberSchema,
    max_load: nonNegativeFiniteNumberSchema.optional(),
    min_load: nonNegativeFiniteNumberSchema.optional(),
    max_sessions: z.number().int().min(0).max(21).optional(),
    max_duration_minutes: nonNegativeFiniteNumberSchema.optional(),
    rationale_codes: z.array(z.string().min(1)).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.min_load !== undefined &&
      value.max_load !== undefined &&
      value.min_load > value.max_load
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["min_load"],
        message: "min_load cannot exceed max_load",
      });
    }
  });

export type DailyAllocationTarget = z.infer<typeof dailyAllocationTargetSchema>;
export type WeeklyAllocationBudget = z.infer<typeof weeklyAllocationBudgetSchema>;

import { z } from "zod";
import { canonicalSportSchema } from "../sport";

const nonNegativeFiniteNumberSchema = z.number().finite().min(0);

export const dailyAllocationTargetSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sport: canonicalSportSchema,
    target_tss: nonNegativeFiniteNumberSchema,
    max_duration_minutes: nonNegativeFiniteNumberSchema.optional(),
    rationale_codes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const weeklyAllocationBudgetSchema = z
  .object({
    week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sport: canonicalSportSchema,
    target_tss: nonNegativeFiniteNumberSchema,
    max_tss: nonNegativeFiniteNumberSchema.optional(),
    min_tss: nonNegativeFiniteNumberSchema.optional(),
    max_sessions: z.number().int().min(0).max(21).optional(),
    max_duration_minutes: nonNegativeFiniteNumberSchema.optional(),
    rationale_codes: z.array(z.string().min(1)).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.min_tss !== undefined &&
      value.max_tss !== undefined &&
      value.min_tss > value.max_tss
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["min_tss"],
        message: "min_tss cannot exceed max_tss",
      });
    }
  });

export type DailyAllocationTarget = z.infer<typeof dailyAllocationTargetSchema>;
export type WeeklyAllocationBudget = z.infer<
  typeof weeklyAllocationBudgetSchema
>;

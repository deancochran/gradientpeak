// packages/core/schemas/training_plan_structure.ts
import { z } from "zod";

/**
 * Periodization Template Schema
 * Defines the long-term training progression plan
 */
export const periodizationTemplateSchema = z
  .object({
    starting_ctl: z.number().min(0).describe("Starting Chronic Training Load"),
    target_ctl: z.number().min(0).describe("Target Chronic Training Load"),
    ramp_rate: z
      .number()
      .min(0)
      .max(1)
      .describe("Weekly CTL increase rate (0-1)"),
    target_date: z.string().describe("Target date in ISO format (YYYY-MM-DD)"),
  })
  .refine((data) => data.target_ctl >= data.starting_ctl, {
    message: "Target CTL must be greater than or equal to starting CTL",
  });

/**
 * Training Plan Structure Schema
 * This is the JSONB structure stored in the database
 */
export const trainingPlanStructureSchema = z
  .object({
    // Weekly TSS targets
    target_weekly_tss_min: z
      .number()
      .min(0)
      .describe("Minimum weekly Training Stress Score"),
    target_weekly_tss_max: z
      .number()
      .min(0)
      .describe("Maximum weekly Training Stress Score"),

    // Activity frequency
    target_activities_per_week: z
      .number()
      .min(1)
      .max(7)
      .describe("Target number of activities per week"),

    // Recovery constraints
    max_consecutive_days: z
      .number()
      .min(1)
      .max(7)
      .describe("Maximum consecutive training days"),
    min_rest_days_per_week: z
      .number()
      .min(0)
      .max(7)
      .describe("Minimum rest days per week"),

    // Note: Intensity is derived from IF (Intensity Factor) after activity completion
    // No need to prescribe intensity distribution - it's analyzed from actual data
    // Hard activity spacing cannot be validated proactively since intensity is calculated post-activity

    // Periodization
    periodization_template: periodizationTemplateSchema.optional(),
  })
  .refine((data) => data.target_weekly_tss_max >= data.target_weekly_tss_min, {
    message:
      "Maximum weekly TSS must be greater than or equal to minimum weekly TSS",
  })
  .refine(
    (data) =>
      data.target_activities_per_week + data.min_rest_days_per_week <= 7,
    {
      message:
        "Target activities per week plus minimum rest days cannot exceed 7",
    },
  );

/**
 * Training Plan Create Schema
 * Used for creating new training plans
 */
export const trainingPlanCreateSchema = z.object({
  name: z
    .string()
    .min(1, "Plan name is required")
    .max(255, "Plan name is too long"),
  description: z.string().max(1000, "Description is too long").optional(),
  structure: trainingPlanStructureSchema,
  is_active: z.boolean().default(true),
});

/**
 * Training Plan Update Schema
 * Used for updating existing training plans
 * All fields are optional since this is a partial update
 */
export const trainingPlanUpdateSchema = z.object({
  name: z
    .string()
    .min(1, "Plan name is required")
    .max(255, "Plan name is too long")
    .optional(),
  description: z
    .string()
    .max(1000, "Description is too long")
    .optional()
    .nullable(),
  structure: trainingPlanStructureSchema.optional(),
  is_active: z.boolean().optional(),
});

/**
 * TypeScript types exported for use throughout the application
 */
export type PeriodizationTemplate = z.infer<typeof periodizationTemplateSchema>;
export type TrainingPlanStructure = z.infer<typeof trainingPlanStructureSchema>;
export type TrainingPlanCreate = z.infer<typeof trainingPlanCreateSchema>;
export type TrainingPlanUpdate = z.infer<typeof trainingPlanUpdateSchema>;

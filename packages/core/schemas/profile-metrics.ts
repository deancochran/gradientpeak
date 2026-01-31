/**
 * Profile Metrics Schemas
 *
 * Extends SupaZod-generated schemas with custom validation for profile biometric metrics.
 * These schemas handle time-series biometric data (weight, sleep, HRV, etc.).
 */

import { z } from "zod";
import {
  publicProfileMetricTypeSchema,
  publicProfileMetricsRowSchema,
  publicProfileMetricsInsertSchema,
  publicProfileMetricsUpdateSchema,
} from "@repo/supabase";

// Re-export base enum from SupaZod
export const profileMetricTypeSchema = publicProfileMetricTypeSchema;

// Re-export base schema from SupaZod
export const profileMetricLogSchema = publicProfileMetricsRowSchema;
export const ProfileMetricSchema = profileMetricLogSchema;

/**
 * Input schema for creating a new profile metric log.
 * Extends SupaZod insert schema with additional validation.
 */
export const createProfileMetricInputSchema = publicProfileMetricsInsertSchema
  .omit({
    id: true,
    created_at: true,
  })
  .extend({
    // Profile ID required
    profile_id: z.string().uuid("Invalid profile ID"),

    // Metric type required
    metric_type: profileMetricTypeSchema,

    // Value validation based on metric type (will be refined below)
    value: z.number(),

    // Unit required
    unit: z.string().min(1, "Unit is required"),

    // Optional fields with validation
    recorded_at: z.string().datetime("Invalid datetime").optional(),
  })
  .refine(
    (data) => {
      // Validate value ranges based on metric type
      switch (data.metric_type) {
        case "weight_kg":
          return data.value > 0 && data.value < 500; // Reasonable weight range
        case "resting_hr":
          return data.value >= 30 && data.value <= 120; // Reasonable resting HR range
        case "max_hr":
          return data.value >= 100 && data.value <= 250; // Reasonable max HR range
        case "hrv_rmssd":
          return data.value >= 0 && data.value <= 300; // Typical HRV range
        case "vo2_max":
          return data.value > 0 && data.value <= 100; // VO2max in ml/kg/min
        case "body_fat_percentage":
          return data.value >= 0 && data.value <= 100; // Percentage
        // case "lthr":
        //   return data.value >= 80 && data.value <= 220; // Reasonable LTHR range
        default:
          return true;
      }
    },
    {
      message: "Value out of valid range for metric type",
      path: ["value"],
    },
  );

/**
 * Schema for updating an existing profile metric log.
 * All fields optional except ID.
 */
export const updateProfileMetricInputSchema = z.object({
  id: z.string().uuid("Invalid metric ID"),
  value: z.number().optional(),
  unit: z.string().min(1, "Unit is required").optional(),
  notes: z
    .string()
    .max(1000, "Notes must be less than 1000 characters")
    .nullable()
    .optional(),
  recorded_at: z.string().datetime("Invalid datetime").optional(),
});

/**
 * Schema for querying profile metrics at a specific date.
 * Used for temporal metric lookups.
 */
export const getProfileMetricAtDateInputSchema = z.object({
  profile_id: z.string().uuid("Invalid profile ID"),
  metric_type: profileMetricTypeSchema,
  date: z.date(),
});

/**
 * Schema for querying profile metrics in a date range.
 */
export const getProfileMetricsInRangeInputSchema = z
  .object({
    profile_id: z.string().uuid("Invalid profile ID"),
    metric_type: profileMetricTypeSchema.optional(),
    start_date: z.date(),
    end_date: z.date(),
  })
  .refine((data) => data.end_date >= data.start_date, {
    message: "End date must be after or equal to start date",
    path: ["end_date"],
  });

// Infer TypeScript types from schemas
export type ProfileMetricType = z.infer<typeof profileMetricTypeSchema>;
export type ProfileMetricLog = z.infer<typeof profileMetricLogSchema>;
export type CreateProfileMetricInput = z.infer<
  typeof createProfileMetricInputSchema
>;
export type UpdateProfileMetricInput = z.infer<
  typeof updateProfileMetricInputSchema
>;
export type GetProfileMetricAtDateInput = z.infer<
  typeof getProfileMetricAtDateInputSchema
>;
export type GetProfileMetricsInRangeInput = z.infer<
  typeof getProfileMetricsInRangeInputSchema
>;

/**
 * Standard units for each metric type.
 */
export const PROFILE_METRIC_UNITS: Record<ProfileMetricType, string> = {
  weight_kg: "kg",
  resting_hr: "bpm",
  max_hr: "bpm",
  hrv_rmssd: "ms",
  vo2_max: "ml/kg/min",
  body_fat_percentage: "%",
  // lthr: 'bpm', // TODO: Enable when enum is updated
  sleep_hours: "hours",
  hydration_level: "scale",
  stress_score: "scale",
  soreness_level: "scale",
  wellness_score: "scale",
};

/**
 * Valid value ranges for each metric type.
 */
export const PROFILE_METRIC_RANGES: Record<
  ProfileMetricType,
  { min: number; max: number }
> = {
  weight_kg: { min: 20, max: 500 },
  resting_hr: { min: 30, max: 120 },
  max_hr: { min: 100, max: 250 },
  hrv_rmssd: { min: 0, max: 300 },
  vo2_max: { min: 10, max: 100 },
  body_fat_percentage: { min: 0, max: 100 },
  // lthr: { min: 80, max: 220 }, // TODO: Enable when enum is updated
  sleep_hours: { min: 0, max: 24 },
  hydration_level: { min: 0, max: 10 },
  stress_score: { min: 0, max: 10 },
  soreness_level: { min: 0, max: 10 },
  wellness_score: { min: 0, max: 10 },
};

/**
 * Profile Metrics Schemas
 *
 * Business-facing validation helpers for profile biometric metrics.
 * DB-backed enum and row ownership live in @repo/db.
 */

import { z } from "zod";

export const profileMetricNotesSchema = z
  .string()
  .max(1000, "Notes must be less than 1000 characters")
  .nullable()
  .optional();

export const profileMetricRecordedAtSchema = z.string().datetime("Invalid datetime").optional();

export function isProfileMetricValueWithinBusinessRange(
  metricType: string,
  value: number,
): boolean {
  switch (metricType) {
    case "weight_kg":
      return value > 0 && value < 500;
    case "resting_hr":
      return value >= 30 && value <= 120;
    case "max_hr":
      return value >= 100 && value <= 250;
    case "hrv_rmssd":
      return value >= 0 && value <= 300;
    case "vo2_max":
      return value > 0 && value <= 100;
    case "body_fat_percentage":
      return value >= 0 && value <= 100;
    default:
      return true;
  }
}

export function addProfileMetricValueRangeIssue(
  data: { metric_type: string; value: number },
  ctx: z.RefinementCtx,
): void {
  if (isProfileMetricValueWithinBusinessRange(data.metric_type, data.value)) {
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Value out of valid range for metric type",
    path: ["value"],
  });
}

/**
 * Input schema for creating a new profile metric log.
 * Extends SupaZod insert schema with additional validation.
 */
/**
 * Schema for updating an existing profile metric log.
 * All fields optional except ID.
 */
export const updateProfileMetricInputSchema = z.object({
  id: z.string().uuid("Invalid metric ID"),
  value: z.number().optional(),
  unit: z.string().min(1, "Unit is required").optional(),
  notes: profileMetricNotesSchema,
  recorded_at: profileMetricRecordedAtSchema,
});

/**
 * Schema for querying profile metrics at a specific date.
 * Used for temporal metric lookups.
 */
/**
 * Schema for querying profile metrics in a date range.
 */
// Infer TypeScript types from schemas
export type ProfileMetricType = keyof typeof PROFILE_METRIC_UNITS;
export type ProfileMetricLog = {
  id: string;
  value: number;
  recorded_at: string;
  unit: string;
};
export type UpdateProfileMetricInput = z.infer<typeof updateProfileMetricInputSchema>;

/**
 * Standard units for each metric type.
 */
export const PROFILE_METRIC_UNITS = {
  weight_kg: "kg",
  resting_hr: "bpm",
  max_hr: "bpm",
  hrv_rmssd: "ms",
  vo2_max: "ml/kg/min",
  body_fat_percentage: "%",
  lthr: "bpm",
  sleep_hours: "hours",
  hydration_level: "scale",
  stress_score: "scale",
  soreness_level: "scale",
  wellness_score: "scale",
} as const;

/**
 * Valid value ranges for each metric type.
 */
export const PROFILE_METRIC_RANGES: Record<ProfileMetricType, { min: number; max: number }> = {
  weight_kg: { min: 20, max: 500 },
  resting_hr: { min: 30, max: 120 },
  max_hr: { min: 100, max: 250 },
  hrv_rmssd: { min: 0, max: 300 },
  vo2_max: { min: 10, max: 100 },
  body_fat_percentage: { min: 0, max: 100 },
  lthr: { min: 80, max: 220 },
  sleep_hours: { min: 0, max: 24 },
  hydration_level: { min: 0, max: 10 },
  stress_score: { min: 0, max: 10 },
  soreness_level: { min: 0, max: 10 },
  wellness_score: { min: 0, max: 10 },
};

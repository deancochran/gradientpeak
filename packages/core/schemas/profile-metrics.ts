/**
 * Profile Metrics Schemas
 *
 * Business-facing validation helpers for profile biometric metrics.
 * DB-backed enum and row ownership live in @repo/db.
 */

import { z } from "zod";
import {
  createProfileMetricInputSchema,
  formatProfileMetricValue,
  isProfileMetricValueWithinRange,
  profileMetricDefinitions,
  profileMetricNotesSchema,
  profileMetricRecordedAtSchema,
  profileMetricTypeSchema,
  updateProfileMetricInputSchema,
} from "../athlete-inputs/profile-metrics";

export {
  createProfileMetricInputSchema,
  formatProfileMetricValue,
  profileMetricDefinitions,
  profileMetricNotesSchema,
  profileMetricRecordedAtSchema,
  profileMetricTypeSchema,
  updateProfileMetricInputSchema,
};

export function isProfileMetricValueWithinBusinessRange(
  metricType: string,
  value: number,
): boolean {
  return isProfileMetricValueWithinRange(metricType, value);
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
  ...Object.fromEntries(
    Object.entries(profileMetricDefinitions).map(([type, definition]) => [type, definition.unit]),
  ),
} as Record<keyof typeof profileMetricDefinitions, string>;

/**
 * Valid value ranges for each metric type.
 */
export const PROFILE_METRIC_RANGES: Record<ProfileMetricType, { min: number; max: number }> = {
  ...Object.fromEntries(
    Object.entries(profileMetricDefinitions).map(([type, definition]) => [
      type,
      { min: definition.min, max: definition.max },
    ]),
  ),
} as Record<ProfileMetricType, { min: number; max: number }>;

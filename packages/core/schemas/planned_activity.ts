// packages/core/schemas/planned_activity.ts
import { z } from "zod";

/**
 * Planned Activity Create Schema
 * Used when scheduling a new activity
 *
 * Note: Intensity is NOT stored - it's calculated from IF after activity completion.
 * TSS estimation happens in the application layer, not stored in the database.
 */
export const plannedActivityCreateSchema = z.object({
  activity_plan_id: z.string().uuid("Invalid activity plan ID"),
  scheduled_date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "Invalid date format"),
  training_plan_id: z.string().uuid("Invalid training plan ID").optional(),
  notes: z.string().max(2000, "Notes are too long").nullable().optional(),
});

/**
 * Planned Activity Update Schema
 * Used when modifying an existing planned activity
 */
export const plannedActivityUpdateSchema = z.object({
  activity_plan_id: z.string().uuid("Invalid activity plan ID").optional(),
  scheduled_date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "Invalid date format")
    .optional(),
  notes: z.string().max(2000, "Notes are too long").nullable().optional(),
});

/**
 * Reschedule Schema
 * Used when moving a planned activity to a different date
 */
export const plannedActivityRescheduleSchema = z.object({
  id: z.string().uuid("Invalid planned activity ID"),
  new_date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "Invalid date format"),
  reason: z.string().max(500, "Reason is too long").optional(),
});

/**
 * TypeScript types exported for use throughout the application
 */
export type PlannedActivityCreate = z.infer<typeof plannedActivityCreateSchema>;
export type PlannedActivityUpdate = z.infer<typeof plannedActivityUpdateSchema>;
export type PlannedActivityReschedule = z.infer<
  typeof plannedActivityRescheduleSchema
>;

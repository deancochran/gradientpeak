import type { PublicActivityPlansInsert } from "@repo/supabase";
import { z } from "zod";
import type { ActivityPlanStructure } from "./activity_plan_structure";

export * from "./activity_payload";
export * from "./activity_plan_structure";

// tRPC-specific Activity Plans Schemas - use different names to avoid conflicts with supabase exports
export const activityPlanCreateSchema = z.object({
  activity_type: z.enum([
    "outdoor_run",
    "outdoor_bike",
    "indoor_treadmill",
    "indoor_bike_trainer",
    "indoor_strength",
    "indoor_swim",
  ]),
  name: z.string().min(1, "Plan name is required"),
  description: z.string(),
  estimated_duration: z.number().positive("Duration must be positive"),
  estimated_tss: z.number().nullable().optional(),
  structure: z.any(), // Will be validated by activityPlanStructureSchema
  version: z.string().default("1.0").optional(),
});

export const activityPlanUpdateSchema = activityPlanCreateSchema.partial();

// tRPC-specific Planned Activities Schemas - use different names to avoid conflicts
export const plannedActivityCreateSchema = z.object({
  activity_plan_id: z.string().uuid("Invalid activity plan ID"),
  scheduled_date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "Invalid date format"),
});

export const plannedActivityUpdateSchema =
  plannedActivityCreateSchema.partial();

// Legacy type for ActivityRecorder service
export type RecordingServiceActivityPlan = Omit<
  PublicActivityPlansInsert,
  "id" | "idx" | "profile_id" | "created_at"
> & {
  structure: ActivityPlanStructure;
};

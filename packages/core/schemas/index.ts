import type { PublicActivityPlansInsert } from "@repo/supabase";
import { z } from "zod";
import type { ActivityPlanStructureV2 } from "./activity_plan_v2";

export * from "./activity_payload";
export * from "./form-schemas";
export * from "./planned_activity";
export * from "./training_plan_structure";

// tRPC-specific Activity Plans Schemas - use different names to avoid conflicts with supabase exports
export const activityPlanCreateSchema = z.object({
  activity_type: z.enum([
    "outdoor_run",
    "outdoor_bike",
    "indoor_treadmill",
    "indoor_bike_trainer",
    "indoor_strength",
    "indoor_swim",
    "other",
  ]),
  name: z.string().min(1, "Plan name is required"),
  description: z.string().max(1000),
  estimated_duration: z.number().positive("Duration must be positive"),
  estimated_tss: z.number().nullable().optional(),
  structure: z.any(), // Will be validated by activityPlanStructureSchema
  version: z.string().default("1.0").optional(),
});

export const activityPlanUpdateSchema = activityPlanCreateSchema.partial();

// Note: plannedActivityCreateSchema and plannedActivityUpdateSchema are now exported from ./planned_activity

// Type for ActivityRecorder service (V2 only)
export type RecordingServiceActivityPlan = Omit<
  PublicActivityPlansInsert,
  "id" | "idx" | "profile_id" | "created_at"
> & {
  structure: ActivityPlanStructureV2;
};

// tRPC-specific Training Plans Schemas
export const trainingPlanCreateInputSchema = z.object({
  name: z
    .string()
    .min(1, "Plan name is required")
    .max(255, "Plan name is too long"),
  description: z
    .string()
    .max(1000, "Description is too long")
    .optional()
    .nullable(),
  structure: z.any(), // Will be validated by trainingPlanStructureSchema
});

export const trainingPlanUpdateInputSchema =
  trainingPlanCreateInputSchema.partial();

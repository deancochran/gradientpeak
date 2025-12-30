import type { PublicActivityPlansInsert } from "@repo/supabase";
import { z } from "zod";
import type { ActivityPlanStructureV2 } from "./activity_plan_v2";

// Export from activity_payload (includes ActivityType)
export * from "./activity_payload";

// ============================================================================
// ACTIVITY PLAN V2 SCHEMA (RECOMMENDED - Current Standard)
// ============================================================================
// V2 uses a flat structure where repetitions are expanded at creation time
// This is the preferred schema for all new code

export {
  activityPlanStructureSchemaV2,
  durationSchemaV2,
  formatIntensityTarget,
  formatStepTargets,
  getStepIntensityColor,
  intensityTargetSchemaV2,
  intervalSchemaV2,
  intervalStepSchemaV2,
  planStepSchemaV2,
  validateActivityPlanStructureV2,
} from "./activity_plan_v2";
export type {
  ActivityPlanStructureV2,
  DurationV2,
  IntensityTargetV2,
  IntervalStepV2,
  IntervalV2,
  PlanStepV2,
} from "./activity_plan_v2";

// Export V2 helpers explicitly with V2 suffix to avoid conflicts
export {
  calculateTotalDurationV2,
  Duration as DurationV2Helpers,
  formatDuration as formatDurationV2,
  getDurationSeconds as getDurationSecondsV2,
} from "./duration_helpers";
export {
  convertTargetToAbsolute as convertTargetToAbsoluteV2,
  formatTargetValue,
  getPrimaryTarget,
  getTargetByType,
  getTargetDisplayName,
  getTargetGuidance,
  getTargetRange,
  getTargetUnit as getTargetUnitV2,
  hasTargetType,
  isInTargetRange,
  Target as TargetV2Helpers,
} from "./target_helpers";

// Export plan builder V2
export {
  createEnduranceRidePlan,
  createPlan,
  createStrengthPlan,
  createTempoRunPlan,
  createThresholdPlan,
  createVO2MaxPlan,
  PlanBuilderV2,
} from "./plan_builder_v2";

// Export from form-schemas
export * from "./form-schemas";

// Export from planned_activity
export * from "./planned_activity";

// Export from training_plan_structure
export * from "./training_plan_structure";

// Export recording config
export * from "./recording_config";

// tRPC-specific Activity Plans Schemas - use different names to avoid conflicts with supabase exports
// Note: estimated_duration and estimated_tss are calculated server-side and NOT part of the input
export const activityPlanCreateSchema = z.object({
  activity_category: z.enum(["run", "bike", "swim", "strength", "other"]),
  activity_location: z.enum(["outdoor", "indoor"]),
  name: z.string().min(1, "Plan name is required"),
  description: z.string().max(1000),
  structure: z.any(), // Will be validated by activityPlanStructureSchema
  version: z.string().default("1.0").optional(),
  route_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const activityPlanUpdateSchema = activityPlanCreateSchema.partial();

// Note: plannedActivityCreateSchema and plannedActivityUpdateSchema are now exported from ./planned_activity

// Type for ActivityRecorder service (V2 only)
export type RecordingServiceActivityPlan = Omit<
  PublicActivityPlansInsert,
  "idx" | "profile_id" | "created_at"
> & {
  structure: ActivityPlanStructureV2;
  route_id?: string | null; // Optional route ID for outdoor activities
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

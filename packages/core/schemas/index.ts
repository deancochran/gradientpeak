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

export type {
  DurationV2,
  IntensityTargetV2,
  PlanStepV2,
  ActivityPlanStructureV2,
} from "./activity_plan_v2";
export {
  durationSchemaV2,
  intensityTargetSchemaV2,
  planStepSchemaV2,
  activityPlanStructureSchemaV2,
  getStepIntensityColor,
  formatIntensityTarget,
  formatStepTargets,
  groupStepsBySegment,
  validateActivityPlanStructureV2,
} from "./activity_plan_v2";

// Export V2 helpers explicitly with V2 suffix to avoid conflicts
export {
  formatDuration as formatDurationV2,
  getDurationSeconds as getDurationSecondsV2,
  calculateTotalDurationV2,
  Duration as DurationV2Helpers,
} from "./duration_helpers";
export {
  Target as TargetV2Helpers,
  getPrimaryTarget,
  hasTargetType,
  getTargetByType,
  isInTargetRange,
  getTargetRange,
  getTargetUnit as getTargetUnitV2,
  getTargetDisplayName,
  formatTargetValue,
  getTargetGuidance,
  convertTargetToAbsolute as convertTargetToAbsoluteV2,
} from "./target_helpers";

// Export plan builder V2
export {
  PlanBuilderV2,
  createPlan,
  createTempoRunPlan,
  createVO2MaxPlan,
  createStrengthPlan,
  createEnduranceRidePlan,
  createThresholdPlan,
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

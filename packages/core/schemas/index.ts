import { z } from "zod";
import {
  getStructuredPlanConflicts,
  getRouteStructuredPlanConflicts,
  type ActivityPlanStructureV2,
} from "./activity_plan_v2";
import { profileGoalLegacySchema, profileGoalTargetSchema } from "./goals/profile_goals";
import { canonicalSportSchema } from "./sport";
import {
  minimalTrainingPlanCreateSchema,
  trainingPlanCreateSchema,
} from "./training_plan_structure";

// Export from activity_payload (includes ActivityType)
export * from "./activity_payload";

// ============================================================================
// ACTIVITY PLAN V2 SCHEMA (RECOMMENDED - Current Standard)
// ============================================================================
// V2 uses a flat structure where repetitions are expanded at creation time
// This is the preferred schema for all new code

export type {
  ActivityPlanStructureV2,
  DurationV2,
  IntensityTargetV2,
  IntervalStepV2,
  IntervalV2,
  PlanStepV2,
} from "./activity_plan_v2";
export {
  activityPlanStructureSchemaV2,
  durationSchemaV2,
  formatIntensityTarget,
  formatStepTargets,
  getRouteStructuredPlanConflicts,
  getStepIntensityColor,
  intensityTargetSchemaV2,
  intervalSchemaV2,
  intervalStepSchemaV2,
  planStepSchemaV2,
  validateActivityPlanStructureV2,
} from "./activity_plan_v2";

// Export V2 helpers explicitly with V2 suffix to avoid conflicts
export {
  calculateTotalDurationV2,
  Duration as DurationV2Helpers,
  formatDuration as formatDurationV2,
  getDurationSeconds as getDurationSecondsV2,
} from "./duration_helpers";
// Export from form-schemas
export * from "./form-schemas";
// Export profile goals/settings (Phase 1 additive domain schemas)
export * from "./goals/profile_goals";
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

// Export from planned_activity
export * from "./planned_activity";
export * from "./planning";
// Export recording config
export * from "./recording_config";
// Export recording UI types
export * from "./recording_ui_types";
// Export recording session contracts
export * from "./recording-session";
export * from "./settings/profile_settings";
export * from "./sport";
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
// Export from training_plan_structure
export * from "./training_plan_structure";

// Export performance metrics schemas
// export * from "./performance-metrics";

// Export activity efforts schemas
export * from "./activity_efforts";
// Export coaching schemas
export * from "./coaching";
// Export messaging schemas
export * from "./messaging";
// Export notification schemas
export * from "./notifications";
// Export onboarding schemas
export * from "./onboarding";
// Export profile metrics schemas
export * from "./profile-metrics";

// Export template schemas
export * from "./template_library";

function addRouteStructuredPlanIssues(
  plan: { route_id?: string | null; structure?: unknown },
  ctx: z.RefinementCtx,
): void {
  if (plan.structure != null) {
    for (const conflict of getStructuredPlanConflicts(plan.structure)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["structure", ...conflict.path],
        message: conflict.message,
      });
    }
  }

  if (!plan.route_id || plan.structure == null) {
    return;
  }

  for (const conflict of getRouteStructuredPlanConflicts(plan.structure)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["structure", ...conflict.path],
      message: conflict.message,
    });
  }
}

// tRPC-specific Activity Plans Schemas - use different names to avoid conflicts with supabase exports
// Note: estimated_duration and estimated_tss are calculated server-side and NOT part of the input
const activityPlanBaseSchema = z
  .object({
    activity_category: z.enum(["run", "bike", "swim", "strength", "other"]),
    name: z.string().min(1, "Plan name is required"),
    description: z.string().max(1000).nullable().optional(),
    structure: z.any(), // Will be validated by activityPlanStructureSchema
    version: z.string().default("1.0").optional(),
    route_id: z.string().uuid().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const activityPlanCreateSchema = activityPlanBaseSchema.superRefine(addRouteStructuredPlanIssues);

export const activityPlanUpdateSchema = activityPlanBaseSchema
  .partial()
  .superRefine(addRouteStructuredPlanIssues);

// Note: plannedActivityCreateSchema and plannedActivityUpdateSchema are now exported from ./planned_activity

// Type for ActivityRecorder service (V2 only)
export interface RecordingServiceActivityPlan {
  activity_category: z.infer<typeof canonicalSportSchema>;
  description: string;
  gps_recording_enabled?: boolean;
  id?: string;
  import_external_id?: string | null;
  import_provider?: string | null;
  is_system_template?: boolean;
  name: string;
  notes?: string | null;
  route_id?: string | null;
  structure: ActivityPlanStructureV2;
  version?: string;
}

// tRPC-specific Training Plans Schemas
export const trainingPlanCreateInputSchema = z.object({
  name: z.string().min(1, "Plan name is required").max(255, "Plan name is too long"),
  description: z.string().max(1000, "Description is too long").optional().nullable(),
  structure: trainingPlanCreateSchema, // Validates structure without ID requirement
  is_active: z.boolean().optional(),
});

export const trainingPlanUpdateInputSchema = trainingPlanCreateInputSchema.partial();

export const trainingPlanGoalTargetInputSchema = profileGoalTargetSchema;

export const trainingPlanGoalInputSchema = profileGoalLegacySchema.omit({
  id: true,
});

export const trainingPlanMinimalCreateInputSchema = z.object({
  structure: minimalTrainingPlanCreateSchema,
});

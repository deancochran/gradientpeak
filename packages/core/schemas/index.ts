import { z } from "zod";
import { activityPlanInputSchema } from "./activity_payload";
import { contentVisibilitySchema } from "./content_visibility";
import { profileGoalLegacySchema, profileGoalTargetSchema } from "./goals/profile_goals";
import {
  minimalTrainingPlanCreateSchema,
  trainingPlanCreateSchema,
} from "./training_plan_structure";

export * from "../activity-plan";
export * from "../targets";
// Export from activity_payload (includes ActivityType)
export * from "./activity_payload";
export * from "./activity_streams";
export * from "./activity_target_capabilities";
export * from "./content_visibility";
// Export from form-schemas
export * from "./form-schemas";
// Export profile goals/settings (Phase 1 additive domain schemas)
export * from "./goals/profile_goals";

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
  activityPlanSpeedKphToMetersPerSecond,
  activityPlanSpeedMetersPerSecondToKph,
  convertTargetToAbsolute,
  formatIntensityTarget,
  formatStepTargets,
  formatTargetValue,
  getPrimaryTarget,
  getStepIntensityColor,
  getTargetByType,
  getTargetDisplayName,
  getTargetGuidance,
  getTargetRange,
  getTargetUnit,
  hasTargetType,
  isInTargetRange,
  Target,
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

// tRPC-specific Activity Plans Schemas - use different names to avoid conflicts with supabase exports
// Note: estimated_duration and estimated_tss are calculated server-side and NOT part of the input
export const activityPlanCreateSchema = activityPlanInputSchema;
export const activityPlanUpdateSchema = activityPlanInputSchema.partial().strict();

// Note: plannedActivityCreateSchema and plannedActivityUpdateSchema are now exported from ./planned_activity

// tRPC-specific Training Plans Schemas
export const trainingPlanCreateInputSchema = z.object({
  name: z.string().min(1, "Plan name is required").max(255, "Plan name is too long"),
  description: z.string().max(1000, "Description is too long").optional().nullable(),
  structure: trainingPlanCreateSchema, // Validates structure without ID requirement
  template_visibility: contentVisibilitySchema.optional(),
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

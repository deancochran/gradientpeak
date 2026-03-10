import { z } from "zod";
import {
  creationBehaviorControlsV1Schema,
  trainingPlanCreationConfigSchema,
  trainingPlanCalibrationInputSchema,
} from "../training_plan_structure";

/**
 * Global athlete training settings stored at the profile scope.
 *
 * This is a compatibility-safe repurposing of the legacy
 * TrainingPlanCreationConfig shape.
 */
export const athleteTrainingSettingsSchema = trainingPlanCreationConfigSchema;

export const athleteTrainingSettingsPatchSchema = z
  .object({
    recent_influence: athleteTrainingSettingsSchema.shape.recent_influence
      .partial()
      .optional(),
    recent_influence_action:
      athleteTrainingSettingsSchema.shape.recent_influence_action.optional(),
    constraints: athleteTrainingSettingsSchema.shape.constraints.optional(),
    optimization_profile:
      athleteTrainingSettingsSchema.shape.optimization_profile.optional(),
    post_goal_recovery_days:
      athleteTrainingSettingsSchema.shape.post_goal_recovery_days.optional(),
    behavior_controls_v1: creationBehaviorControlsV1Schema.partial().optional(),
    calibration: trainingPlanCalibrationInputSchema.optional(),
  })
  .strict();

export const profileTrainingSettingsRecordSchema = z.object({
  profile_id: z.string().uuid(),
  settings: athleteTrainingSettingsSchema,
  updated_at: z.string().optional(),
});

export type AthleteTrainingSettings = z.infer<
  typeof athleteTrainingSettingsSchema
>;
export type AthleteTrainingSettingsPatch = z.infer<
  typeof athleteTrainingSettingsPatchSchema
>;
export type ProfileTrainingSettingsRecord = z.infer<
  typeof profileTrainingSettingsRecordSchema
>;

import { z } from "zod";
import {
  creationAvailabilityConfigSchema,
  creationBehaviorControlsV1Schema,
  creationConfigLocksSchema,
  creationConstraintsSchema,
  creationOptimizationProfileEnum,
  creationProvenanceSchema,
  creationRecentInfluenceActionEnum,
  creationRecentInfluenceSchema,
  trainingPlanCalibrationInputSchema,
  trainingPlanCalibrationConfigSchema,
  minimalTrainingPlanCreateSchema,
} from "../../schemas/training_plan_structure";

const creationConfigCoreFields = {
  availability_config: creationAvailabilityConfigSchema,
  recent_influence: creationRecentInfluenceSchema,
  recent_influence_action: creationRecentInfluenceActionEnum,
  constraints: creationConstraintsSchema,
  optimization_profile: creationOptimizationProfileEnum,
  post_goal_recovery_days: z.number().int().min(0).max(28),
  behavior_controls_v1: creationBehaviorControlsV1Schema,
};

export const creationConfigValueSchema = z
  .object({
    ...creationConfigCoreFields,
    calibration: trainingPlanCalibrationConfigSchema,
  })
  .strict();

const creationConfigInputValueSchema = z
  .object({
    ...creationConfigCoreFields,
    calibration: trainingPlanCalibrationInputSchema,
  })
  .strict();

const creationNormalizationUserValuesSchema = creationConfigInputValueSchema
  .extend({
    locks: creationConfigLocksSchema,
  })
  .partial();

export const creationNormalizationInputSchema = z
  .object({
    user_values: creationNormalizationUserValuesSchema.optional(),
    confirmed_suggestions: creationConfigInputValueSchema.partial().optional(),
    defaults: creationConfigInputValueSchema.partial().optional(),
    provenance_overrides: z
      .object({
        availability_provenance: creationProvenanceSchema.partial().optional(),
        recent_influence_provenance: creationProvenanceSchema
          .partial()
          .optional(),
      })
      .optional(),
    now_iso: z.string().datetime().optional(),
  })
  .strict();

export const postCreateBehaviorSchema = z.object({
  autonomous_mutation_enabled: z.boolean().default(false),
});

export const overridePolicySchema = z
  .object({
    allow_blocking_conflicts: z.boolean().default(false),
    scope: z.literal("objective_risk_budget").default("objective_risk_budget"),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const getCreationSuggestionsInputSchema = z
  .object({
    as_of: z.string().datetime().optional(),
    locks: creationConfigLocksSchema.partial().optional(),
    existing_values: z
      .object({
        availability_config:
          creationConfigCoreFields.availability_config.optional(),
        recent_influence: creationConfigCoreFields.recent_influence.optional(),
        optimization_profile:
          creationConfigCoreFields.optimization_profile.optional(),
        post_goal_recovery_days:
          creationConfigCoreFields.post_goal_recovery_days.optional(),
        behavior_controls_v1:
          creationConfigCoreFields.behavior_controls_v1.optional(),
        calibration: trainingPlanCalibrationInputSchema.optional(),
        constraints: creationConstraintsSchema.partial().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .optional();

export const previewCreationConfigInputSchema = z
  .object({
    minimal_plan: minimalTrainingPlanCreateSchema,
    creation_input: creationNormalizationInputSchema,
    starting_ctl_override: z.number().min(0).max(250).optional(),
    starting_atl_override: z.number().min(0).max(200).optional(),
    preview_baseline: z
      .object({
        readiness_score: z.number().min(0).max(100).finite(),
        predicted_load_tss: z.number().min(0).max(10000).finite(),
        predicted_fatigue_atl: z.number().min(0).max(2000).finite(),
        feasibility_state: z.enum(["feasible", "aggressive", "unsafe"]),
        tss_ramp_clamp_weeks: z.number().int().min(0).max(104),
        ctl_ramp_clamp_weeks: z.number().int().min(0).max(104),
      })
      .strict()
      .optional(),
    post_create_behavior: postCreateBehaviorSchema.optional(),
    override_policy: overridePolicySchema.optional(),
  })
  .strict();

export const createFromCreationConfigInputSchema =
  previewCreationConfigInputSchema.extend({
    is_active: z.boolean().optional().default(true),
    preview_snapshot_token: z.string().min(1).optional(),
  });

const projectionChartDiagnosticsCompatSchema = z
  .object({
    inferred_current_state: z.unknown().optional(),
    prediction_uncertainty: z.record(z.string(), z.unknown()).optional(),
    goal_target_distributions: z
      .array(z.record(z.string(), z.unknown()))
      .optional(),
    optimization_tradeoff_summary: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const previewCreationConfigResponseCompatSchema = z
  .object({
    projection_chart: projectionChartDiagnosticsCompatSchema,
  })
  .passthrough();

export const createFromCreationConfigResponseCompatSchema = z
  .object({
    creation_summary: z
      .object({
        projection_chart: projectionChartDiagnosticsCompatSchema,
      })
      .passthrough(),
  })
  .passthrough();

export type CreationConfigValue = z.infer<typeof creationConfigValueSchema>;
export type CreationNormalizationInput = z.infer<
  typeof creationNormalizationInputSchema
>;
export type PostCreateBehavior = z.infer<typeof postCreateBehaviorSchema>;
export type OverridePolicy = z.infer<typeof overridePolicySchema>;
export type GetCreationSuggestionsInput = z.infer<
  typeof getCreationSuggestionsInputSchema
>;
export type PreviewCreationConfigInput = z.infer<
  typeof previewCreationConfigInputSchema
>;
export type CreateFromCreationConfigInput = z.infer<
  typeof createFromCreationConfigInputSchema
>;
export type PreviewCreationConfigResponseCompat = z.infer<
  typeof previewCreationConfigResponseCompatSchema
>;
export type CreateFromCreationConfigResponseCompat = z.infer<
  typeof createFromCreationConfigResponseCompatSchema
>;

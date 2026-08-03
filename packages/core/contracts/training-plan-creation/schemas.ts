import { z } from "zod";
import {
  creationAvailabilityConfigSchema,
  creationBehaviorControlsSchema,
  creationCalibrationCompositeLocksSchema,
  creationConfigLocksSchema,
  creationConstraintsSchema,
  creationOptimizationProfileEnum,
  creationProvenanceSchema,
  creationRecentInfluenceActionEnum,
  creationRecentInfluenceSchema,
  minimalTrainingPlanCreateSchema,
  trainingPlanCalibrationConfigSchema,
  trainingPlanCalibrationInputSchema,
} from "../../schemas/training-plan-structure";

const creationConfigCoreFields = {
  availability_config: creationAvailabilityConfigSchema,
  recent_influence: creationRecentInfluenceSchema,
  recent_influence_action: creationRecentInfluenceActionEnum,
  constraints: creationConstraintsSchema,
  optimization_profile: creationOptimizationProfileEnum,
  post_goal_recovery_days: z.number().int().min(0).max(28),
  behavior_controls: creationBehaviorControlsSchema,
  calibration_composite_locks: creationCalibrationCompositeLocksSchema.default({
    target_attainment_weight: false,
    envelope_weight: false,
    durability_weight: false,
    evidence_weight: false,
  }),
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
        recent_influence_provenance: creationProvenanceSchema.partial().optional(),
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

export const previewCreationConfigInputSchema = z
  .object({
    minimal_plan: minimalTrainingPlanCreateSchema,
    creation_input: creationNormalizationInputSchema,
    starting_longTermLoad_override: z.number().min(0).max(250).optional(),
    starting_recentLoad_override: z.number().min(0).max(200).optional(),
    preview_baseline: z
      .object({
        readiness_score: z.number().min(0).max(100).finite(),
        predicted_load: z.number().min(0).max(10000).finite(),
        predicted_fatigue_recentLoad: z.number().min(0).max(2000).finite(),
        feasibility_state: z.enum(["feasible", "aggressive", "unsafe"]),
        load_ramp_clamp_weeks: z.number().int().min(0).max(104),
        longTermLoad_ramp_clamp_weeks: z.number().int().min(0).max(104),
      })
      .strict()
      .optional(),
    post_create_behavior: postCreateBehaviorSchema.optional(),
    override_policy: overridePolicySchema.optional(),
  })
  .strict();

export type CreationConfigValue = z.infer<typeof creationConfigValueSchema>;
export type CreationNormalizationInput = z.infer<typeof creationNormalizationInputSchema>;
export type PostCreateBehavior = z.infer<typeof postCreateBehaviorSchema>;
export type OverridePolicy = z.infer<typeof overridePolicySchema>;
export type PreviewCreationConfigInput = z.infer<typeof previewCreationConfigInputSchema>;

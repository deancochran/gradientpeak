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

export type CreationConfigValue = z.infer<typeof creationConfigValueSchema>;
export type CreationNormalizationInput = z.infer<typeof creationNormalizationInputSchema>;
export type PostCreateBehavior = z.infer<typeof postCreateBehaviorSchema>;

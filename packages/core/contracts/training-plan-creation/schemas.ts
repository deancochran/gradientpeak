import { z } from "zod";
import {
  creationAvailabilityConfigSchema,
  creationConfigLocksSchema,
  creationConstraintsSchema,
  creationOptimizationProfileEnum,
  creationProvenanceSchema,
  creationRecentInfluenceActionEnum,
  creationRecentInfluenceSchema,
  minimalTrainingPlanCreateSchema,
} from "../../schemas/training_plan_structure";

export const creationConfigValueSchema = z.object({
  availability_config: creationAvailabilityConfigSchema,
  recent_influence: creationRecentInfluenceSchema,
  recent_influence_action: creationRecentInfluenceActionEnum,
  constraints: creationConstraintsSchema,
  optimization_profile: creationOptimizationProfileEnum,
  post_goal_recovery_days: z.number().int().min(0).max(28),
  max_weekly_tss_ramp_pct: z.number().min(0).max(20),
  max_ctl_ramp_per_week: z.number().min(0).max(8),
});

export const creationNormalizationInputSchema = z.object({
  user_values: creationConfigValueSchema
    .extend({
      locks: creationConfigLocksSchema,
    })
    .partial()
    .optional(),
  confirmed_suggestions: creationConfigValueSchema.partial().optional(),
  defaults: creationConfigValueSchema.partial().optional(),
  provenance_overrides: z
    .object({
      availability_provenance: creationProvenanceSchema.partial().optional(),
      recent_influence_provenance: creationProvenanceSchema
        .partial()
        .optional(),
    })
    .optional(),
  now_iso: z.string().datetime().optional(),
});

export const postCreateBehaviorSchema = z.object({
  autonomous_mutation_enabled: z.boolean().default(false),
});

export const getCreationSuggestionsInputSchema = z
  .object({
    as_of: z.string().datetime().optional(),
    locks: creationConfigLocksSchema.partial().optional(),
    existing_values: z
      .object({
        availability_config: creationAvailabilityConfigSchema.optional(),
        recent_influence_score: z.number().min(-1).max(1).optional(),
        optimization_profile: creationOptimizationProfileEnum.optional(),
        post_goal_recovery_days: z.number().int().min(0).max(28).optional(),
        max_weekly_tss_ramp_pct: z.number().min(0).max(20).optional(),
        max_ctl_ramp_per_week: z.number().min(0).max(8).optional(),
        constraints: creationConstraintsSchema.partial().optional(),
      })
      .optional(),
  })
  .optional();

export const previewCreationConfigInputSchema = z.object({
  minimal_plan: minimalTrainingPlanCreateSchema,
  creation_input: creationNormalizationInputSchema,
  starting_ctl_override: z.number().min(0).max(150).optional(),
  post_create_behavior: postCreateBehaviorSchema.optional(),
});

export const createFromCreationConfigInputSchema =
  previewCreationConfigInputSchema.extend({
    is_active: z.boolean().optional().default(true),
    preview_snapshot_token: z.string().min(1).optional(),
  });

export type CreationConfigValue = z.infer<typeof creationConfigValueSchema>;
export type CreationNormalizationInput = z.infer<
  typeof creationNormalizationInputSchema
>;
export type PostCreateBehavior = z.infer<typeof postCreateBehaviorSchema>;
export type GetCreationSuggestionsInput = z.infer<
  typeof getCreationSuggestionsInputSchema
>;
export type PreviewCreationConfigInput = z.infer<
  typeof previewCreationConfigInputSchema
>;
export type CreateFromCreationConfigInput = z.infer<
  typeof createFromCreationConfigInputSchema
>;

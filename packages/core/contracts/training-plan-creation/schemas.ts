import { z } from "zod";
import {
  creationAvailabilityConfigSchema,
  creationConfigLocksSchema,
  creationConstraintsSchema,
  CREATION_MAX_CTL_RAMP_PER_WEEK,
  CREATION_MAX_WEEKLY_TSS_RAMP_PCT,
  creationOptimizationProfileEnum,
  creationProvenanceSchema,
  creationRecentInfluenceActionEnum,
  projectionControlV2Schema,
  creationRecentInfluenceSchema,
  trainingPlanCalibrationConfigSchema,
  minimalTrainingPlanCreateSchema,
} from "../../schemas/training_plan_structure";

const calibrationInputSchema = z
  .object({
    version: z.literal(1).optional(),
    readiness_composite: z
      .object({
        target_attainment_weight: z.number().min(0).max(1).finite().optional(),
        envelope_weight: z.number().min(0).max(1).finite().optional(),
        durability_weight: z.number().min(0).max(1).finite().optional(),
        evidence_weight: z.number().min(0).max(1).finite().optional(),
      })
      .strict()
      .optional(),
    readiness_timeline: z
      .object({
        target_tsb: z.number().min(-5).max(20).finite().optional(),
        form_tolerance: z.number().min(8).max(40).finite().optional(),
        fatigue_overflow_scale: z.number().min(0.1).max(1).finite().optional(),
        feasibility_blend_weight: z.number().min(0).max(1).finite().optional(),
        smoothing_iterations: z.number().int().min(0).max(80).optional(),
        smoothing_lambda: z.number().min(0).max(0.9).finite().optional(),
        max_step_delta: z.number().int().min(1).max(20).optional(),
      })
      .strict()
      .optional(),
    envelope_penalties: z
      .object({
        over_high_weight: z.number().min(0).max(1.5).finite().optional(),
        under_low_weight: z.number().min(0).max(1.5).finite().optional(),
        over_ramp_weight: z.number().min(0).max(1.5).finite().optional(),
      })
      .strict()
      .optional(),
    durability_penalties: z
      .object({
        monotony_threshold: z.number().min(1).max(4).finite().optional(),
        monotony_scale: z.number().min(0.1).max(6).finite().optional(),
        strain_threshold: z.number().min(400).max(2000).finite().optional(),
        strain_scale: z.number().min(200).max(3000).finite().optional(),
        deload_debt_scale: z.number().min(0.5).max(12).finite().optional(),
      })
      .strict()
      .optional(),
    no_history: z
      .object({
        reliability_horizon_days: z.number().int().min(14).max(120).optional(),
        confidence_floor_high: z
          .number()
          .min(0.1)
          .max(0.95)
          .finite()
          .optional(),
        confidence_floor_mid: z.number().min(0.1).max(0.95).finite().optional(),
        confidence_floor_low: z.number().min(0.1).max(0.95).finite().optional(),
        demand_tier_time_pressure_scale: z
          .number()
          .min(0)
          .max(2)
          .finite()
          .optional(),
      })
      .strict()
      .optional(),
    optimizer: z
      .object({
        preparedness_weight: z.number().min(0).max(30).finite().optional(),
        risk_penalty_weight: z.number().min(0).max(2).finite().optional(),
        volatility_penalty_weight: z.number().min(0).max(2).finite().optional(),
        churn_penalty_weight: z.number().min(0).max(2).finite().optional(),
        lookahead_weeks: z.number().int().min(1).max(8).optional(),
        candidate_steps: z.number().int().min(3).max(15).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const creationConfigValueSchema = z
  .object({
    availability_config: creationAvailabilityConfigSchema,
    recent_influence: creationRecentInfluenceSchema,
    recent_influence_action: creationRecentInfluenceActionEnum,
    constraints: creationConstraintsSchema,
    optimization_profile: creationOptimizationProfileEnum,
    post_goal_recovery_days: z.number().int().min(0).max(28),
    max_weekly_tss_ramp_pct: z
      .number()
      .min(0)
      .max(CREATION_MAX_WEEKLY_TSS_RAMP_PCT),
    max_ctl_ramp_per_week: z
      .number()
      .min(0)
      .max(CREATION_MAX_CTL_RAMP_PER_WEEK),
    projection_control_v2: projectionControlV2Schema,
    calibration: trainingPlanCalibrationConfigSchema,
  })
  .strict();

const creationConfigInputValueSchema = z
  .object({
    availability_config: creationAvailabilityConfigSchema,
    recent_influence: creationRecentInfluenceSchema,
    recent_influence_action: creationRecentInfluenceActionEnum,
    constraints: creationConstraintsSchema,
    optimization_profile: creationOptimizationProfileEnum,
    post_goal_recovery_days: z.number().int().min(0).max(28),
    max_weekly_tss_ramp_pct: z
      .number()
      .min(0)
      .max(CREATION_MAX_WEEKLY_TSS_RAMP_PCT),
    max_ctl_ramp_per_week: z
      .number()
      .min(0)
      .max(CREATION_MAX_CTL_RAMP_PER_WEEK),
    projection_control_v2: projectionControlV2Schema,
    calibration: calibrationInputSchema,
  })
  .strict();

export const creationNormalizationInputSchema = z
  .object({
    user_values: creationConfigValueSchema
      .extend({
        calibration: calibrationInputSchema,
      })
      .extend({
        locks: creationConfigLocksSchema,
      })
      .partial()
      .optional(),
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
        availability_config: creationAvailabilityConfigSchema.optional(),
        recent_influence: creationRecentInfluenceSchema.optional(),
        optimization_profile: creationOptimizationProfileEnum.optional(),
        post_goal_recovery_days: z.number().int().min(0).max(28).optional(),
        max_weekly_tss_ramp_pct: z
          .number()
          .min(0)
          .max(CREATION_MAX_WEEKLY_TSS_RAMP_PCT)
          .optional(),
        max_ctl_ramp_per_week: z
          .number()
          .min(0)
          .max(CREATION_MAX_CTL_RAMP_PER_WEEK)
          .optional(),
        projection_control_v2: projectionControlV2Schema.optional(),
        calibration: calibrationInputSchema.optional(),
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

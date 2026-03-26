import { z } from "zod";
import {
  creationContextSummarySchema,
  creationFeasibilitySafetySummarySchema,
} from "./diagnostics-context-schemas";

export const creationWeekDayEnum = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export type CreationWeekDay = z.infer<typeof creationWeekDayEnum>;

export const creationAvailabilityTemplateEnum = z.enum(["low", "moderate", "high", "custom"]);

export type CreationAvailabilityTemplate = z.infer<typeof creationAvailabilityTemplateEnum>;

export const creationAvailabilityWindowSchema = z
  .object({
    start_minute_of_day: z.number().int().min(0).max(1439),
    end_minute_of_day: z.number().int().min(1).max(1440),
  })
  .refine((data) => data.end_minute_of_day > data.start_minute_of_day, {
    message: "Availability window end must be after start",
    path: ["end_minute_of_day"],
  });

export type CreationAvailabilityWindow = z.infer<typeof creationAvailabilityWindowSchema>;

export const creationAvailabilityDaySchema = z.object({
  day: creationWeekDayEnum,
  windows: z.array(creationAvailabilityWindowSchema).max(4).default([]),
  max_sessions: z.number().int().min(0).max(3).optional(),
});

export type CreationAvailabilityDay = z.infer<typeof creationAvailabilityDaySchema>;

export const creationAvailabilityConfigSchema = z
  .object({
    template: creationAvailabilityTemplateEnum.default("moderate"),
    days: z.array(creationAvailabilityDaySchema).length(7),
    template_applied_at: z.string().datetime().optional(),
  })
  .superRefine((data, ctx) => {
    const seenDays = new Set<CreationWeekDay>();

    for (const [index, dayConfig] of data.days.entries()) {
      if (seenDays.has(dayConfig.day)) {
        ctx.addIssue({
          code: "custom",
          path: ["days", index, "day"],
          message: "Each weekday can only appear once in availability",
        });
      }
      seenDays.add(dayConfig.day);

      const sortedWindows = [...dayConfig.windows].sort(
        (a, b) => a.start_minute_of_day - b.start_minute_of_day,
      );

      for (let i = 1; i < sortedWindows.length; i++) {
        const previousWindow = sortedWindows[i - 1];
        const currentWindow = sortedWindows[i];
        if (
          previousWindow &&
          currentWindow &&
          currentWindow.start_minute_of_day < previousWindow.end_minute_of_day
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["days", index, "windows", i],
            message: "Availability windows cannot overlap",
          });
        }
      }
    }

    if (seenDays.size !== 7) {
      ctx.addIssue({
        code: "custom",
        path: ["days"],
        message: "Availability config must include exactly one entry per weekday",
      });
    }
  });

export type CreationAvailabilityConfig = z.infer<typeof creationAvailabilityConfigSchema>;

export const creationRecentInfluenceSchema = z.object({
  influence_score: z.number().min(-1).max(1),
});

export type CreationRecentInfluence = z.infer<typeof creationRecentInfluenceSchema>;

export const creationRecentInfluenceActionEnum = z.enum(["accepted", "edited", "disabled"]);

export type CreationRecentInfluenceAction = z.infer<typeof creationRecentInfluenceActionEnum>;

export const creationGoalDifficultyPreferenceEnum = z.enum(["conservative", "balanced", "stretch"]);

export type CreationGoalDifficultyPreference = z.infer<typeof creationGoalDifficultyPreferenceEnum>;

export const creationOptimizationProfileEnum = z.enum(["outcome_first", "balanced", "sustainable"]);

export type CreationOptimizationProfile = z.infer<typeof creationOptimizationProfileEnum>;

export const creationBehaviorControlsV1Schema = z
  .object({
    aggressiveness: z.number().min(0).max(1),
    variability: z.number().min(0).max(1),
    spike_frequency: z.number().min(0).max(1),
    shape_target: z.number().min(-1).max(1),
    shape_strength: z.number().min(0).max(1),
    recovery_priority: z.number().min(0).max(1),
    starting_fitness_confidence: z.number().min(0).max(1),
  })
  .strict();

export type CreationBehaviorControlsV1 = z.infer<typeof creationBehaviorControlsV1Schema>;

export const CREATION_MAX_WEEKLY_TSS_RAMP_PCT = 40;
export const CREATION_MAX_CTL_RAMP_PER_WEEK = 12;

const calibrationBoundedNumber = (min: number, max: number) =>
  z.number().min(min).max(max).finite();

const calibrationWeightSchema = calibrationBoundedNumber(0, 1);

export const readinessCompositeCalibrationSchema = z
  .object({
    target_attainment_weight: calibrationWeightSchema.default(0.45),
    envelope_weight: calibrationWeightSchema.default(0.3),
    durability_weight: calibrationWeightSchema.default(0.15),
    evidence_weight: calibrationWeightSchema.default(0.1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const sum =
      value.target_attainment_weight +
      value.envelope_weight +
      value.durability_weight +
      value.evidence_weight;
    if (Math.abs(sum - 1) > 1e-6) {
      ctx.addIssue({
        code: "custom",
        path: ["target_attainment_weight"],
        message: "Readiness composite weights must sum to 1",
      });
    }
  });

export type ReadinessCompositeCalibration = z.infer<typeof readinessCompositeCalibrationSchema>;

export const readinessTimelineCalibrationSchema = z
  .object({
    target_tsb: calibrationBoundedNumber(-5, 20).default(8),
    form_tolerance: calibrationBoundedNumber(8, 40).default(20),
    fatigue_overflow_scale: calibrationBoundedNumber(0.1, 1).default(0.4),
    feasibility_blend_weight: calibrationBoundedNumber(0, 1).default(0),
    smoothing_iterations: z.number().int().min(0).max(80).default(24),
    smoothing_lambda: calibrationBoundedNumber(0, 0.9).default(0.28),
    max_step_delta: z.number().int().min(1).max(20).default(9),
  })
  .strict();

export type ReadinessTimelineCalibration = z.infer<typeof readinessTimelineCalibrationSchema>;

export const envelopePenaltyCalibrationSchema = z
  .object({
    over_high_weight: calibrationBoundedNumber(0, 1.5).default(0.55),
    under_low_weight: calibrationBoundedNumber(0, 1.5).default(0.2),
    over_ramp_weight: calibrationBoundedNumber(0, 1.5).default(0.25),
  })
  .strict();

export type EnvelopePenaltyCalibration = z.infer<typeof envelopePenaltyCalibrationSchema>;

export const durabilityPenaltyCalibrationSchema = z
  .object({
    monotony_threshold: calibrationBoundedNumber(1, 4).default(2),
    monotony_scale: calibrationBoundedNumber(0.1, 6).default(2),
    strain_threshold: calibrationBoundedNumber(400, 2000).default(900),
    strain_scale: calibrationBoundedNumber(200, 3000).default(900),
    deload_debt_scale: calibrationBoundedNumber(0.5, 12).default(6),
  })
  .strict();

export type DurabilityPenaltyCalibration = z.infer<typeof durabilityPenaltyCalibrationSchema>;

export const noHistoryCalibrationSchema = z
  .object({
    reliability_horizon_days: z.number().int().min(14).max(120).default(42),
    confidence_floor_high: calibrationBoundedNumber(0.1, 0.95).default(0.75),
    confidence_floor_mid: calibrationBoundedNumber(0.1, 0.95).default(0.6),
    confidence_floor_low: calibrationBoundedNumber(0.1, 0.95).default(0.45),
    demand_tier_time_pressure_scale: calibrationBoundedNumber(0, 2).default(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      !(
        value.confidence_floor_high >= value.confidence_floor_mid &&
        value.confidence_floor_mid >= value.confidence_floor_low
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["confidence_floor_high"],
        message: "No-history confidence floors must satisfy high >= mid >= low",
      });
    }
  });

export type NoHistoryCalibration = z.infer<typeof noHistoryCalibrationSchema>;

export const optimizerCalibrationSchema = z
  .object({
    preparedness_weight: calibrationBoundedNumber(0, 30).default(14),
    risk_penalty_weight: calibrationBoundedNumber(0, 2).default(0.35),
    volatility_penalty_weight: calibrationBoundedNumber(0, 2).default(0.22),
    churn_penalty_weight: calibrationBoundedNumber(0, 2).default(0.2),
    lookahead_weeks: z.number().int().min(1).max(8).default(5),
    candidate_steps: z.number().int().min(3).max(15).default(7),
  })
  .strict();

export type OptimizerCalibration = z.infer<typeof optimizerCalibrationSchema>;

export const trainingPlanCalibrationConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    readiness_composite: readinessCompositeCalibrationSchema.default({
      target_attainment_weight: 0.45,
      envelope_weight: 0.3,
      durability_weight: 0.15,
      evidence_weight: 0.1,
    }),
    readiness_timeline: readinessTimelineCalibrationSchema.default({
      target_tsb: 8,
      form_tolerance: 20,
      fatigue_overflow_scale: 0.4,
      feasibility_blend_weight: 0,
      smoothing_iterations: 24,
      smoothing_lambda: 0.28,
      max_step_delta: 9,
    }),
    envelope_penalties: envelopePenaltyCalibrationSchema.default({
      over_high_weight: 0.55,
      under_low_weight: 0.2,
      over_ramp_weight: 0.25,
    }),
    durability_penalties: durabilityPenaltyCalibrationSchema.default({
      monotony_threshold: 2,
      monotony_scale: 2,
      strain_threshold: 900,
      strain_scale: 900,
      deload_debt_scale: 6,
    }),
    no_history: noHistoryCalibrationSchema.default({
      reliability_horizon_days: 42,
      confidence_floor_high: 0.75,
      confidence_floor_mid: 0.6,
      confidence_floor_low: 0.45,
      demand_tier_time_pressure_scale: 1,
    }),
    optimizer: optimizerCalibrationSchema.default({
      preparedness_weight: 14,
      risk_penalty_weight: 0.35,
      volatility_penalty_weight: 0.22,
      churn_penalty_weight: 0.2,
      lookahead_weeks: 5,
      candidate_steps: 7,
    }),
  })
  .strict();

const partialCalibrationSectionSchema = <TShape extends z.ZodRawShape>(sectionShape: TShape) =>
  z.object(sectionShape).partial().strict();

export const trainingPlanCalibrationInputSchema = z
  .object({
    version: z.literal(1).optional(),
    readiness_composite: partialCalibrationSectionSchema(
      readinessCompositeCalibrationSchema.shape,
    ).optional(),
    readiness_timeline: partialCalibrationSectionSchema(
      readinessTimelineCalibrationSchema.shape,
    ).optional(),
    envelope_penalties: partialCalibrationSectionSchema(
      envelopePenaltyCalibrationSchema.shape,
    ).optional(),
    durability_penalties: partialCalibrationSectionSchema(
      durabilityPenaltyCalibrationSchema.shape,
    ).optional(),
    no_history: partialCalibrationSectionSchema(noHistoryCalibrationSchema.shape).optional(),
    optimizer: partialCalibrationSectionSchema(optimizerCalibrationSchema.shape).optional(),
  })
  .strict();

export type TrainingPlanCalibrationInput = z.infer<typeof trainingPlanCalibrationInputSchema>;

export type TrainingPlanCalibrationConfig = z.infer<typeof trainingPlanCalibrationConfigSchema>;

export const creationConstraintsSchema = z
  .object({
    hard_rest_days: z.array(creationWeekDayEnum).max(7).default([]),
    min_sessions_per_week: z.number().int().min(0).max(21).optional(),
    max_sessions_per_week: z.number().int().min(0).max(21).optional(),
    max_single_session_duration_minutes: z.number().int().min(20).max(600).optional(),
    goal_difficulty_preference: creationGoalDifficultyPreferenceEnum.default("balanced"),
  })
  .superRefine((data, ctx) => {
    if (
      data.min_sessions_per_week !== undefined &&
      data.max_sessions_per_week !== undefined &&
      data.min_sessions_per_week > data.max_sessions_per_week
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["min_sessions_per_week"],
        message: "Minimum sessions per week cannot exceed maximum sessions",
      });
    }

    const uniqueRestDays = new Set(data.hard_rest_days);
    if (uniqueRestDays.size !== data.hard_rest_days.length) {
      ctx.addIssue({
        code: "custom",
        path: ["hard_rest_days"],
        message: "Hard rest days cannot contain duplicates",
      });
    }

    const availableTrainingDays = 7 - uniqueRestDays.size;
    if (
      data.min_sessions_per_week !== undefined &&
      data.min_sessions_per_week > availableTrainingDays
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["min_sessions_per_week"],
        message: "Minimum sessions exceed available training days after hard rest constraints",
      });
    }
  });

export type CreationConstraints = z.infer<typeof creationConstraintsSchema>;

export const creationFieldLockSchema = z
  .object({
    locked: z.boolean().default(false),
    locked_by: z.literal("user").optional(),
    lock_reason: z.string().max(240).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.locked && data.locked_by !== "user") {
      ctx.addIssue({
        code: "custom",
        path: ["locked_by"],
        message: 'locked_by must be "user" when field is locked',
      });
    }
  });

export type CreationFieldLock = z.infer<typeof creationFieldLockSchema>;

export const creationConfigLocksSchema = z.object({
  availability_config: creationFieldLockSchema.default({ locked: false }),
  recent_influence: creationFieldLockSchema.default({ locked: false }),
  hard_rest_days: creationFieldLockSchema.default({ locked: false }),
  min_sessions_per_week: creationFieldLockSchema.default({ locked: false }),
  max_sessions_per_week: creationFieldLockSchema.default({ locked: false }),
  max_single_session_duration_minutes: creationFieldLockSchema.default({
    locked: false,
  }),
  goal_difficulty_preference: creationFieldLockSchema.default({
    locked: false,
  }),
  optimization_profile: creationFieldLockSchema.default({ locked: false }),
  post_goal_recovery_days: creationFieldLockSchema.default({ locked: false }),
  behavior_controls_v1: creationFieldLockSchema.default({ locked: false }),
});

export type CreationConfigLocks = z.infer<typeof creationConfigLocksSchema>;

export const creationCalibrationCompositeLocksSchema = z
  .object({
    target_attainment_weight: z.boolean().default(false),
    envelope_weight: z.boolean().default(false),
    durability_weight: z.boolean().default(false),
    evidence_weight: z.boolean().default(false),
  })
  .strict();

export type CreationCalibrationCompositeLocks = z.infer<
  typeof creationCalibrationCompositeLocksSchema
>;

export const creationValueSourceEnum = z.enum(["user", "suggested", "default"]);

export type CreationValueSource = z.infer<typeof creationValueSourceEnum>;

export const creationProvenanceReferenceTypeEnum = z.enum([
  "completed_activities",
  "activity_efforts",
  "activity_context",
  "profile_metrics",
  "questionnaire",
  "default_heuristic",
  "user_input",
]);

export type CreationProvenanceReferenceType = z.infer<typeof creationProvenanceReferenceTypeEnum>;

export const creationProvenanceReferenceSchema = z.object({
  type: creationProvenanceReferenceTypeEnum,
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(140).optional(),
});

export type CreationProvenanceReference = z.infer<typeof creationProvenanceReferenceSchema>;

export const creationProvenanceSchema = z.object({
  source: creationValueSourceEnum,
  confidence: z.number().min(0).max(1).nullable(),
  rationale: z.array(z.string().min(1).max(120)).default([]),
  references: z.array(creationProvenanceReferenceSchema).default([]),
  updated_at: z.string().datetime(),
});

export type CreationProvenance = z.infer<typeof creationProvenanceSchema>;

export const trainingPlanCreationProvenanceBundleSchema = z.object({
  availability_provenance: creationProvenanceSchema,
  recent_influence_provenance: creationProvenanceSchema,
});

export type TrainingPlanCreationProvenanceBundle = z.infer<
  typeof trainingPlanCreationProvenanceBundleSchema
>;

export const trainingPlanCreationConfigSchema = z
  .object({
    availability_config: creationAvailabilityConfigSchema,
    availability_provenance: creationProvenanceSchema,
    recent_influence: creationRecentInfluenceSchema,
    recent_influence_action: creationRecentInfluenceActionEnum,
    recent_influence_provenance: creationProvenanceSchema,
    constraints: creationConstraintsSchema,
    optimization_profile: creationOptimizationProfileEnum.default("balanced"),
    post_goal_recovery_days: z.number().int().min(0).max(28).default(5),
    behavior_controls_v1: creationBehaviorControlsV1Schema.default({
      aggressiveness: 0.5,
      variability: 0.5,
      spike_frequency: 0.35,
      shape_target: 0,
      shape_strength: 0.35,
      recovery_priority: 0.6,
      starting_fitness_confidence: 0.6,
    }),
    calibration: trainingPlanCalibrationConfigSchema.default({
      version: 1,
      readiness_composite: {
        target_attainment_weight: 0.45,
        envelope_weight: 0.3,
        durability_weight: 0.15,
        evidence_weight: 0.1,
      },
      readiness_timeline: {
        target_tsb: 8,
        form_tolerance: 20,
        fatigue_overflow_scale: 0.4,
        feasibility_blend_weight: 0,
        smoothing_iterations: 24,
        smoothing_lambda: 0.28,
        max_step_delta: 9,
      },
      envelope_penalties: {
        over_high_weight: 0.55,
        under_low_weight: 0.2,
        over_ramp_weight: 0.25,
      },
      durability_penalties: {
        monotony_threshold: 2,
        monotony_scale: 2,
        strain_threshold: 900,
        strain_scale: 900,
        deload_debt_scale: 6,
      },
      no_history: {
        reliability_horizon_days: 42,
        confidence_floor_high: 0.75,
        confidence_floor_mid: 0.6,
        confidence_floor_low: 0.45,
        demand_tier_time_pressure_scale: 1,
      },
      optimizer: {
        preparedness_weight: 14,
        risk_penalty_weight: 0.35,
        volatility_penalty_weight: 0.22,
        churn_penalty_weight: 0.2,
        lookahead_weeks: 5,
        candidate_steps: 7,
      },
    }),
    calibration_composite_locks: creationCalibrationCompositeLocksSchema.default({
      target_attainment_weight: false,
      envelope_weight: false,
      durability_weight: false,
      evidence_weight: false,
    }),
    locks: creationConfigLocksSchema,
    context_summary: creationContextSummarySchema.optional(),
    feasibility_safety_summary: creationFeasibilitySafetySummarySchema.optional(),
  })
  .strict();

export type TrainingPlanCreationConfig = z.infer<typeof trainingPlanCreationConfigSchema>;

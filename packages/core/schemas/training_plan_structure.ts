// packages/core/schemas/training_plan_structure.ts
import { z } from "zod";

/**
 * Generate a UUID v4
 * Cross-platform implementation that works in Node.js, browser, and React Native
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (Node.js 16+, modern browsers)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback: Generate UUID v4 manually
  // Template: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * ============================================================================
 * CORE SCHEMA - Goals + Blocks Architecture
 * ============================================================================
 */

export const trainingPhaseEnum = z.enum([
  "base",
  "build",
  "peak",
  "taper",
  "recovery",
  "transition",
  "maintenance",
]);

export type TrainingPhase = z.infer<typeof trainingPhaseEnum>;

/**
 * Intensity Distribution
 */
export const intensityDistributionSchema = z
  .object({
    easy: z.number().min(0).max(1),
    moderate: z.number().min(0).max(1),
    hard: z.number().min(0).max(1),
  })
  .refine(
    (data) => Math.abs(data.easy + data.moderate + data.hard - 1) < 0.01,
    { message: "Intensity ratios must sum to 1.0" },
  );

export type IntensityDistribution = z.infer<typeof intensityDistributionSchema>;

const targetActivityCategoryEnum = z.enum(["run", "bike", "swim", "other"]);

/**
 * Training Goal V2
 */
export const goalTargetV2Schema = z.discriminatedUnion("target_type", [
  z.object({
    target_type: z.literal("race_performance"),
    distance_m: z.number().positive(),
    target_time_s: z.number().int().positive(),
    activity_category: targetActivityCategoryEnum,
  }),
  z.object({
    target_type: z.literal("pace_threshold"),
    target_speed_mps: z.number().positive(),
    test_duration_s: z.number().int().positive(),
    activity_category: targetActivityCategoryEnum,
  }),
  z.object({
    target_type: z.literal("power_threshold"),
    target_watts: z.number().positive(),
    test_duration_s: z.number().int().positive(),
    activity_category: targetActivityCategoryEnum,
  }),
  z.object({
    target_type: z.literal("hr_threshold"),
    target_lthr_bpm: z.number().int().positive(),
  }),
]);

export type GoalTargetV2 = z.infer<typeof goalTargetV2Schema>;

export const goalV2Schema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.number().int().min(1).max(10).default(1),
  targets: z.array(goalTargetV2Schema).min(1),
  target_performance: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const trainingGoalSchema = goalV2Schema;

export type GoalV2 = z.infer<typeof goalV2Schema>;

export type TrainingGoal = z.infer<typeof trainingGoalSchema>;

export const minimalTrainingGoalCreateSchema = z.object({
  name: z.string().min(1).max(100),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.number().int().min(1).max(10).default(1),
  targets: z.array(goalTargetV2Schema).min(1),
});

export type MinimalTrainingGoalCreate = z.infer<
  typeof minimalTrainingGoalCreateSchema
>;

export const minimalTrainingPlanCreateSchema = z.object({
  goals: z.array(minimalTrainingGoalCreateSchema).min(1),
});

export type MinimalTrainingPlanCreate = z.infer<
  typeof minimalTrainingPlanCreateSchema
>;

/**
 * Training Block
 */
export const trainingBlockSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goal_ids: z.array(z.string().uuid()).default([]),
  phase: trainingPhaseEnum,
  intensity_distribution: intensityDistributionSchema.optional(),
  target_weekly_tss_range: z
    .object({
      min: z.number().min(0),
      max: z.number().min(0),
    })
    .refine((data) => data.max >= data.min),
  target_sessions_per_week_range: z
    .object({
      min: z.number().int().min(0).max(21),
      max: z.number().int().min(0).max(21),
    })
    .refine((data) => data.max >= data.min)
    .optional(),
  description: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type TrainingBlock = z.infer<typeof trainingBlockSchema>;

/**
 * Training Constraints
 */
export const trainingConstraintsSchema = z.object({
  max_hours_per_week: z.number().min(0).max(100).optional(),
  max_hours_per_day: z.number().min(0).max(24).optional(),
  max_sessions_per_week: z.number().int().min(0).max(21).optional(),
  max_sessions_per_day: z.number().int().min(0).max(5).optional(),
  available_days: z
    .array(
      z.enum([
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ]),
    )
    .optional(),
  blocked_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  min_rest_days_per_week: z.number().int().min(0).max(7).default(1),
  max_consecutive_training_days: z.number().int().min(1).max(365).optional(),
  activity_type_constraints: z
    .record(
      z.string(),
      z.object({
        min_sessions_per_week: z.number().int().min(0).optional(),
        max_sessions_per_week: z.number().int().min(0).optional(),
        required_days: z
          .array(
            z.enum([
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "friday",
              "saturday",
              "sunday",
            ]),
          )
          .optional(),
        blocked_days: z
          .array(
            z.enum([
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "friday",
              "saturday",
              "sunday",
            ]),
          )
          .optional(),
      }),
    )
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type TrainingConstraints = z.infer<typeof trainingConstraintsSchema>;

/**
 * Fitness Progression
 */
export const fitnessProgressionSchema = z.object({
  starting_ctl: z.number().min(0).max(250),
  target_ctl_at_peak: z.number().min(0).max(250).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type FitnessProgression = z.infer<typeof fitnessProgressionSchema>;

/**
 * Activity Distribution
 */
export const activityDistributionSchema = z
  .record(
    z.string().min(1),
    z.object({
      target_percentage: z.number().min(0).max(1),
      min_percentage: z.number().min(0).max(1).optional(),
      max_percentage: z.number().min(0).max(1).optional(),
    }),
  )
  .refine(
    (data) => {
      const totalTarget = Object.values(data).reduce(
        (sum, v) => sum + v.target_percentage,
        0,
      );
      return Math.abs(totalTarget - 1) < 0.01;
    },
    { message: "Target percentages must sum to 1.0" },
  );

export type ActivityDistribution = z.infer<typeof activityDistributionSchema>;

/**
 * Periodized Training Plan (without ID - for creation)
 */
export const periodizedPlanCreateSchema = z
  .object({
    plan_type: z.literal("periodized"),
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    goals: z.array(trainingGoalSchema).min(1),
    fitness_progression: fitnessProgressionSchema,
    activity_distribution: activityDistributionSchema,
    constraints: trainingConstraintsSchema.optional(),
    blocks: z.array(trainingBlockSchema).min(1),
    is_active: z.boolean().default(true),
    created_at: z.string().datetime().optional(),
    updated_at: z.string().datetime().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) => {
      const sortedBlocks = [...data.blocks].sort(
        (a, b) =>
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
      );
      for (let i = 0; i < sortedBlocks.length - 1; i++) {
        const currentBlock = sortedBlocks[i];
        const nextBlock = sortedBlocks[i + 1];
        if (!currentBlock || !nextBlock) continue;

        const currentEnd = new Date(currentBlock.end_date);
        const nextStart = new Date(nextBlock.start_date);
        if (currentEnd >= nextStart) return false;
      }
      return true;
    },
    { message: "Training blocks cannot overlap" },
  )
  .refine(
    (data) => {
      const planStart = new Date(data.start_date);
      const planEnd = new Date(data.end_date);
      return data.blocks.every((block) => {
        const blockStart = new Date(block.start_date);
        const blockEnd = new Date(block.end_date);
        return blockStart >= planStart && blockEnd <= planEnd;
      });
    },
    { message: "All blocks must fall within plan dates" },
  )
  .refine(
    (data) => {
      const goalIds = new Set(data.goals.map((g) => g.id));
      const referencedIds = data.blocks.flatMap((b) => b.goal_ids);
      return referencedIds.every((id) => goalIds.has(id));
    },
    { message: "Blocks reference non-existent goal IDs" },
  );

/**
 * Periodized Training Plan (with ID - complete schema)
 * Redefines the schema to include ID rather than extending to avoid refinement issues
 */
export const periodizedPlanSchema = z
  .object({
    plan_type: z.literal("periodized"),
    id: z.string().uuid(),
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    goals: z.array(trainingGoalSchema).min(1),
    fitness_progression: fitnessProgressionSchema,
    activity_distribution: activityDistributionSchema,
    constraints: trainingConstraintsSchema.optional(),
    blocks: z.array(trainingBlockSchema).min(1),
    is_active: z.boolean().default(true),
    created_at: z.string().datetime().optional(),
    updated_at: z.string().datetime().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) => {
      const sortedBlocks = [...data.blocks].sort(
        (a, b) =>
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
      );
      for (let i = 0; i < sortedBlocks.length - 1; i++) {
        const currentBlock = sortedBlocks[i];
        const nextBlock = sortedBlocks[i + 1];
        if (!currentBlock || !nextBlock) continue;

        const currentEnd = new Date(currentBlock.end_date);
        const nextStart = new Date(nextBlock.start_date);
        if (currentEnd >= nextStart) return false;
      }
      return true;
    },
    { message: "Training blocks cannot overlap" },
  )
  .refine(
    (data) => {
      const planStart = new Date(data.start_date);
      const planEnd = new Date(data.end_date);
      return data.blocks.every((block) => {
        const blockStart = new Date(block.start_date);
        const blockEnd = new Date(block.end_date);
        return blockStart >= planStart && blockEnd <= planEnd;
      });
    },
    { message: "All blocks must fall within plan dates" },
  )
  .refine(
    (data) => {
      const goalIds = new Set(data.goals.map((g) => g.id));
      const referencedIds = data.blocks.flatMap((b) => b.goal_ids);
      return referencedIds.every((id) => goalIds.has(id));
    },
    { message: "Blocks reference non-existent goal IDs" },
  );

export type PeriodizedPlan = z.infer<typeof periodizedPlanSchema>;

/**
 * Maintenance Training Plan (without ID - for creation)
 */
export const maintenancePlanCreateSchema = z.object({
  plan_type: z.literal("maintenance"),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  target_ctl_range: z
    .object({
      min: z.number().min(0).max(250),
      max: z.number().min(0).max(250),
    })
    .refine((data) => data.max >= data.min)
    .optional(),
  intensity_distribution: intensityDistributionSchema.optional(),
  target_weekly_tss_range: z
    .object({
      min: z.number().min(0),
      max: z.number().min(0),
    })
    .refine((data) => data.max >= data.min)
    .optional(),
  target_sessions_per_week_range: z
    .object({
      min: z.number().int().min(0),
      max: z.number().int().min(0),
    })
    .refine((data) => data.max >= data.min)
    .optional(),
  constraints: trainingConstraintsSchema.optional(),
  activity_distribution: activityDistributionSchema,
  is_active: z.boolean().default(true),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Maintenance Training Plan (with ID - complete schema)
 * Redefines the schema to include ID rather than extending to avoid refinement issues
 */
export const maintenancePlanSchema = z.object({
  plan_type: z.literal("maintenance"),
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  target_ctl_range: z
    .object({
      min: z.number().min(0).max(250),
      max: z.number().min(0).max(250),
    })
    .refine((data) => data.max >= data.min)
    .optional(),
  intensity_distribution: intensityDistributionSchema.optional(),
  target_weekly_tss_range: z
    .object({
      min: z.number().min(0),
      max: z.number().min(0),
    })
    .refine((data) => data.max >= data.min)
    .optional(),
  target_sessions_per_week_range: z
    .object({
      min: z.number().int().min(0),
      max: z.number().int().min(0),
    })
    .refine((data) => data.max >= data.min)
    .optional(),
  constraints: trainingConstraintsSchema.optional(),
  activity_distribution: activityDistributionSchema,
  is_active: z.boolean().default(true),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type MaintenancePlan = z.infer<typeof maintenancePlanSchema>;

/**
 * Training Plan Create Schema (Discriminated Union - without ID)
 */
export const trainingPlanCreateSchema = z.discriminatedUnion("plan_type", [
  periodizedPlanCreateSchema,
  maintenancePlanCreateSchema,
]);

export type TrainingPlanCreate = z.infer<typeof trainingPlanCreateSchema>;

/**
 * Training Plan Schema (Discriminated Union - with ID)
 */
export const trainingPlanSchema = z.discriminatedUnion("plan_type", [
  periodizedPlanSchema,
  maintenancePlanSchema,
]);

export type TrainingPlan = z.infer<typeof trainingPlanSchema>;

/**
 * ============================================================================
 * TRAINING PLAN CREATION CONFIGURATION (MVP - PHASE 1)
 * ============================================================================
 */

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

export const creationAvailabilityTemplateEnum = z.enum([
  "low",
  "moderate",
  "high",
  "custom",
]);

export type CreationAvailabilityTemplate = z.infer<
  typeof creationAvailabilityTemplateEnum
>;

export const creationAvailabilityWindowSchema = z
  .object({
    start_minute_of_day: z.number().int().min(0).max(1439),
    end_minute_of_day: z.number().int().min(1).max(1440),
  })
  .refine((data) => data.end_minute_of_day > data.start_minute_of_day, {
    message: "Availability window end must be after start",
    path: ["end_minute_of_day"],
  });

export type CreationAvailabilityWindow = z.infer<
  typeof creationAvailabilityWindowSchema
>;

export const creationAvailabilityDaySchema = z.object({
  day: creationWeekDayEnum,
  windows: z.array(creationAvailabilityWindowSchema).max(4).default([]),
  max_sessions: z.number().int().min(0).max(3).optional(),
});

export type CreationAvailabilityDay = z.infer<
  typeof creationAvailabilityDaySchema
>;

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
        message:
          "Availability config must include exactly one entry per weekday",
      });
    }
  });

export type CreationAvailabilityConfig = z.infer<
  typeof creationAvailabilityConfigSchema
>;

export const creationBaselineLoadSchema = z.object({
  weekly_tss: z.number().int().min(30).max(2000),
});

export type CreationBaselineLoad = z.infer<typeof creationBaselineLoadSchema>;

export const creationRecentInfluenceSchema = z.object({
  influence_score: z.number().min(-1).max(1),
});

export type CreationRecentInfluence = z.infer<
  typeof creationRecentInfluenceSchema
>;

export const creationRecentInfluenceActionEnum = z.enum([
  "accepted",
  "edited",
  "disabled",
]);

export type CreationRecentInfluenceAction = z.infer<
  typeof creationRecentInfluenceActionEnum
>;

export const creationGoalDifficultyPreferenceEnum = z.enum([
  "conservative",
  "balanced",
  "stretch",
]);

export type CreationGoalDifficultyPreference = z.infer<
  typeof creationGoalDifficultyPreferenceEnum
>;

export const creationConstraintsSchema = z
  .object({
    weekly_load_floor_tss: z.number().int().min(0).max(2000).optional(),
    weekly_load_cap_tss: z.number().int().min(0).max(3000).optional(),
    hard_rest_days: z.array(creationWeekDayEnum).max(7).default([]),
    min_sessions_per_week: z.number().int().min(0).max(21).optional(),
    max_sessions_per_week: z.number().int().min(0).max(21).optional(),
    max_single_session_duration_minutes: z
      .number()
      .int()
      .min(20)
      .max(600)
      .optional(),
    goal_difficulty_preference:
      creationGoalDifficultyPreferenceEnum.default("balanced"),
  })
  .superRefine((data, ctx) => {
    if (
      data.weekly_load_floor_tss !== undefined &&
      data.weekly_load_cap_tss !== undefined &&
      data.weekly_load_floor_tss > data.weekly_load_cap_tss
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["weekly_load_floor_tss"],
        message: "Weekly load floor cannot exceed weekly load cap",
      });
    }

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
        message:
          "Minimum sessions exceed available training days after hard rest constraints",
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
  baseline_load: creationFieldLockSchema.default({ locked: false }),
  recent_influence: creationFieldLockSchema.default({ locked: false }),
  weekly_load_floor_tss: creationFieldLockSchema.default({ locked: false }),
  weekly_load_cap_tss: creationFieldLockSchema.default({ locked: false }),
  hard_rest_days: creationFieldLockSchema.default({ locked: false }),
  min_sessions_per_week: creationFieldLockSchema.default({ locked: false }),
  max_sessions_per_week: creationFieldLockSchema.default({ locked: false }),
  max_single_session_duration_minutes: creationFieldLockSchema.default({
    locked: false,
  }),
  goal_difficulty_preference: creationFieldLockSchema.default({
    locked: false,
  }),
});

export type CreationConfigLocks = z.infer<typeof creationConfigLocksSchema>;

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

export type CreationProvenanceReferenceType = z.infer<
  typeof creationProvenanceReferenceTypeEnum
>;

export const creationProvenanceReferenceSchema = z.object({
  type: creationProvenanceReferenceTypeEnum,
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(140).optional(),
});

export type CreationProvenanceReference = z.infer<
  typeof creationProvenanceReferenceSchema
>;

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
  baseline_load_provenance: creationProvenanceSchema,
  recent_influence_provenance: creationProvenanceSchema,
});

export type TrainingPlanCreationProvenanceBundle = z.infer<
  typeof trainingPlanCreationProvenanceBundleSchema
>;

export const creationHistoryAvailabilityStateEnum = z.enum([
  "none",
  "sparse",
  "rich",
]);

export type CreationHistoryAvailabilityState = z.infer<
  typeof creationHistoryAvailabilityStateEnum
>;

export const creationSignalMarkerEnum = z.enum(["low", "moderate", "high"]);

export type CreationSignalMarker = z.infer<typeof creationSignalMarkerEnum>;

export const creationRangeSchema = z
  .object({
    min: z.number(),
    max: z.number(),
  })
  .refine((data) => data.max >= data.min, {
    message: "Range max must be greater than or equal to min",
    path: ["max"],
  });

export type CreationRange = z.infer<typeof creationRangeSchema>;

export const creationContextSummarySchema = z.object({
  history_availability_state: creationHistoryAvailabilityStateEnum,
  recent_consistency_marker: creationSignalMarkerEnum,
  effort_confidence_marker: creationSignalMarkerEnum,
  profile_metric_completeness_marker: creationSignalMarkerEnum,
  signal_quality: z.number().min(0).max(1),
  recommended_baseline_tss_range: creationRangeSchema,
  recommended_recent_influence_range: creationRangeSchema,
  recommended_sessions_per_week_range: creationRangeSchema,
  rationale_codes: z.array(z.string().min(1).max(120)).default([]),
});

export type CreationContextSummary = z.infer<
  typeof creationContextSummarySchema
>;

export const creationFeasibilityBandEnum = z.enum([
  "under-reaching",
  "on-track",
  "over-reaching",
]);

export type CreationFeasibilityBand = z.infer<
  typeof creationFeasibilityBandEnum
>;

export const creationSafetyBandEnum = z.enum(["safe", "caution", "high-risk"]);

export type CreationSafetyBand = z.infer<typeof creationSafetyBandEnum>;

export const creationSummaryDriverSchema = z.object({
  code: z.string().min(1).max(120),
  message: z.string().min(1).max(300),
  impact: z.number().min(-1).max(1),
});

export type CreationSummaryDriver = z.infer<typeof creationSummaryDriverSchema>;

export const creationSummaryActionSchema = z.object({
  code: z.string().min(1).max(120),
  message: z.string().min(1).max(300),
  priority: z.number().int().min(1).max(3),
});

export type CreationSummaryAction = z.infer<typeof creationSummaryActionSchema>;

export const creationSummaryBlockerSchema = z.object({
  code: z.string().min(1).max(120),
  message: z.string().min(1).max(300),
  field_paths: z.array(z.string().min(1).max(200)).default([]),
});

export type CreationSummaryBlocker = z.infer<
  typeof creationSummaryBlockerSchema
>;

export const creationFeasibilitySafetySummarySchema = z.object({
  feasibility_band: creationFeasibilityBandEnum,
  safety_band: creationSafetyBandEnum,
  feasibility_score: z.number().min(0).max(1),
  safety_score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  top_drivers: z.array(creationSummaryDriverSchema).min(1),
  recommended_actions: z.array(creationSummaryActionSchema).default([]),
  blockers: z.array(creationSummaryBlockerSchema).default([]),
  computed_at: z.string().datetime(),
});

export type CreationFeasibilitySafetySummary = z.infer<
  typeof creationFeasibilitySafetySummarySchema
>;

export const trainingPlanCreationConfigSchema = z.object({
  availability_config: creationAvailabilityConfigSchema,
  availability_provenance: creationProvenanceSchema,
  baseline_load: creationBaselineLoadSchema,
  baseline_load_provenance: creationProvenanceSchema,
  recent_influence: creationRecentInfluenceSchema,
  recent_influence_action: creationRecentInfluenceActionEnum,
  recent_influence_provenance: creationProvenanceSchema,
  constraints: creationConstraintsSchema,
  locks: creationConfigLocksSchema,
  context_summary: creationContextSummarySchema.optional(),
  feasibility_safety_summary: creationFeasibilitySafetySummarySchema.optional(),
});

export type TrainingPlanCreationConfig = z.infer<
  typeof trainingPlanCreationConfigSchema
>;

/**
 * ============================================================================
 * WIZARD INPUT SCHEMAS
 * ============================================================================
 */

export const wizardGoalInputSchema = z.object({
  name: z.string().min(1).max(100),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targets: z.array(goalTargetV2Schema).min(1),
});

export type WizardGoalInput = z.infer<typeof wizardGoalInputSchema>;

export const wizardFitnessInputSchema = z.object({
  starting_ctl: z.number().min(0).max(250).optional(),
  estimated_from_weekly_hours: z.number().min(0).max(50).optional(),
  estimated_from_weekly_tss: z.number().min(0).max(2000).optional(),
});

export type WizardFitnessInput = z.infer<typeof wizardFitnessInputSchema>;

export const wizardActivityInputSchema = z
  .record(z.string(), z.number().min(0).max(1))
  .refine(
    (data) => {
      const total = Object.values(data).reduce((sum, v) => sum + v, 0);
      return Math.abs(total - 1) < 0.01;
    },
    { message: "Percentages must sum to 100%" },
  );

export type WizardActivityInput = z.infer<typeof wizardActivityInputSchema>;

export const wizardConstraintsInputSchema = z.object({
  max_hours_per_week: z.number().min(0).max(100).optional(),
  max_sessions_per_week: z.number().int().min(0).max(21).optional(),
  available_days: z
    .array(
      z.enum([
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ]),
    )
    .optional(),
  min_rest_days_per_week: z.number().int().min(0).max(7).default(1),
});

export type WizardConstraintsInput = z.infer<
  typeof wizardConstraintsInputSchema
>;

export const wizardPeriodizedInputSchema = z.object({
  plan_type: z.literal("periodized"),
  name: z.string().min(1).max(255).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goals: z.array(wizardGoalInputSchema).min(1),
  fitness: wizardFitnessInputSchema,
  activities: wizardActivityInputSchema,
  constraints: wizardConstraintsInputSchema.optional(),
  intensity_preset: z.enum(["polarized", "pyramidal", "threshold"]).optional(),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
});

export type WizardPeriodizedInput = z.infer<typeof wizardPeriodizedInputSchema>;

export const wizardMaintenanceInputSchema = z.object({
  plan_type: z.literal("maintenance"),
  name: z.string().min(1).max(255).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  target_ctl_range: z
    .object({
      min: z.number().min(0).max(250),
      max: z.number().min(0).max(250),
    })
    .optional(),
  target_weekly_hours: z.number().min(0).max(50).optional(),
  target_sessions_per_week: z.number().int().min(0).max(21).optional(),
  activities: wizardActivityInputSchema,
  constraints: wizardConstraintsInputSchema.optional(),
  intensity_preset: z.enum(["polarized", "pyramidal", "threshold"]).optional(),
});

export type WizardMaintenanceInput = z.infer<
  typeof wizardMaintenanceInputSchema
>;

/**
 * ============================================================================
 * TYPE GUARDS
 * ============================================================================
 */

export function isPeriodizedPlan(plan: TrainingPlan): plan is PeriodizedPlan {
  return plan.plan_type === "periodized";
}

export function isMaintenancePlan(plan: TrainingPlan): plan is MaintenancePlan {
  return plan.plan_type === "maintenance";
}

/**
 * ============================================================================
 * PRESETS & DEFAULTS
 * ============================================================================
 */

export const INTENSITY_PRESETS: Record<
  "polarized" | "pyramidal" | "threshold",
  IntensityDistribution
> = {
  polarized: { easy: 0.8, moderate: 0.1, hard: 0.1 },
  pyramidal: { easy: 0.7, moderate: 0.2, hard: 0.1 },
  threshold: { easy: 0.6, moderate: 0.3, hard: 0.1 },
};

export const PHASE_CHARACTERISTICS = {
  base: {
    intensity: INTENSITY_PRESETS.polarized,
    sessionsPerWeek: { min: 4, max: 6 },
    durationWeeks: { min: 4, max: 12 },
    tssMultiplier: 1.0,
  },
  build: {
    intensity: INTENSITY_PRESETS.pyramidal,
    sessionsPerWeek: { min: 5, max: 7 },
    durationWeeks: { min: 4, max: 12 },
    tssMultiplier: 1.2,
  },
  peak: {
    intensity: INTENSITY_PRESETS.threshold,
    sessionsPerWeek: { min: 5, max: 7 },
    durationWeeks: { min: 2, max: 4 },
    tssMultiplier: 1.0,
  },
  taper: {
    intensity: INTENSITY_PRESETS.polarized,
    sessionsPerWeek: { min: 3, max: 5 },
    durationWeeks: { min: 1, max: 3 },
    tssMultiplier: 0.6,
  },
  recovery: {
    intensity: { easy: 0.95, moderate: 0.05, hard: 0.0 },
    sessionsPerWeek: { min: 3, max: 5 },
    durationWeeks: { min: 1, max: 2 },
    tssMultiplier: 0.5,
  },
  transition: {
    intensity: { easy: 0.9, moderate: 0.1, hard: 0.0 },
    sessionsPerWeek: { min: 3, max: 5 },
    durationWeeks: { min: 2, max: 4 },
    tssMultiplier: 0.7,
  },
  maintenance: {
    intensity: INTENSITY_PRESETS.polarized,
    sessionsPerWeek: { min: 3, max: 5 },
    durationWeeks: { min: 1, max: 52 },
    tssMultiplier: 0.8,
  },
} as const;

/**
 * Experience level affects progression rate and volume
 */
export const EXPERIENCE_LEVELS = {
  beginner: {
    weeklyTSSIncreaseRate: 0.05, // 5% per week
    maxWeeklyCTLIncrease: 5,
    recoveryWeekFrequency: 3,
    baselineSessionsPerWeek: 4,
  },
  intermediate: {
    weeklyTSSIncreaseRate: 0.07, // 7% per week
    maxWeeklyCTLIncrease: 7,
    recoveryWeekFrequency: 3,
    baselineSessionsPerWeek: 5,
  },
  advanced: {
    weeklyTSSIncreaseRate: 0.1, // 10% per week
    maxWeeklyCTLIncrease: 10,
    recoveryWeekFrequency: 4,
    baselineSessionsPerWeek: 6,
  },
} as const;

/**
 * ============================================================================
 * HELPER FUNCTIONS
 * ============================================================================
 */

/**
 * Date Utilities
 */
export function calculateWeeks(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil(
    (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.ceil(days / 7);
}

export function addWeeks(dateString: string, weeks: number): string {
  const date = new Date(dateString);
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().split("T")[0] || "";
}

export function addDays(dateString: string, days: number): string {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0] || "";
}

export function calculateWeeksUntil(
  dateString: string,
  fromDate?: string,
): number {
  const target = new Date(dateString);
  const from = fromDate ? new Date(fromDate) : new Date();
  from.setHours(0, 0, 0, 0);
  const days = Math.ceil(
    (target.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.ceil(days / 7);
}

/**
 * CTL Estimation
 */
export function estimateCTLFromWeeklyTSS(weeklyTSS: number): number {
  return Math.round(weeklyTSS / 7);
}

export function estimateCTLFromWeeklyHours(
  weeklyHours: number,
  avgIntensity: number = 60,
): number {
  const weeklyTSS = weeklyHours * avgIntensity;
  return estimateCTLFromWeeklyTSS(weeklyTSS);
}

export function estimateWeeklyTSSFromCTL(ctl: number): number {
  return Math.round(ctl * 7);
}

/**
 * Resolve fitness input to starting CTL
 */
export function resolveFitnessInput(fitness: WizardFitnessInput): number {
  if (fitness.starting_ctl !== undefined) {
    return fitness.starting_ctl;
  }
  if (fitness.estimated_from_weekly_tss !== undefined) {
    return estimateCTLFromWeeklyTSS(fitness.estimated_from_weekly_tss);
  }
  if (fitness.estimated_from_weekly_hours !== undefined) {
    return estimateCTLFromWeeklyHours(fitness.estimated_from_weekly_hours);
  }
  return 40; // Default starting CTL
}

/**
 * Block Queries
 */
export function getBlocksInRange(
  blocks: TrainingBlock[],
  startDate: string,
  endDate: string,
): TrainingBlock[] {
  const start = new Date(startDate);
  const end = new Date(endDate);

  return blocks.filter((block) => {
    const blockStart = new Date(block.start_date);
    const blockEnd = new Date(block.end_date);
    return blockStart <= end && blockEnd >= start;
  });
}

export function getCurrentBlock(
  blocks: TrainingBlock[],
  date?: string,
): TrainingBlock | null {
  const dateToUse = date || new Date().toISOString().split("T")[0] || "";
  const d = new Date(dateToUse);
  return (
    blocks.find((block) => {
      const start = new Date(block.start_date);
      const end = new Date(block.end_date);
      return d >= start && d <= end;
    }) || null
  );
}

export function getBlockDurationWeeks(block: TrainingBlock): number {
  return calculateWeeks(block.start_date, block.end_date);
}

/**
 * Goal Queries
 */
export function getNextGoal(
  goals: TrainingGoal[],
  currentDate?: string,
): TrainingGoal | null {
  const dateToUse = currentDate || new Date().toISOString().split("T")[0] || "";
  const current = new Date(dateToUse);
  const futureGoals = goals
    .filter((goal) => new Date(goal.target_date) > current)
    .sort(
      (a, b) =>
        new Date(a.target_date).getTime() - new Date(b.target_date).getTime(),
    );

  return futureGoals[0] || null;
}

export function getPrimaryGoal(goals: TrainingGoal[]): TrainingGoal | null {
  return goals.sort((a, b) => a.priority - b.priority)[0] || null;
}

export function getGoalsByPriority(goals: TrainingGoal[]): TrainingGoal[] {
  return [...goals].sort((a, b) => a.priority - b.priority);
}

/**
 * Activity Distribution Helpers
 */
export function normalizeActivityDistribution(
  activities: WizardActivityInput,
): ActivityDistribution {
  return Object.fromEntries(
    Object.entries(activities).map(([type, percentage]) => [
      type,
      { target_percentage: percentage },
    ]),
  );
}

/**
 * ============================================================================
 * PLAN TEMPLATES
 * ============================================================================
 */

export interface PlanTemplate {
  name: string;
  description: string;
  sport: string[];
  experienceLevel: ("beginner" | "intermediate" | "advanced")[];
  durationWeeks: { min: number; max: number; recommended: number };
  phases: Array<{
    name: string;
    phase: TrainingPhase;
    weeksPercentage: number; // Percentage of total plan duration
    description: string;
  }>;
}

export const PLAN_TEMPLATES: Record<string, PlanTemplate> = {
  marathon_beginner: {
    name: "Marathon - Beginner",
    description:
      "16-18 week plan for first-time marathoners focusing on building endurance safely",
    sport: ["running"],
    experienceLevel: ["beginner"],
    durationWeeks: { min: 16, max: 20, recommended: 18 },
    phases: [
      {
        name: "Base Building",
        phase: "base",
        weeksPercentage: 0.35,
        description: "Build aerobic foundation with easy miles",
      },
      {
        name: "Build Phase",
        phase: "build",
        weeksPercentage: 0.45,
        description: "Introduce tempo runs and longer long runs",
      },
      {
        name: "Taper",
        phase: "taper",
        weeksPercentage: 0.2,
        description: "Reduce volume while maintaining intensity",
      },
    ],
  },
  marathon_intermediate: {
    name: "Marathon - Intermediate",
    description:
      "16-18 week plan for runners with marathon experience seeking improvement",
    sport: ["running"],
    experienceLevel: ["intermediate"],
    durationWeeks: { min: 16, max: 20, recommended: 18 },
    phases: [
      {
        name: "Base Building",
        phase: "base",
        weeksPercentage: 0.25,
        description: "Rebuild aerobic base",
      },
      {
        name: "Build Phase 1",
        phase: "build",
        weeksPercentage: 0.3,
        description: "Increase volume with tempo and threshold work",
      },
      {
        name: "Build Phase 2",
        phase: "build",
        weeksPercentage: 0.3,
        description: "Peak volume with race-specific workouts",
      },
      {
        name: "Taper",
        phase: "taper",
        weeksPercentage: 0.15,
        description: "Sharpen for race day",
      },
    ],
  },
  marathon_advanced: {
    name: "Marathon - Advanced",
    description: "18-24 week plan for competitive marathoners",
    sport: ["running"],
    experienceLevel: ["advanced"],
    durationWeeks: { min: 18, max: 24, recommended: 20 },
    phases: [
      {
        name: "Base Building",
        phase: "base",
        weeksPercentage: 0.3,
        description: "High-volume aerobic base",
      },
      {
        name: "Build Phase 1",
        phase: "build",
        weeksPercentage: 0.25,
        description: "Lactate threshold development",
      },
      {
        name: "Build Phase 2",
        phase: "build",
        weeksPercentage: 0.25,
        description: "Race-specific marathon pace work",
      },
      {
        name: "Peak",
        phase: "peak",
        weeksPercentage: 0.1,
        description: "Final race sharpening",
      },
      {
        name: "Taper",
        phase: "taper",
        weeksPercentage: 0.1,
        description: "Rest and recovery before race",
      },
    ],
  },
  half_marathon: {
    name: "Half Marathon",
    description: "12-14 week plan for half marathon",
    sport: ["running"],
    experienceLevel: ["beginner", "intermediate"],
    durationWeeks: { min: 10, max: 14, recommended: 12 },
    phases: [
      {
        name: "Base Building",
        phase: "base",
        weeksPercentage: 0.35,
        description: "Build endurance foundation",
      },
      {
        name: "Build Phase",
        phase: "build",
        weeksPercentage: 0.5,
        description: "Increase intensity and volume",
      },
      {
        name: "Taper",
        phase: "taper",
        weeksPercentage: 0.15,
        description: "Peak for race day",
      },
    ],
  },
  "5k_10k": {
    name: "5K/10K",
    description: "8-12 week plan for 5K or 10K races",
    sport: ["running"],
    experienceLevel: ["beginner", "intermediate", "advanced"],
    durationWeeks: { min: 8, max: 12, recommended: 10 },
    phases: [
      {
        name: "Base",
        phase: "base",
        weeksPercentage: 0.3,
        description: "Aerobic foundation",
      },
      {
        name: "Build",
        phase: "build",
        weeksPercentage: 0.55,
        description: "VO2max and speed work",
      },
      {
        name: "Taper",
        phase: "taper",
        weeksPercentage: 0.15,
        description: "Race preparation",
      },
    ],
  },
  cycling_century: {
    name: "Century Ride (100 miles)",
    description: "12-16 week plan for century ride",
    sport: ["cycling"],
    experienceLevel: ["intermediate"],
    durationWeeks: { min: 12, max: 16, recommended: 14 },
    phases: [
      {
        name: "Base",
        phase: "base",
        weeksPercentage: 0.35,
        description: "Build endurance with long rides",
      },
      {
        name: "Build",
        phase: "build",
        weeksPercentage: 0.5,
        description: "Increase ride duration and climbing",
      },
      {
        name: "Taper",
        phase: "taper",
        weeksPercentage: 0.15,
        description: "Recovery before event",
      },
    ],
  },
  cycling_gran_fondo: {
    name: "Gran Fondo",
    description: "16-20 week plan for competitive gran fondo",
    sport: ["cycling"],
    experienceLevel: ["intermediate", "advanced"],
    durationWeeks: { min: 16, max: 20, recommended: 18 },
    phases: [
      {
        name: "Base",
        phase: "base",
        weeksPercentage: 0.35,
        description: "Endurance and climbing volume",
      },
      {
        name: "Build",
        phase: "build",
        weeksPercentage: 0.45,
        description: "Threshold and sustained power",
      },
      {
        name: "Taper",
        phase: "taper",
        weeksPercentage: 0.2,
        description: "Peak for event day",
      },
    ],
  },
  triathlon_sprint: {
    name: "Sprint Triathlon",
    description: "8-12 week sprint triathlon plan",
    sport: ["triathlon", "running", "cycling", "swimming"],
    experienceLevel: ["beginner", "intermediate"],
    durationWeeks: { min: 8, max: 12, recommended: 10 },
    phases: [
      {
        name: "Base",
        phase: "base",
        weeksPercentage: 0.3,
        description: "Build fitness across all three sports",
      },
      {
        name: "Build",
        phase: "build",
        weeksPercentage: 0.55,
        description: "Race-specific intensity and brick workouts",
      },
      {
        name: "Taper",
        phase: "taper",
        weeksPercentage: 0.15,
        description: "Rest for race day",
      },
    ],
  },
  triathlon_olympic: {
    name: "Olympic Triathlon",
    description: "12-16 week olympic distance plan",
    sport: ["triathlon", "running", "cycling", "swimming"],
    experienceLevel: ["intermediate"],
    durationWeeks: { min: 12, max: 16, recommended: 14 },
    phases: [
      {
        name: "Base",
        phase: "base",
        weeksPercentage: 0.3,
        description: "Aerobic development in all disciplines",
      },
      {
        name: "Build",
        phase: "build",
        weeksPercentage: 0.55,
        description: "Threshold work and race simulation",
      },
      {
        name: "Taper",
        phase: "taper",
        weeksPercentage: 0.15,
        description: "Final preparation",
      },
    ],
  },
  triathlon_half_ironman: {
    name: "Half Ironman (70.3)",
    description: "16-20 week half ironman plan",
    sport: ["triathlon", "running", "cycling", "swimming"],
    experienceLevel: ["intermediate", "advanced"],
    durationWeeks: { min: 16, max: 20, recommended: 18 },
    phases: [
      {
        name: "Base",
        phase: "base",
        weeksPercentage: 0.35,
        description: "Build endurance volume",
      },
      {
        name: "Build Phase 1",
        phase: "build",
        weeksPercentage: 0.3,
        description: "Increase volume across all sports",
      },
      {
        name: "Build Phase 2",
        phase: "build",
        weeksPercentage: 0.25,
        description: "Race-specific long sessions",
      },
      {
        name: "Taper",
        phase: "taper",
        weeksPercentage: 0.1,
        description: "Recovery before race",
      },
    ],
  },
  triathlon_ironman: {
    name: "Ironman",
    description: "20-28 week full ironman plan",
    sport: ["triathlon", "running", "cycling", "swimming"],
    experienceLevel: ["advanced"],
    durationWeeks: { min: 20, max: 28, recommended: 24 },
    phases: [
      {
        name: "Base",
        phase: "base",
        weeksPercentage: 0.35,
        description: "Massive aerobic base building",
      },
      {
        name: "Build Phase 1",
        phase: "build",
        weeksPercentage: 0.25,
        description: "Volume increase",
      },
      {
        name: "Build Phase 2",
        phase: "build",
        weeksPercentage: 0.25,
        description: "Peak volume and race rehearsals",
      },
      {
        name: "Peak",
        phase: "peak",
        weeksPercentage: 0.08,
        description: "Final race-specific work",
      },
      {
        name: "Taper",
        phase: "taper",
        weeksPercentage: 0.07,
        description: "Recovery and mental preparation",
      },
    ],
  },
  base_building: {
    name: "Base Building",
    description: "Flexible base building phase (4-12 weeks)",
    sport: ["running", "cycling", "triathlon", "swimming"],
    experienceLevel: ["beginner", "intermediate", "advanced"],
    durationWeeks: { min: 4, max: 12, recommended: 8 },
    phases: [
      {
        name: "Base Building",
        phase: "base",
        weeksPercentage: 1.0,
        description: "Build aerobic foundation",
      },
    ],
  },
  general_fitness: {
    name: "General Fitness",
    description: "Maintain fitness without specific event goal",
    sport: ["running", "cycling", "triathlon", "swimming", "strength"],
    experienceLevel: ["beginner", "intermediate", "advanced"],
    durationWeeks: { min: 4, max: 52, recommended: 12 },
    phases: [
      {
        name: "General Fitness",
        phase: "base",
        weeksPercentage: 1.0,
        description: "Consistent training for health and fitness",
      },
    ],
  },
};

/**
 * ============================================================================
 * PLAN GENERATION FUNCTIONS
 * ============================================================================
 */

/**
 * Generate training blocks from template and user inputs
 */
export function generateBlocksFromTemplate(
  template: PlanTemplate,
  goalDate: string,
  startDate: string,
  startingCTL: number,
  experienceLevel: "beginner" | "intermediate" | "advanced" = "intermediate",
  goalId: string,
): TrainingBlock[] {
  const totalWeeks = calculateWeeksUntil(goalDate, startDate);
  const blocks: TrainingBlock[] = [];

  let currentDate = startDate;
  const baseWeeklyTSS = estimateWeeklyTSSFromCTL(startingCTL);
  const experienceConfig = EXPERIENCE_LEVELS[experienceLevel];

  for (const phaseTemplate of template.phases) {
    const phaseWeeks = Math.max(
      PHASE_CHARACTERISTICS[phaseTemplate.phase].durationWeeks.min,
      Math.round(totalWeeks * phaseTemplate.weeksPercentage),
    );

    const endDate = addDays(addWeeks(currentDate, phaseWeeks), -1);
    const phaseConfig = PHASE_CHARACTERISTICS[phaseTemplate.phase];

    // Calculate TSS range for this phase
    const phaseTSSMultiplier = phaseConfig.tssMultiplier;
    const targetTSS = baseWeeklyTSS * phaseTSSMultiplier;
    const tssVariance = 0.15; // ±15%

    blocks.push({
      id: generateUUID(),
      name: phaseTemplate.name,
      start_date: currentDate,
      end_date: endDate,
      goal_ids: [goalId],
      phase: phaseTemplate.phase,
      intensity_distribution: phaseConfig.intensity,
      target_weekly_tss_range: {
        min: Math.round(targetTSS * (1 - tssVariance)),
        max: Math.round(targetTSS * (1 + tssVariance)),
      },
      target_sessions_per_week_range: {
        min: phaseConfig.sessionsPerWeek.min,
        max: phaseConfig.sessionsPerWeek.max,
      },
      description: phaseTemplate.description,
    });

    currentDate = addDays(endDate, 1);
  }

  return blocks;
}

/**
 * Generate training blocks automatically based on goal date and experience level
 */
export function generateGenericBlocks(
  goalDate: string,
  startDate: string,
  startingCTL: number,
  experienceLevel: "beginner" | "intermediate" | "advanced" = "intermediate",
  goalId: string,
): TrainingBlock[] {
  const weeksAvailable = calculateWeeksUntil(goalDate, startDate);
  const baseWeeklyTSS = estimateWeeklyTSSFromCTL(startingCTL);

  if (weeksAvailable < 8) {
    // Short plan: minimal prep
    return [
      createBlock(
        "Build",
        "build",
        startDate,
        weeksAvailable - 2,
        baseWeeklyTSS,
        goalId,
      ),
      createBlock(
        "Taper",
        "taper",
        addWeeks(startDate, weeksAvailable - 2),
        2,
        baseWeeklyTSS,
        goalId,
      ),
    ];
  } else if (weeksAvailable < 16) {
    // Medium plan
    const baseWeeks = Math.floor(weeksAvailable * 0.3);
    const buildWeeks = Math.floor(weeksAvailable * 0.55);
    const taperWeeks = weeksAvailable - baseWeeks - buildWeeks;

    return [
      createBlock("Base", "base", startDate, baseWeeks, baseWeeklyTSS, goalId),
      createBlock(
        "Build",
        "build",
        addWeeks(startDate, baseWeeks),
        buildWeeks,
        baseWeeklyTSS,
        goalId,
      ),
      createBlock(
        "Taper",
        "taper",
        addWeeks(startDate, baseWeeks + buildWeeks),
        taperWeeks,
        baseWeeklyTSS,
        goalId,
      ),
    ];
  } else {
    // Long plan
    const baseWeeks = Math.floor(weeksAvailable * 0.35);
    const build1Weeks = Math.floor(weeksAvailable * 0.25);
    const build2Weeks = Math.floor(weeksAvailable * 0.25);
    const peakWeeks = Math.floor(weeksAvailable * 0.08);
    const taperWeeks =
      weeksAvailable - baseWeeks - build1Weeks - build2Weeks - peakWeeks;

    let currentDate = startDate;
    const blocks = [];

    blocks.push(
      createBlock(
        "Base Building",
        "base",
        currentDate,
        baseWeeks,
        baseWeeklyTSS,
        goalId,
      ),
    );
    currentDate = addWeeks(currentDate, baseWeeks);

    blocks.push(
      createBlock(
        "Build Phase 1",
        "build",
        currentDate,
        build1Weeks,
        baseWeeklyTSS,
        goalId,
      ),
    );
    currentDate = addWeeks(currentDate, build1Weeks);

    blocks.push(
      createBlock(
        "Build Phase 2",
        "build",
        currentDate,
        build2Weeks,
        baseWeeklyTSS,
        goalId,
      ),
    );
    currentDate = addWeeks(currentDate, build2Weeks);

    blocks.push(
      createBlock(
        "Peak",
        "peak",
        currentDate,
        peakWeeks,
        baseWeeklyTSS,
        goalId,
      ),
    );
    currentDate = addWeeks(currentDate, peakWeeks);

    blocks.push(
      createBlock(
        "Taper",
        "taper",
        currentDate,
        taperWeeks,
        baseWeeklyTSS,
        goalId,
      ),
    );

    return blocks;
  }
}

function createBlock(
  name: string,
  phase: TrainingPhase,
  startDate: string,
  weeks: number,
  baseWeeklyTSS: number,
  goalId: string,
): TrainingBlock {
  const endDate = addDays(addWeeks(startDate, weeks), -1);
  const phaseConfig = PHASE_CHARACTERISTICS[phase];
  const targetTSS = baseWeeklyTSS * phaseConfig.tssMultiplier;

  return {
    id: generateUUID(),
    name,
    start_date: startDate,
    end_date: endDate,
    goal_ids: [goalId],
    phase,
    intensity_distribution: phaseConfig.intensity,
    target_weekly_tss_range: {
      min: Math.round(targetTSS * 0.85),
      max: Math.round(targetTSS * 1.15),
    },
    target_sessions_per_week_range: phaseConfig.sessionsPerWeek,
  };
}

/**
 * Convert wizard input to complete PeriodizedPlan
 */
export function wizardInputToPlan(
  input: WizardPeriodizedInput,
): Omit<PeriodizedPlan, "id" | "created_at" | "updated_at"> {
  // Validate input first
  if (!input.goals || input.goals.length === 0) {
    throw new Error("At least one goal is required to create a training plan");
  }

  // Validate goal dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const goal of input.goals) {
    if (!goal.name || goal.name.trim().length === 0) {
      throw new Error("Goal name cannot be empty");
    }

    const goalDate = new Date(goal.target_date);
    if (goalDate <= today) {
      throw new Error(
        `Goal date must be in the future. "${goal.name}" is set for ${goal.target_date}`,
      );
    }
  }

  const weeksAvailable = calculateWeeksUntil(
    input.goals[0]!.target_date,
    input.start_date,
  );

  if (weeksAvailable < 2) {
    throw new Error(
      `Not enough time to create a training plan. You need at least 2 weeks between start date and goal date. Currently: ${weeksAvailable} weeks`,
    );
  }

  // Validate activity distribution
  const activityTotal = Object.values(input.activities).reduce(
    (sum, v) => sum + v,
    0,
  );
  if (Math.abs(activityTotal - 1) > 0.01) {
    throw new Error("Activity percentages must sum to 100%");
  }

  // Resolve starting CTL
  const startingCTL = resolveFitnessInput(input.fitness);

  if (startingCTL <= 0) {
    throw new Error(
      "Starting fitness level must be greater than 0. Please provide your current weekly training hours or TSS.",
    );
  }

  // Create goals with UUIDs
  const goals: TrainingGoal[] = input.goals.map((g, index) => ({
    id: generateUUID(),
    name: g.name,
    target_date: g.target_date,
    priority: index + 1,
    targets: g.targets,
  }));

  // Get primary goal
  const primaryGoal = goals[0];

  if (!primaryGoal) {
    throw new Error("At least one goal is required");
  }

  // Determine experience level
  const experienceLevel = input.experience_level || "intermediate";

  // Generate blocks
  const blocks = generateGenericBlocks(
    primaryGoal.target_date,
    input.start_date,
    startingCTL,
    experienceLevel,
    primaryGoal.id,
  );

  // Calculate plan end date from last block
  const lastBlock = blocks[blocks.length - 1];
  if (!lastBlock) {
    throw new Error("Failed to generate blocks");
  }
  const planEndDate = lastBlock.end_date;

  // Normalize activity distribution
  const activityDistribution = normalizeActivityDistribution(input.activities);

  // Convert wizard constraints to full constraints
  const constraints: TrainingConstraints = {
    ...input.constraints,
    min_rest_days_per_week: input.constraints?.min_rest_days_per_week ?? 1,
  };

  // Generate plan name if not provided
  const planName = input.name || `${primaryGoal.name} Training Plan`;

  return {
    plan_type: "periodized",
    name: planName,
    start_date: input.start_date,
    end_date: planEndDate,
    goals,
    fitness_progression: {
      starting_ctl: startingCTL,
    },
    activity_distribution: activityDistribution,
    constraints,
    blocks,
    is_active: true,
  };
}

/**
 * Convert wizard input to maintenance plan
 */
export function wizardInputToMaintenancePlan(
  input: WizardMaintenanceInput,
): Omit<MaintenancePlan, "id" | "created_at" | "updated_at"> {
  const activityDistribution = normalizeActivityDistribution(input.activities);

  // Estimate TSS from target hours or sessions
  let targetTSSRange: { min: number; max: number } | undefined;

  if (input.target_weekly_hours) {
    const avgTSS = input.target_weekly_hours * 60; // Assume 60 TSS/hour
    targetTSSRange = {
      min: Math.round(avgTSS * 0.85),
      max: Math.round(avgTSS * 1.15),
    };
  }

  let targetSessionsRange: { min: number; max: number } | undefined;
  if (input.target_sessions_per_week) {
    targetSessionsRange = {
      min: Math.max(1, input.target_sessions_per_week - 1),
      max: input.target_sessions_per_week + 1,
    };
  }

  const constraints: TrainingConstraints = {
    ...input.constraints,
    min_rest_days_per_week: input.constraints?.min_rest_days_per_week ?? 1,
  };

  const intensityDistribution = input.intensity_preset
    ? INTENSITY_PRESETS[input.intensity_preset]
    : undefined;

  const planName = input.name || "Maintenance Training Plan";

  return {
    plan_type: "maintenance",
    name: planName,
    start_date: input.start_date,
    target_ctl_range: input.target_ctl_range,
    intensity_distribution: intensityDistribution,
    target_weekly_tss_range: targetTSSRange,
    target_sessions_per_week_range: targetSessionsRange,
    constraints,
    activity_distribution: activityDistribution,
    is_active: true,
  };
}

/**
 * ============================================================================
 * MESOCYCLE TYPE & FUNCTIONS
 * ============================================================================
 */

/**
 * Mesocycle represents a training phase/block with specific characteristics
 */
export const mesocycleSchema = z.object({
  name: z.string().min(1).max(100),
  phase: trainingPhaseEnum,
  duration_weeks: z.number().int().min(1).max(52),
  intensity_distribution: intensityDistributionSchema,
  tss_multiplier: z.number().min(0.1).max(3.0),
});

export type Mesocycle = z.infer<typeof mesocycleSchema>;

/**
 * Mesocycle Preset Keys
 */
export type MesocyclePresetKey =
  | "marathon_18wk"
  | "marathon_12wk"
  | "half_marathon_12wk"
  | "10k_8wk"
  | "base_building_8wk"
  | "custom";

/**
 * Predefined mesocycle presets for common training plans
 */
export const MESOCYCLE_PRESETS: Record<MesocyclePresetKey, Mesocycle[]> = {
  marathon_18wk: [
    {
      name: "Base Building",
      phase: "base",
      duration_weeks: 6,
      intensity_distribution: INTENSITY_PRESETS.polarized,
      tss_multiplier: 1.0,
    },
    {
      name: "Build Phase 1",
      phase: "build",
      duration_weeks: 5,
      intensity_distribution: INTENSITY_PRESETS.pyramidal,
      tss_multiplier: 1.15,
    },
    {
      name: "Build Phase 2",
      phase: "build",
      duration_weeks: 5,
      intensity_distribution: INTENSITY_PRESETS.threshold,
      tss_multiplier: 1.25,
    },
    {
      name: "Taper",
      phase: "taper",
      duration_weeks: 2,
      intensity_distribution: INTENSITY_PRESETS.polarized,
      tss_multiplier: 0.6,
    },
  ],
  marathon_12wk: [
    {
      name: "Base",
      phase: "base",
      duration_weeks: 4,
      intensity_distribution: INTENSITY_PRESETS.polarized,
      tss_multiplier: 1.0,
    },
    {
      name: "Build",
      phase: "build",
      duration_weeks: 6,
      intensity_distribution: INTENSITY_PRESETS.pyramidal,
      tss_multiplier: 1.2,
    },
    {
      name: "Taper",
      phase: "taper",
      duration_weeks: 2,
      intensity_distribution: INTENSITY_PRESETS.polarized,
      tss_multiplier: 0.6,
    },
  ],
  half_marathon_12wk: [
    {
      name: "Base",
      phase: "base",
      duration_weeks: 4,
      intensity_distribution: INTENSITY_PRESETS.polarized,
      tss_multiplier: 1.0,
    },
    {
      name: "Build",
      phase: "build",
      duration_weeks: 6,
      intensity_distribution: INTENSITY_PRESETS.pyramidal,
      tss_multiplier: 1.15,
    },
    {
      name: "Taper",
      phase: "taper",
      duration_weeks: 2,
      intensity_distribution: INTENSITY_PRESETS.polarized,
      tss_multiplier: 0.6,
    },
  ],
  "10k_8wk": [
    {
      name: "Base",
      phase: "base",
      duration_weeks: 3,
      intensity_distribution: INTENSITY_PRESETS.polarized,
      tss_multiplier: 1.0,
    },
    {
      name: "Build",
      phase: "build",
      duration_weeks: 4,
      intensity_distribution: INTENSITY_PRESETS.threshold,
      tss_multiplier: 1.1,
    },
    {
      name: "Taper",
      phase: "taper",
      duration_weeks: 1,
      intensity_distribution: INTENSITY_PRESETS.polarized,
      tss_multiplier: 0.6,
    },
  ],
  base_building_8wk: [
    {
      name: "Base Building",
      phase: "base",
      duration_weeks: 8,
      intensity_distribution: INTENSITY_PRESETS.polarized,
      tss_multiplier: 1.0,
    },
  ],
  custom: [],
};

/**
 * Get mesocycle preset options for UI selection
 */
export function getMesocyclePresetOptions(): Array<{
  key: MesocyclePresetKey;
  label: string;
  description: string;
  weeks: number;
}> {
  return [
    {
      key: "marathon_18wk",
      label: "Marathon (18 weeks)",
      description: "Classic 18-week marathon build",
      weeks: 18,
    },
    {
      key: "marathon_12wk",
      label: "Marathon (12 weeks)",
      description: "Accelerated marathon prep",
      weeks: 12,
    },
    {
      key: "half_marathon_12wk",
      label: "Half Marathon (12 weeks)",
      description: "Standard half marathon plan",
      weeks: 12,
    },
    {
      key: "10k_8wk",
      label: "10K (8 weeks)",
      description: "8-week 10K race preparation",
      weeks: 8,
    },
    {
      key: "base_building_8wk",
      label: "Base Building (8 weeks)",
      description: "Build aerobic foundation",
      weeks: 8,
    },
    {
      key: "custom",
      label: "Custom",
      description: "Start from scratch",
      weeks: 0,
    },
  ];
}

/**
 * Auto-generate mesocycles based on target date
 */
export function autoGenerateMesocycles(
  targetDate: string,
  startDate?: string,
): Mesocycle[] {
  const start = startDate ? new Date(startDate) : new Date();
  const target = new Date(targetDate);
  const weeksAvailable = Math.ceil(
    (target.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );

  // Handle different plan lengths
  if (weeksAvailable < 4) {
    // Very short plan - minimal taper only
    return [
      {
        name: "Final Preparation",
        phase: "taper",
        duration_weeks: Math.max(1, weeksAvailable),
        intensity_distribution: INTENSITY_PRESETS.polarized,
        tss_multiplier: 0.6,
      },
    ];
  } else if (weeksAvailable <= 8) {
    // Short plan (4-8 weeks)
    const buildWeeks = weeksAvailable - 2;
    const taperWeeks = 2;
    return [
      {
        name: "Build",
        phase: "build",
        duration_weeks: buildWeeks,
        intensity_distribution: INTENSITY_PRESETS.pyramidal,
        tss_multiplier: 1.1,
      },
      {
        name: "Taper",
        phase: "taper",
        duration_weeks: taperWeeks,
        intensity_distribution: INTENSITY_PRESETS.polarized,
        tss_multiplier: 0.6,
      },
    ];
  } else if (weeksAvailable <= 12) {
    // Medium plan (9-12 weeks)
    const baseWeeks = Math.floor(weeksAvailable * 0.3);
    const buildWeeks = weeksAvailable - baseWeeks - 2;
    const taperWeeks = 2;
    return [
      {
        name: "Base",
        phase: "base",
        duration_weeks: baseWeeks,
        intensity_distribution: INTENSITY_PRESETS.polarized,
        tss_multiplier: 1.0,
      },
      {
        name: "Build",
        phase: "build",
        duration_weeks: buildWeeks,
        intensity_distribution: INTENSITY_PRESETS.pyramidal,
        tss_multiplier: 1.15,
      },
      {
        name: "Taper",
        phase: "taper",
        duration_weeks: taperWeeks,
        intensity_distribution: INTENSITY_PRESETS.polarized,
        tss_multiplier: 0.6,
      },
    ];
  } else {
    // Long plan (13+ weeks)
    const baseWeeks = Math.floor(weeksAvailable * 0.35);
    const build1Weeks = Math.floor(weeksAvailable * 0.3);
    const build2Weeks = Math.floor(weeksAvailable * 0.25);
    const taperWeeks = weeksAvailable - baseWeeks - build1Weeks - build2Weeks;
    return [
      {
        name: "Base Building",
        phase: "base",
        duration_weeks: baseWeeks,
        intensity_distribution: INTENSITY_PRESETS.polarized,
        tss_multiplier: 1.0,
      },
      {
        name: "Build Phase 1",
        phase: "build",
        duration_weeks: build1Weeks,
        intensity_distribution: INTENSITY_PRESETS.pyramidal,
        tss_multiplier: 1.15,
      },
      {
        name: "Build Phase 2",
        phase: "build",
        duration_weeks: build2Weeks,
        intensity_distribution: INTENSITY_PRESETS.threshold,
        tss_multiplier: 1.25,
      },
      {
        name: "Taper",
        phase: "taper",
        duration_weeks: taperWeeks,
        intensity_distribution: INTENSITY_PRESETS.polarized,
        tss_multiplier: 0.6,
      },
    ];
  }
}

/**
 * ============================================================================
 * VALIDATION FUNCTIONS
 * ============================================================================
 */

export function validateWizardInput(input: WizardPeriodizedInput): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate goal dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const goal of input.goals) {
    const goalDate = new Date(goal.target_date);
    if (goalDate <= today) {
      errors.push(`Goal "${goal.name}" date must be in the future`);
    }
  }

  // Validate start date
  const startDate = new Date(input.start_date);
  if (startDate < today) {
    warnings.push("Plan start date is in the past");
  }

  // Validate activity percentages
  const activityTotal = Object.values(input.activities).reduce(
    (sum, v) => sum + v,
    0,
  );
  if (Math.abs(activityTotal - 1) > 0.01) {
    errors.push("Activity percentages must sum to 100%");
  }

  // Validate fitness input
  const hasValidFitness =
    input.fitness.starting_ctl !== undefined ||
    input.fitness.estimated_from_weekly_hours !== undefined ||
    input.fitness.estimated_from_weekly_tss !== undefined;

  if (!hasValidFitness) {
    errors.push(
      "Must provide starting fitness (CTL, weekly hours, or weekly TSS)",
    );
  }

  // Check if sufficient time for goals
  const primaryGoal = input.goals[0];
  if (primaryGoal) {
    const weeksAvailable = calculateWeeksUntil(
      primaryGoal.target_date,
      input.start_date,
    );
    if (weeksAvailable < 4) {
      warnings.push(
        `Only ${weeksAvailable} weeks until primary goal - may not be sufficient time`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate plan feasibility
 */
export function validatePlanFeasibility(plan: PeriodizedPlan): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check block continuity
  const sortedBlocks = [...plan.blocks].sort(
    (a, b) =>
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
  );

  for (let i = 0; i < sortedBlocks.length - 1; i++) {
    const currentBlock = sortedBlocks[i];
    const nextBlock = sortedBlocks[i + 1];
    if (!currentBlock || !nextBlock) continue;

    const currentEnd = new Date(currentBlock.end_date);
    const nextStart = new Date(nextBlock.start_date);
    const daysBetween = Math.floor(
      (nextStart.getTime() - currentEnd.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (daysBetween > 1) {
      warnings.push(`Gap of ${daysBetween} days between blocks`);
    }
  }

  // Check CTL progression
  const primaryGoal = getPrimaryGoal(plan.goals);
  if (plan.fitness_progression.target_ctl_at_peak) {
    const totalWeeks = calculateWeeks(plan.start_date, plan.end_date);
    const ctlIncrease =
      plan.fitness_progression.target_ctl_at_peak -
      plan.fitness_progression.starting_ctl;
    const weeklyIncrease = ctlIncrease / totalWeeks;

    if (weeklyIncrease > 8) {
      warnings.push(
        `CTL increase of ${weeklyIncrease.toFixed(1)} per week may be too aggressive`,
      );
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

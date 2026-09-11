import { z } from "zod";
import { canonicalActivityCategorySchema } from "../activity-category";
import { dateOnlySchema } from "../date-only";
import { canonicalGoalActivityCategorySchema } from "../goals/profile_goals";

/**
 * Training-plan goals deliberately retain multiple weighted targets. They are
 * distinct from profile goals, which own one canonical `objective`.
 */
export const trainingPlanGoalTargetSchema = z.discriminatedUnion("target_type", [
  z.object({
    target_type: z.literal("race_performance"),
    distance_m: z.number().positive(),
    target_time_s: z.number().int().positive(),
    activity_category: canonicalGoalActivityCategorySchema,
    weight: z.number().positive().finite().optional(),
  }),
  z.object({
    target_type: z.literal("pace_threshold"),
    target_speed_mps: z.number().positive(),
    test_duration_s: z.number().int().positive(),
    activity_category: canonicalGoalActivityCategorySchema,
    weight: z.number().positive().finite().optional(),
  }),
  z.object({
    target_type: z.literal("power_threshold"),
    target_watts: z.number().positive(),
    test_duration_s: z.number().int().positive(),
    activity_category: canonicalGoalActivityCategorySchema,
    weight: z.number().positive().finite().optional(),
  }),
  z.object({
    target_type: z.literal("hr_threshold"),
    target_lthr_bpm: z.number().int().positive(),
    weight: z.number().positive().finite().optional(),
  }),
]);

export const trainingPlanGoalSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  target_date: dateOnlySchema,
  priority: z.number().int().min(0).max(10).default(5),
  targets: z.array(trainingPlanGoalTargetSchema).min(1),
  target_performance: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type TrainingPlanGoal = z.infer<typeof trainingPlanGoalSchema>;
export type TrainingPlanGoalTarget = z.infer<typeof trainingPlanGoalTargetSchema>;

export const goalProjectionGoalSchema = z.object({
  name: z.string().max(100).default(""),
  target_date: dateOnlySchema,
  priority: z.number().int().min(0).max(10).default(5),
  targets: z.array(trainingPlanGoalTargetSchema).min(1),
});

export type GoalProjectionGoal = z.infer<typeof goalProjectionGoalSchema>;

/** Pure goal input for non-persistent projection scenarios. */
export const goalProjectionInputSchema = z
  .object({
    plan_start_date: dateOnlySchema.optional(),
    goals: z.array(goalProjectionGoalSchema).min(1),
  })
  .transform((data) => ({
    ...data,
    goals: data.goals.map((goal, index) => {
      const trimmed = goal.name.trim();
      return {
        ...goal,
        name: trimmed.length > 0 ? trimmed : `Goal #${index + 1}`,
      };
    }),
  }))
  .superRefine((data, ctx) => {
    if (!data.plan_start_date) {
      return;
    }

    const latestGoalDate = data.goals
      .map((goal) => goal.target_date)
      .sort((a, b) => a.localeCompare(b))
      .at(-1);

    if (!latestGoalDate) {
      return;
    }

    if (data.plan_start_date > latestGoalDate) {
      ctx.addIssue({
        code: "custom",
        path: ["plan_start_date"],
        message: `plan_start_date must be on or before the latest goal target_date (${latestGoalDate})`,
      });
    }
  });

export type GoalProjectionInput = z.infer<typeof goalProjectionInputSchema>;

export const trainingPlanSessionEventOverridesSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().min(1).max(1000).optional(),
    start_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "start_time must use HH:mm format")
      .optional(),
  })
  .strict();

export type TrainingPlanSessionEventOverrides = z.infer<
  typeof trainingPlanSessionEventOverridesSchema
>;

const trainingPlanStructureSessionShape = {
  offset_days: z.number().int().min(0),
  activity_plan_id: z.string().uuid(),
  event_overrides: trainingPlanSessionEventOverridesSchema.optional(),
};

export const trainingPlanStructureInputSessionSchema = z
  .object({
    ...trainingPlanStructureSessionShape,
    activity_plan_variant_id: z.string().uuid().optional(),
  })
  .strict();

export type TrainingPlanStructureInputSession = z.infer<
  typeof trainingPlanStructureInputSessionSchema
>;

export const canonicalTrainingPlanStructureSessionSchema = z
  .object({
    ...trainingPlanStructureSessionShape,
    activity_plan_variant_id: z.string().uuid(),
  })
  .strict();

export type CanonicalTrainingPlanStructureSession = z.infer<
  typeof canonicalTrainingPlanStructureSessionSchema
>;

export const trainingPlanGoalBlueprintSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    priority: z.number().int().min(0).max(10).default(10),
    activity_category: canonicalActivityCategorySchema.nullable().optional(),
    target_offset_days: z.number().int().min(0).optional(),
    objective: z.unknown().optional(),
  })
  .strict();

export type TrainingPlanGoalBlueprint = z.infer<typeof trainingPlanGoalBlueprintSchema>;

export const trainingPlanBuilderPlanningSnapshotSchema = z
  .object({
    version: z.literal(1),
    plan_preferences: z
      .object({
        duration_weeks: z.number().int().min(1).max(104).nullable(),
        weekly_session_count: z.number().int().min(1).max(14).nullable(),
        target_weekly_hours: z.number().min(0).max(168).nullable(),
        rest_days_per_week: z.number().int().min(0).max(7).nullable(),
        max_single_session_duration_minutes: z
          .number()
          .int()
          .min(20)
          .max(600)
          .nullable()
          .optional(),
        progression_pace: z.number().min(0).max(1).nullable().optional(),
        recovery_priority: z.number().min(0).max(1).nullable().optional(),
        week_pattern_preference: z.number().min(0).max(1).nullable().optional(),
        strength_integration_priority: z.number().min(0).max(1).nullable().optional(),
        double_day_tolerance: z.number().min(0).max(1).nullable().optional(),
        long_session_fatigue_tolerance: z.number().min(0).max(1).nullable().optional(),
        taper_style_preference: z.number().min(0).max(1).nullable().optional(),
      })
      .strict(),
    scheduling: z
      .object({
        preferred_weekdays: z.array(z.number().int().min(0).max(6)).max(7),
      })
      .strict(),
    goal_context: z
      .object({
        selected_goals: z
          .array(
            z
              .object({
                title: z.string(),
                target_offset_days: z.number().int().min(0).nullable(),
                target_date: dateOnlySchema.nullable().optional(),
                priority: z.number().int().min(0).max(10),
                activity_category: canonicalActivityCategorySchema.nullable(),
                objective: z.unknown().nullable(),
                source_profile_goal_id: z.string().min(1).nullable().optional(),
              })
              .strict(),
          )
          .default([]),
      })
      .strict(),
  })
  .strict();

export type TrainingPlanBuilderPlanningSnapshot = z.infer<
  typeof trainingPlanBuilderPlanningSnapshotSchema
>;

const trainingPlanStructureShape = {
  version: z.literal(1),
  activity_category: z.array(canonicalActivityCategorySchema).optional(),
  experienceLevel: z.array(z.enum(["beginner", "intermediate", "advanced"])).optional(),
  durationWeeks: z
    .object({
      recommended: z.number().int().min(1).max(104),
      minimum: z.number().int().min(1).max(104).optional(),
      maximum: z.number().int().min(1).max(104).optional(),
    })
    .strict()
    .optional(),
  goal_blueprints: z.array(trainingPlanGoalBlueprintSchema).optional(),
  builder_planning_snapshot: trainingPlanBuilderPlanningSnapshotSchema.optional(),
};

function rejectDuplicateTrainingPlanSessions(
  structure: {
    sessions: Array<{
      offset_days: number;
      activity_plan_id: string;
      activity_plan_variant_id?: string;
      event_overrides?: { start_time?: string };
    }>;
  },
  ctx: z.RefinementCtx,
) {
  const seenSessionKeys = new Set<string>();

  structure.sessions.forEach((session, index) => {
    const sessionKey = [
      session.offset_days,
      session.activity_plan_id,
      session.activity_plan_variant_id ?? "",
      session.event_overrides?.start_time ?? "",
    ].join("|");

    if (seenSessionKeys.has(sessionKey)) {
      ctx.addIssue({
        code: "custom",
        path: ["sessions", index],
        message:
          "Duplicate sessions cannot share activity_plan_id, activity_plan_variant_id, offset_days, and event_overrides.start_time",
      });
      return;
    }

    seenSessionKeys.add(sessionKey);
  });
}

/** Client/server input before the server pins each omitted activity-plan variant. */
export const trainingPlanCreateSchema = z
  .object({
    ...trainingPlanStructureShape,
    sessions: z.array(trainingPlanStructureInputSessionSchema).min(1),
  })
  .strict()
  .superRefine(rejectDuplicateTrainingPlanSessions);

export type TrainingPlanCreate = z.infer<typeof trainingPlanCreateSchema>;

/** Canonical structure accepted from persistence; every session has a stable variant identity. */
export const canonicalTrainingPlanStructureSchema = z
  .object({
    ...trainingPlanStructureShape,
    sessions: z.array(canonicalTrainingPlanStructureSessionSchema).min(1),
  })
  .strict()
  .superRefine(rejectDuplicateTrainingPlanSessions);

export type CanonicalTrainingPlanStructure = z.infer<typeof canonicalTrainingPlanStructureSchema>;

export const trainingPlanSchema = canonicalTrainingPlanStructureSchema.safeExtend({
  id: z.string().uuid(),
});

export type TrainingPlan = z.infer<typeof trainingPlanSchema>;

/** The only training-plan structure accepted from persistence at runtime. */
export const persistedTrainingPlanStructureSchema = trainingPlanSchema;

export type PersistedTrainingPlanStructure = z.infer<typeof persistedTrainingPlanStructureSchema>;

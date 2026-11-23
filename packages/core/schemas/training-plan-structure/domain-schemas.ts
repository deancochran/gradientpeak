import { z } from "zod";
import { activityPlanTrainingIntentSchema } from "../../activity-plan";
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

const weekdaySchema = z.number().int().min(0).max(6);

export const trainingPlanPreferencesSchema = z
  .object({
    weekly_session_count: z.number().int().min(1).max(14).nullable(),
    target_weekly_duration_minutes: z.number().int().min(1).max(10_080).nullable(),
    maximum_session_duration_minutes: z.number().int().min(1).max(600).nullable(),
    preferred_weekdays: z.array(weekdaySchema).max(7),
    rest_days: z.array(weekdaySchema).max(7),
    progression_style: z.enum(["conservative", "balanced", "ambitious"]).nullable(),
    recovery_priority: z.enum(["low", "balanced", "high"]).nullable(),
  })
  .strict()
  .superRefine((preferences, context) => {
    const preferred = new Set(preferences.preferred_weekdays);
    const rest = new Set(preferences.rest_days);
    if (preferred.size !== preferences.preferred_weekdays.length) {
      context.addIssue({
        code: "custom",
        path: ["preferred_weekdays"],
        message: "preferred_weekdays cannot contain duplicate weekdays",
      });
    }
    if (rest.size !== preferences.rest_days.length) {
      context.addIssue({
        code: "custom",
        path: ["rest_days"],
        message: "rest_days cannot contain duplicate weekdays",
      });
    }
    if ([...preferred].some((weekday) => rest.has(weekday))) {
      context.addIssue({
        code: "custom",
        path: ["rest_days"],
        message: "preferred_weekdays and rest_days cannot overlap",
      });
    }
  });

export type TrainingPlanPreferences = z.infer<typeof trainingPlanPreferencesSchema>;

export const sessionDemandSchema = z
  .object({
    activity_category: canonicalActivityCategorySchema,
    training_intent: activityPlanTrainingIntentSchema,
    target_duration_minutes: z.number().int().min(1).max(600).nullable(),
    target_common_load: z.number().finite().min(0).max(10_000).nullable(),
    importance: z.enum(["support", "normal", "key"]),
  })
  .strict();

export type SessionDemand = z.infer<typeof sessionDemandSchema>;

export const canonicalTrainingPlanStructureSessionSchema = z
  .object({
    id: z.string().uuid(),
    offset_days: z.number().int().min(0),
    demand: sessionDemandSchema,
    activity_plan_id: z.string().uuid().nullable(),
    event_overrides: trainingPlanSessionEventOverridesSchema.optional(),
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

export const canonicalTrainingPlanStructureSchema = z
  .object({
    version: z.literal(1),
    plan_preferences: trainingPlanPreferencesSchema,
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
    sessions: z.array(canonicalTrainingPlanStructureSessionSchema).min(1).max(366),
  })
  .strict()
  .superRefine((structure, ctx) => {
    const seenSessionIds = new Set<string>();

    structure.sessions.forEach((session, index) => {
      if (seenSessionIds.has(session.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["sessions", index, "id"],
          message: "Duplicate sessions cannot share an id",
        });
        return;
      }

      seenSessionIds.add(session.id);
    });
  });

export type CanonicalTrainingPlanStructure = z.infer<typeof canonicalTrainingPlanStructureSchema>;

export const trainingPlanCreateSchema = canonicalTrainingPlanStructureSchema;

export type TrainingPlanCreate = z.infer<typeof trainingPlanCreateSchema>;

export const trainingPlanSchema = canonicalTrainingPlanStructureSchema.safeExtend({
  id: z.string().uuid(),
});

export type TrainingPlan = z.infer<typeof trainingPlanSchema>;

/** The only training-plan structure accepted from persistence at runtime. */
export const persistedTrainingPlanStructureSchema = trainingPlanSchema;

export type PersistedTrainingPlanStructure = z.infer<typeof persistedTrainingPlanStructureSchema>;

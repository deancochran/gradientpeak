import { z } from "zod";

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
const targetWeightSchema = z.number().positive().finite().optional();

export const goalTargetV2Schema = z.discriminatedUnion("target_type", [
  z.object({
    target_type: z.literal("race_performance"),
    distance_m: z.number().positive(),
    target_time_s: z.number().int().positive(),
    activity_category: targetActivityCategoryEnum,
    weight: targetWeightSchema,
  }),
  z.object({
    target_type: z.literal("pace_threshold"),
    target_speed_mps: z.number().positive(),
    test_duration_s: z.number().int().positive(),
    activity_category: targetActivityCategoryEnum,
    weight: targetWeightSchema,
  }),
  z.object({
    target_type: z.literal("power_threshold"),
    target_watts: z.number().positive(),
    test_duration_s: z.number().int().positive(),
    activity_category: targetActivityCategoryEnum,
    weight: targetWeightSchema,
  }),
  z.object({
    target_type: z.literal("hr_threshold"),
    target_lthr_bpm: z.number().int().positive(),
    weight: targetWeightSchema,
  }),
]);

export type GoalTargetV2 = z.infer<typeof goalTargetV2Schema>;

export const goalV2Schema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.number().int().min(0).max(10).default(5),
  targets: z.array(goalTargetV2Schema).min(1),
  target_performance: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const trainingGoalSchema = goalV2Schema;

export type GoalV2 = z.infer<typeof goalV2Schema>;

export type TrainingGoal = z.infer<typeof trainingGoalSchema>;

export const minimalTrainingGoalCreateSchema = z.object({
  name: z.string().max(100).default(""),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.number().int().min(0).max(10).default(5),
  targets: z.array(goalTargetV2Schema).min(1),
});

export type MinimalTrainingGoalCreate = z.infer<
  typeof minimalTrainingGoalCreateSchema
>;

export const minimalTrainingPlanCreateSchema = z
  .object({
    plan_start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    goals: z.array(minimalTrainingGoalCreateSchema).min(1),
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

export type MinimalTrainingPlanCreate = z.infer<
  typeof minimalTrainingPlanCreateSchema
>;

function createMinMaxRangeSchema(
  minSchema: z.ZodNumber,
  maxSchema: z.ZodNumber,
) {
  return z
    .object({
      min: minSchema,
      max: maxSchema,
    })
    .refine((data) => data.max >= data.min);
}

const nonNegativeNumberRangeSchema = createMinMaxRangeSchema(
  z.number().min(0),
  z.number().min(0),
);

const weeklySessionsRangeSchema = createMinMaxRangeSchema(
  z.number().int().min(0).max(21),
  z.number().int().min(0).max(21),
);

const maintenanceWeeklySessionsRangeSchema = createMinMaxRangeSchema(
  z.number().int().min(0),
  z.number().int().min(0),
);

const ctlRangeSchema = createMinMaxRangeSchema(
  z.number().min(0).max(250),
  z.number().min(0).max(250),
);

export const trainingBlockSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goal_ids: z.array(z.string().uuid()).default([]),
  phase: trainingPhaseEnum,
  intensity_distribution: intensityDistributionSchema.optional(),
  target_weekly_tss_range: nonNegativeNumberRangeSchema,
  target_sessions_per_week_range: weeklySessionsRangeSchema.optional(),
  description: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type TrainingBlock = z.infer<typeof trainingBlockSchema>;

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

export const fitnessProgressionSchema = z.object({
  starting_ctl: z.number().min(0).max(250),
  target_ctl_at_peak: z.number().min(0).max(250).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type FitnessProgression = z.infer<typeof fitnessProgressionSchema>;

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

const periodizedPlanBaseShape = {
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
};

type PeriodizedPlanRefinementInput = {
  start_date: string;
  end_date: string;
  goals: Array<{ id: string }>;
  blocks: Array<{ start_date: string; end_date: string; goal_ids: string[] }>;
};

function hasNoOverlappingBlocks(data: PeriodizedPlanRefinementInput): boolean {
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
}

function blocksAreWithinPlanDateBounds(
  data: PeriodizedPlanRefinementInput,
): boolean {
  const planStart = new Date(data.start_date);
  const planEnd = new Date(data.end_date);

  return data.blocks.every((block) => {
    const blockStart = new Date(block.start_date);
    const blockEnd = new Date(block.end_date);
    return blockStart >= planStart && blockEnd <= planEnd;
  });
}

function blocksReferenceExistingGoalIds(
  data: PeriodizedPlanRefinementInput,
): boolean {
  const goalIds = new Set(data.goals.map((g) => g.id));
  const referencedIds = data.blocks.flatMap((b) => b.goal_ids);
  return referencedIds.every((id) => goalIds.has(id));
}

function applyPeriodizedBlockRefinements<
  T extends z.ZodType<PeriodizedPlanRefinementInput>,
>(schema: T) {
  return schema
    .refine((data) => hasNoOverlappingBlocks(data), {
      message: "Training blocks cannot overlap",
    })
    .refine((data) => blocksAreWithinPlanDateBounds(data), {
      message: "All blocks must fall within plan dates",
    })
    .refine((data) => blocksReferenceExistingGoalIds(data), {
      message: "Blocks reference non-existent goal IDs",
    });
}

export const periodizedPlanCreateSchema = applyPeriodizedBlockRefinements(
  z.object(periodizedPlanBaseShape),
);

export const periodizedPlanSchema = applyPeriodizedBlockRefinements(
  z.object({
    ...periodizedPlanBaseShape,
    id: z.string().uuid(),
  }),
);

export type PeriodizedPlan = z.infer<typeof periodizedPlanSchema>;

const maintenancePlanBaseShape = {
  plan_type: z.literal("maintenance"),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  target_ctl_range: ctlRangeSchema.optional(),
  intensity_distribution: intensityDistributionSchema.optional(),
  target_weekly_tss_range: nonNegativeNumberRangeSchema.optional(),
  target_sessions_per_week_range:
    maintenanceWeeklySessionsRangeSchema.optional(),
  constraints: trainingConstraintsSchema.optional(),
  activity_distribution: activityDistributionSchema,
  is_active: z.boolean().default(true),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
};

export const maintenancePlanCreateSchema = z.object(maintenancePlanBaseShape);

export const maintenancePlanSchema = z.object({
  ...maintenancePlanBaseShape,
  id: z.string().uuid(),
});

export type MaintenancePlan = z.infer<typeof maintenancePlanSchema>;

export const trainingPlanCreateSchema = z.discriminatedUnion("plan_type", [
  periodizedPlanCreateSchema,
  maintenancePlanCreateSchema,
]);

export type TrainingPlanCreate = z.infer<typeof trainingPlanCreateSchema>;

export const trainingPlanSchema = z.discriminatedUnion("plan_type", [
  periodizedPlanSchema,
  maintenancePlanSchema,
]);

export type TrainingPlan = z.infer<typeof trainingPlanSchema>;

export const wizardGoalInputSchema = z.object({
  name: z.string().max(100).default(""),
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
  goals: z
    .array(wizardGoalInputSchema)
    .min(1)
    .transform((goals) =>
      goals.map((goal, index) => {
        const trimmed = goal.name.trim();
        return {
          ...goal,
          name: trimmed.length > 0 ? trimmed : `Goal #${index + 1}`,
        };
      }),
    ),
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

export function isPeriodizedPlan(plan: TrainingPlan): plan is PeriodizedPlan {
  return plan.plan_type === "periodized";
}

export function isMaintenancePlan(plan: TrainingPlan): plan is MaintenancePlan {
  return plan.plan_type === "maintenance";
}

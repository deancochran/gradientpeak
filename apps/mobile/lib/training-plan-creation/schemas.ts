import { canonicalGoalActivityCategorySchema, canonicalGoalObjectiveSchema } from "@repo/core";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export const trainingPlanBuilderDetailsSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    templateVisibility: z.enum(["private", "public"]),
  })
  .strict();

export const trainingPlanBuilderScenarioAssumptionsSchema = z
  .object({
    label: z.string(),
    weeklyAvailabilityDays: z.number().int().min(0).max(7).nullable(),
    maxWeeklyLoadRampPct: z.number().min(0).max(100).nullable(),
  })
  .strict();

export const trainingPlanBuilderGoalSchema = z
  .object({
    localId: z.string().min(1),
    title: z.string(),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    priority: z.number().int().min(0).max(10).default(10),
    activityCategory: canonicalGoalActivityCategorySchema.nullable(),
    objective: canonicalGoalObjectiveSchema.nullable(),
  })
  .strict();

export const trainingPlanActivityPlanFactsSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1),
    published: z.boolean(),
    accessible: z.boolean(),
    estimatedTss: z.number().min(0).nullable(),
    estimatedDurationSeconds: z.number().int().min(0).nullable(),
  })
  .strict();

export const trainingPlanBuilderEventOverridesSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().min(1).max(1000).optional(),
    start_time: z.string().optional(),
  })
  .strict();

export const trainingPlanBuilderSessionSchema = z
  .object({
    localId: z.string().min(1),
    offsetDays: z.number().int(),
    activityPlan: trainingPlanActivityPlanFactsSchema.nullable(),
    eventOverrides: trainingPlanBuilderEventOverridesSchema.optional(),
  })
  .strict();

export const trainingPlanBuilderSelectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("overview") }).strict(),
  z.object({ type: z.literal("session"), sessionId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("goal"), goalId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("assumptions") }).strict(),
  z.object({ type: z.literal("planCheck"), planCheckId: z.string().min(1) }).strict(),
]);

export const trainingPlanBuilderStateSchema = z
  .object({
    details: trainingPlanBuilderDetailsSchema,
    scenarioAssumptions: trainingPlanBuilderScenarioAssumptionsSchema,
    goals: z.array(trainingPlanBuilderGoalSchema),
    schedule: z
      .object({
        sessions: z.array(trainingPlanBuilderSessionSchema),
      })
      .strict(),
    selection: trainingPlanBuilderSelectionSchema,
  })
  .strict();

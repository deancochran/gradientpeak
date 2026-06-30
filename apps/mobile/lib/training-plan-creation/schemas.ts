import {
  athletePlanningContextSchema,
  dateOnlySchema,
  plannedTrainingActivityPlanFactsSchema,
  plannedTrainingEventOverridesSchema,
  plannedTrainingSessionIntentSchema,
  plannedTrainingSessionSchema,
  planningGoalSchema,
  planningPreferencesSchema,
  planningScheduleSchema,
  planningTrainingPlanCreateInputSchema,
  planningTrainingPlanUpdateInputSchema,
} from "@repo/core";
import { z } from "zod";

export const trainingPlanBuilderDetailsSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    templateVisibility: z.enum(["private", "public"]),
  })
  .strict();

export const trainingPlanBuilderGoalBlueprintSchema = planningGoalSchema;

export const trainingPlanBuilderGoalContextSchema = z
  .object({
    selectedGoals: z.array(trainingPlanBuilderGoalBlueprintSchema),
  })
  .strict();

export const trainingPlanBuilderProfileGoalDraftSchema = z
  .object({
    title: z.string().trim().min(1, "Goal title is required."),
  })
  .strict();

export const trainingPlanBuilderPlanPreferencesSchema = planningPreferencesSchema;

export const trainingPlanActivityPlanFactsSchema = plannedTrainingActivityPlanFactsSchema;

export const trainingPlanBuilderEventOverridesSchema = plannedTrainingEventOverridesSchema;

export const trainingPlanBuilderSessionIntentSchema = plannedTrainingSessionIntentSchema;

export const trainingPlanBuilderSessionSchema = plannedTrainingSessionSchema;

export const trainingPlanBuilderSchedulingSchema = planningScheduleSchema;

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
    anchorDate: dateOnlySchema,
    athleteContext: athletePlanningContextSchema,
    planPreferences: trainingPlanBuilderPlanPreferencesSchema,
    goalContext: trainingPlanBuilderGoalContextSchema,
    structure: z
      .object({
        sessions: z.array(trainingPlanBuilderSessionSchema),
      })
      .strict(),
    scheduling: trainingPlanBuilderSchedulingSchema,
    selection: trainingPlanBuilderSelectionSchema,
  })
  .strict();

export const trainingPlanFinalCreatePayloadSchema = planningTrainingPlanCreateInputSchema;

export const trainingPlanFinalUpdatePayloadSchema = planningTrainingPlanUpdateInputSchema;

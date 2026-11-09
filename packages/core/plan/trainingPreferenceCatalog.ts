import { z } from "zod";
import { trainingPlanPreferencesSchema } from "./trainingPlanPreferences";

export const trainingPlanPreferenceTabSchema = z.enum(["schedule", "training_style", "recovery"]);

export const trainingPlanPreferenceControlSchema = z.enum([
  "integer-stepper",
  "bounded-number",
  "weekday-list",
  "select",
]);

export const trainingPlanPreferenceFieldSchema = z
  .object({
    key: z.string().min(1),
    tab: trainingPlanPreferenceTabSchema,
    label: z.string().min(1),
    control: trainingPlanPreferenceControlSchema,
    unit: z.string().nullable(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
  })
  .strict();

export type TrainingPlanPreferenceField = z.infer<typeof trainingPlanPreferenceFieldSchema>;
export type TrainingPlanPreferenceTab = z.infer<typeof trainingPlanPreferenceTabSchema>;

const preferenceKeys = trainingPlanPreferencesSchema.keyof();

function field(input: TrainingPlanPreferenceField) {
  return trainingPlanPreferenceFieldSchema.parse({
    ...input,
    key: preferenceKeys.parse(input.key),
  });
}

/** The complete catalog of supported plan-owned preference controls. */
export const trainingPreferenceCatalog = [
  field({
    key: "weekly_session_count",
    tab: "schedule",
    label: "Sessions per week",
    control: "integer-stepper",
    unit: null,
    min: 1,
    max: 14,
    step: 1,
  }),
  field({
    key: "target_weekly_duration_minutes",
    tab: "schedule",
    label: "Target weekly duration",
    control: "bounded-number",
    unit: "min",
    min: 1,
    max: 10_080,
    step: 15,
  }),
  field({
    key: "maximum_session_duration_minutes",
    tab: "schedule",
    label: "Maximum session duration",
    control: "integer-stepper",
    unit: "min",
    min: 1,
    max: 600,
    step: 5,
  }),
  field({
    key: "preferred_weekdays",
    tab: "schedule",
    label: "Preferred weekdays",
    control: "weekday-list",
    unit: null,
  }),
  field({
    key: "rest_days",
    tab: "schedule",
    label: "Rest days",
    control: "weekday-list",
    unit: null,
  }),
  field({
    key: "progression_style",
    tab: "training_style",
    label: "Progression style",
    control: "select",
    unit: null,
  }),
  field({
    key: "recovery_priority",
    tab: "recovery",
    label: "Recovery priority",
    control: "select",
    unit: null,
  }),
] as const satisfies readonly TrainingPlanPreferenceField[];

export const trainingPlanPreferenceTabs = trainingPlanPreferenceTabSchema.options;

export function getTrainingPreferenceCatalogForTab(tab: TrainingPlanPreferenceTab) {
  return trainingPreferenceCatalog.filter((field) => field.tab === tab);
}

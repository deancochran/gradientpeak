import {
  type AthleteTrainingSettings,
  type CreationAvailabilityConfig,
  countAvailableTrainingDays,
  MAX_SAFE_CTL_RAMP_PER_WEEK,
  MAX_SAFE_WEEKLY_TSS_RAMP_PCT,
  MIN_PREP_DAYS_BETWEEN_GOALS,
  parseDateOnly,
  type TrainingPlanFormForValidation,
  type TrainingPlanFormGoalValidationData,
  trainingPlanFormGoalValidationSchema,
  validateTrainingPlanFormGoals,
} from "@repo/core";

export { MAX_SAFE_CTL_RAMP_PER_WEEK, MAX_SAFE_WEEKLY_TSS_RAMP_PCT, MIN_PREP_DAYS_BETWEEN_GOALS };

export const trainingPlanFormSchema = trainingPlanFormGoalValidationSchema;

export type TrainingPlanFormSchemaData = TrainingPlanFormGoalValidationData;
export type TrainingPlanGoalSchemaData = TrainingPlanFormSchemaData["goals"][number];
export type TrainingPlanGoalTargetSchemaData = TrainingPlanGoalSchemaData["targets"][number];

export function validateTrainingPlanForm(
  formData: TrainingPlanFormForValidation,
): Record<string, string> {
  return validateTrainingPlanFormGoals(formData);
}

export function getAvailableTrainingDays(config: {
  availabilityConfig: CreationAvailabilityConfig;
  constraints: {
    hard_rest_days: CreationAvailabilityConfig["days"][number]["day"][];
  };
}): number {
  return countAvailableTrainingDays({
    availabilityDays: config.availabilityConfig.days,
    hardRestDays: config.constraints.hard_rest_days,
    requirePositiveMaxSessions: true,
  });
}

export function getPlanStartDateFromProfileSettings(
  settings: AthleteTrainingSettings,
): string | undefined {
  const firstAvailableDay = settings.availability.weekly_windows.find(
    (day) => day.windows.length > 0,
  );

  if (!firstAvailableDay) {
    return undefined;
  }

  return parseDateOnly(undefined);
}

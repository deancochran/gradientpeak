import {
  type TrainingPlanPreferences,
  trainingPlanPreferencesSchema,
} from "../schemas/training-plan-structure";

export { type TrainingPlanPreferences, trainingPlanPreferencesSchema };

export type TrainingPlanPreferenceFieldKey = keyof TrainingPlanPreferences;

export type TrainingPlanPreferenceValidationCode =
  | "sessions_and_rest_days_exceed_week"
  | "weekly_duration_exceeds_session_capacity";

export type TrainingPlanPreferenceValidationIssue = {
  code: TrainingPlanPreferenceValidationCode;
  message: string;
  fields: TrainingPlanPreferenceFieldKey[];
};

/** Validates only constraints expressed by the plan-owned preference contract. */
export function validateTrainingPlanPreferences(
  preferences: TrainingPlanPreferences,
): TrainingPlanPreferenceValidationIssue[] {
  const issues: TrainingPlanPreferenceValidationIssue[] = [];
  const weeklySessionCount = preferences.weekly_session_count;
  const restDays = preferences.rest_days.length;

  if (weeklySessionCount !== null && weeklySessionCount + restDays > 7) {
    issues.push({
      code: "sessions_and_rest_days_exceed_week",
      message: "Sessions per week plus rest days cannot exceed seven days.",
      fields: ["weekly_session_count", "rest_days"],
    });
  }

  if (
    weeklySessionCount !== null &&
    preferences.target_weekly_duration_minutes !== null &&
    preferences.maximum_session_duration_minutes !== null &&
    preferences.target_weekly_duration_minutes >
      weeklySessionCount * preferences.maximum_session_duration_minutes
  ) {
    issues.push({
      code: "weekly_duration_exceeds_session_capacity",
      message:
        "Weekly duration exceeds the capacity of the planned sessions at the maximum duration.",
      fields: [
        "weekly_session_count",
        "target_weekly_duration_minutes",
        "maximum_session_duration_minutes",
      ],
    });
  }

  return issues;
}

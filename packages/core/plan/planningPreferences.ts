import { z } from "zod";
import {
  type CreationConstraints,
  creationConstraintsSchema,
} from "../schemas/training_plan_structure";

export const planningPreferencesSchema = z
  .object({
    durationWeeks: z.number().int().min(1).max(104).nullable(),
    weeklySessionCount: z.number().int().min(1).max(14).nullable(),
    targetWeeklyHours: z.number().min(0).max(168).nullable(),
    restDaysPerWeek: z.number().int().min(0).max(7).nullable(),
  })
  .strict();

export type PlanningPreferences = z.infer<typeof planningPreferencesSchema>;

export type PlanningPreferenceFieldKey = keyof PlanningPreferences;

export type TrainingDoseLimitFieldKey =
  | "min_sessions_per_week"
  | "max_sessions_per_week"
  | "max_single_session_duration_minutes"
  | "max_weekly_duration_minutes";

export type TrainingPreferenceValidationFieldKey =
  | PlanningPreferenceFieldKey
  | TrainingDoseLimitFieldKey;

export type TrainingPreferenceValidationSeverity = "blocking" | "warning";

export type TrainingPreferenceValidationCode =
  | "min_sessions_exceeds_max_sessions"
  | "single_session_exceeds_weekly_budget"
  | "sessions_and_rest_days_exceed_week"
  | "average_session_duration_exceeds_budget"
  | "high_average_session_duration";

export interface TrainingPreferenceValidationIssue<
  TField extends TrainingPreferenceValidationFieldKey = TrainingPreferenceValidationFieldKey,
> {
  code: TrainingPreferenceValidationCode;
  severity: TrainingPreferenceValidationSeverity;
  message: string;
  fields: TField[];
}

export interface PlanningPreferenceFieldMetadata {
  key: PlanningPreferenceFieldKey;
  label: string;
  shortLabel: string;
  unit: string | null;
  min: number;
  max: number;
  step: number;
  helperText: string;
  requiredDefault: number;
}

export const PLANNING_PREFERENCE_FIELD_METADATA: Record<
  PlanningPreferenceFieldKey,
  PlanningPreferenceFieldMetadata
> = {
  durationWeeks: {
    key: "durationWeeks",
    label: "Plan duration",
    shortLabel: "Duration",
    unit: "weeks",
    min: 1,
    max: 104,
    step: 1,
    helperText: "How many weeks this plan-local override should cover.",
    requiredDefault: 4,
  },
  weeklySessionCount: {
    key: "weeklySessionCount",
    label: "Sessions per week",
    shortLabel: "Sessions",
    unit: null,
    min: 1,
    max: 14,
    step: 1,
    helperText: "Target workout frequency for this plan only.",
    requiredDefault: 3,
  },
  targetWeeklyHours: {
    key: "targetWeeklyHours",
    label: "Weekly time budget",
    shortLabel: "Weekly time",
    unit: "hr",
    min: 0,
    max: 168,
    step: 0.5,
    helperText: "Optional time budget used to shape plan load and session sizing.",
    requiredDefault: 5,
  },
  restDaysPerWeek: {
    key: "restDaysPerWeek",
    label: "Rest days per week",
    shortLabel: "Rest days",
    unit: "days",
    min: 0,
    max: 7,
    step: 1,
    helperText: "Days the builder should avoid when distributing sessions.",
    requiredDefault: 2,
  },
};

export interface TrainingDoseLimitsInput {
  min_sessions_per_week?: number | null;
  max_sessions_per_week?: number | null;
  max_single_session_duration_minutes?: number | null;
  max_weekly_duration_minutes?: number | null;
}

function finiteOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validateTrainingDoseLimitsConsistency(
  input: TrainingDoseLimitsInput,
): Array<TrainingPreferenceValidationIssue<TrainingDoseLimitFieldKey>> {
  const minSessions = finiteOrNull(input.min_sessions_per_week) ?? 0;
  const maxSessions = finiteOrNull(input.max_sessions_per_week) ?? 0;
  const maxSingleSessionDuration = finiteOrNull(input.max_single_session_duration_minutes);
  const maxWeeklyDuration = finiteOrNull(input.max_weekly_duration_minutes);
  const issues: Array<TrainingPreferenceValidationIssue<TrainingDoseLimitFieldKey>> = [];

  if (minSessions > maxSessions) {
    issues.push({
      code: "min_sessions_exceeds_max_sessions",
      severity: "blocking",
      message: "Fewest sessions per week cannot be higher than most sessions per week.",
      fields: ["min_sessions_per_week", "max_sessions_per_week"],
    });
  }

  if (
    maxSingleSessionDuration !== null &&
    maxWeeklyDuration !== null &&
    maxSingleSessionDuration > maxWeeklyDuration
  ) {
    issues.push({
      code: "single_session_exceeds_weekly_budget",
      severity: "blocking",
      message: "Weekly time budget must be at least as long as your longest activity.",
      fields: ["max_single_session_duration_minutes", "max_weekly_duration_minutes"],
    });
  }

  return issues;
}

export function validatePlanningPreferencesConsistency(
  preferences: PlanningPreferences,
): Array<TrainingPreferenceValidationIssue<PlanningPreferenceFieldKey>> {
  const weeklySessionCount = finiteOrNull(preferences.weeklySessionCount);
  const targetWeeklyHours = finiteOrNull(preferences.targetWeeklyHours);
  const restDaysPerWeek = finiteOrNull(preferences.restDaysPerWeek);
  const issues: Array<TrainingPreferenceValidationIssue<PlanningPreferenceFieldKey>> = [];

  if (
    weeklySessionCount !== null &&
    restDaysPerWeek !== null &&
    weeklySessionCount + restDaysPerWeek > 7
  ) {
    issues.push({
      code: "sessions_and_rest_days_exceed_week",
      severity: "blocking",
      message: "Sessions per week plus rest days cannot exceed seven days.",
      fields: ["weeklySessionCount", "restDaysPerWeek"],
    });
  }

  if (weeklySessionCount !== null && targetWeeklyHours !== null && weeklySessionCount > 0) {
    const averageSessionMinutes = (targetWeeklyHours * 60) / weeklySessionCount;

    if (averageSessionMinutes > 600) {
      issues.push({
        code: "average_session_duration_exceeds_budget",
        severity: "blocking",
        message: "Weekly time creates sessions longer than the supported ten-hour planning limit.",
        fields: ["weeklySessionCount", "targetWeeklyHours"],
      });
    } else if (averageSessionMinutes > 240) {
      issues.push({
        code: "high_average_session_duration",
        severity: "warning",
        message:
          "Weekly time implies very long average sessions. Review the session count or time budget.",
        fields: ["weeklySessionCount", "targetWeeklyHours"],
      });
    }
  }

  return issues;
}

const CREATION_CONSTRAINT_WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function mapPlanningPreferencesToCreationConstraints({
  preferences,
  preferredWeekdays,
}: {
  preferences: PlanningPreferences;
  preferredWeekdays: number[];
}): CreationConstraints {
  const preferredWeekdaySet = new Set(preferredWeekdays);
  const hardRestDays =
    preferredWeekdaySet.size > 0
      ? CREATION_CONSTRAINT_WEEKDAYS.filter((_, index) => !preferredWeekdaySet.has(index))
      : preferences.restDaysPerWeek !== null
        ? CREATION_CONSTRAINT_WEEKDAYS.slice(0, preferences.restDaysPerWeek)
        : [];

  return creationConstraintsSchema.parse({
    hard_rest_days: hardRestDays,
    ...(preferences.weeklySessionCount !== null
      ? {
          min_sessions_per_week: Math.max(0, preferences.weeklySessionCount - 1),
          max_sessions_per_week: preferences.weeklySessionCount,
        }
      : {}),
    goal_difficulty_preference: "balanced",
  });
}

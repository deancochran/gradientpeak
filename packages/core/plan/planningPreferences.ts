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

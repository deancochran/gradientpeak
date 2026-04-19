import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import {
  creationWeekDayEnum,
  type TrainingPlanCreationConfig,
} from "../schemas/training_plan_structure";
import { normalizeCreationConfig } from "./normalizeCreationConfig";

type ProjectionRelevantCreationDefaults = Pick<
  TrainingPlanCreationConfig,
  "availability_config" | "constraints" | "post_goal_recovery_days" | "behavior_controls_v1"
>;

export function mapAthletePreferencesToCreationDefaults(
  preferences: AthletePreferenceProfile,
): ProjectionRelevantCreationDefaults {
  const baseline = normalizeCreationConfig({});
  const availabilityByDay = new Map(
    preferences.availability.weekly_windows.map((dayConfig) => [dayConfig.day, dayConfig]),
  );

  return {
    availability_config: {
      template: "custom",
      days: creationWeekDayEnum.options.map((day) => {
        const dayConfig = availabilityByDay.get(day);
        return {
          day,
          windows: dayConfig?.windows ?? [],
          ...(dayConfig?.max_sessions !== undefined
            ? { max_sessions: dayConfig.max_sessions }
            : {}),
        };
      }),
    },
    constraints: {
      ...baseline.constraints,
      hard_rest_days: preferences.availability.hard_rest_days,
      min_sessions_per_week: preferences.dose_limits.min_sessions_per_week,
      max_sessions_per_week: preferences.dose_limits.max_sessions_per_week,
      max_single_session_duration_minutes:
        preferences.dose_limits.max_single_session_duration_minutes,
    },
    post_goal_recovery_days: preferences.recovery_preferences.post_goal_recovery_days,
    behavior_controls_v1: {
      ...baseline.behavior_controls_v1,
      aggressiveness: preferences.training_style.progression_pace,
      variability: preferences.training_style.week_pattern_preference,
      recovery_priority: preferences.recovery_preferences.recovery_priority,
    },
  };
}

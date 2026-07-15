import { type AthleteTrainingSettings, defaultAthletePreferenceProfile } from "@repo/core";
import type {
  CompactTrainingPreferencesValue,
  TrainingPreferencePreset,
} from "@/components/settings/training-preferences/compactTrainingPreferences";
import { TRAINING_PREFERENCE_PRESET_VALUES } from "@/components/settings/training-preferences/compactTrainingPreferences";
import type { OnboardingData } from "./types";

export function getCompactTrainingPreferencesValue(
  settings: AthleteTrainingSettings,
): CompactTrainingPreferencesValue {
  const progressionPace = settings.training_style.progression_pace;
  const preset = (
    Object.entries(TRAINING_PREFERENCE_PRESET_VALUES) as Array<[TrainingPreferencePreset, number]>
  ).reduce((closest, candidate) =>
    Math.abs(candidate[1] - progressionPace) < Math.abs(closest[1] - progressionPace)
      ? candidate
      : closest,
  )[0];

  return {
    preset,
    minSessionsPerWeek:
      settings.dose_limits.min_sessions_per_week ??
      defaultAthletePreferenceProfile.dose_limits.min_sessions_per_week ??
      3,
    maxSessionsPerWeek:
      settings.dose_limits.max_sessions_per_week ??
      defaultAthletePreferenceProfile.dose_limits.max_sessions_per_week ??
      4,
    maxSingleSessionMinutes:
      settings.dose_limits.max_single_session_duration_minutes ??
      defaultAthletePreferenceProfile.dose_limits.max_single_session_duration_minutes ??
      90,
    maxWeeklyMinutes:
      settings.dose_limits.max_weekly_duration_minutes ??
      defaultAthletePreferenceProfile.dose_limits.max_weekly_duration_minutes ??
      360,
  };
}

export function getTrainingPreferencesSummary(settings: AthleteTrainingSettings): string {
  const progressionPace = settings.training_style.progression_pace;
  const exactPreset = (
    Object.entries(TRAINING_PREFERENCE_PRESET_VALUES) as Array<[TrainingPreferencePreset, number]>
  ).find(([, value]) => value === progressionPace)?.[0];
  const minimumSessions = settings.dose_limits.min_sessions_per_week;
  const maximumSessions = settings.dose_limits.max_sessions_per_week;
  const sessionRange =
    minimumSessions === undefined && maximumSessions === undefined
      ? "sessions/week unset"
      : `${minimumSessions ?? "no minimum"}–${maximumSessions ?? "no maximum"} sessions`;
  const sessionDuration = settings.dose_limits.max_single_session_duration_minutes;
  const weeklyDuration = settings.dose_limits.max_weekly_duration_minutes;

  return [
    exactPreset ? exactPreset.replace(/_/g, " ") : `custom (${Math.round(progressionPace * 100)}%)`,
    sessionRange,
    sessionDuration === undefined ? "session length unset" : `${sessionDuration} min/session`,
    weeklyDuration === undefined ? "weekly time unset" : `${weeklyDuration} min/week`,
  ].join(" · ");
}

const initialTrainingSettings: AthleteTrainingSettings = defaultAthletePreferenceProfile;

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  full_name: "",
  username: "",
  intent: [],
  experience_level: null,
  dob: null,
  weight_kg: null,
  weight_unit: "kg",
  gender: null,
  sport_interests: [],
  max_hr: null,
  resting_hr: null,
  lthr: null,
  ftp: null,
  threshold_pace: null,
  css: null,
  vo2max: null,
  training_frequency: null,
  equipment: [],
  goals: [],
  training_settings: initialTrainingSettings,
  compact_training_preferences: getCompactTrainingPreferencesValue(initialTrainingSettings),
  training_preferences_patch: {},
  training_preferences_error: null,
  training_preferences_hydration_status: "loading",
  should_save_training_preferences: false,
  goal_draft: null,
  should_create_goal: false,
  selected_invitation_ids: [],
  selected_group_ids: [],
  selected_group_actions: [],
  selected_follow_profile_ids: [],
  social_action_statuses: {},
};

export const PRIMARY_SPORT_OPTIONS = [
  "cycling",
  "running",
  "swimming",
  "strength",
  "other",
] as const;

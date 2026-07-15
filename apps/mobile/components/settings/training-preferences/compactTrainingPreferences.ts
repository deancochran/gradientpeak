import { validateTrainingDoseLimitsConsistency } from "@repo/core";
import type { AthleteTrainingSettings } from "@repo/core/schemas/settings/profile_settings";
import { athleteTrainingSettingsSchema } from "@repo/core/schemas/settings/profile_settings";

export const TRAINING_PREFERENCE_PRESET_VALUES = {
  safer: 0.25,
  balanced: 0.5,
  push_harder: 0.75,
} as const;

export type TrainingPreferencePreset = keyof typeof TRAINING_PREFERENCE_PRESET_VALUES;

export type CompactTrainingPreferencesValue = {
  preset: TrainingPreferencePreset;
  minSessionsPerWeek: number;
  maxSessionsPerWeek: number;
  maxSingleSessionMinutes: number;
  maxWeeklyMinutes: number;
};

export type CompactTrainingPreferencesChange = Partial<CompactTrainingPreferencesValue>;

/** Applies only compact-surface fields and returns a canonical, complete settings value. */
export function applyCompactTrainingPreferencesChange(
  base: AthleteTrainingSettings,
  change: CompactTrainingPreferencesChange,
): AthleteTrainingSettings {
  const canonicalBase = athleteTrainingSettingsSchema.parse(base);
  const nextSettings = athleteTrainingSettingsSchema.parse({
    ...canonicalBase,
    dose_limits: {
      ...canonicalBase.dose_limits,
      ...(change.minSessionsPerWeek === undefined
        ? null
        : { min_sessions_per_week: change.minSessionsPerWeek }),
      ...(change.maxSessionsPerWeek === undefined
        ? null
        : { max_sessions_per_week: change.maxSessionsPerWeek }),
      ...(change.maxSingleSessionMinutes === undefined
        ? null
        : { max_single_session_duration_minutes: change.maxSingleSessionMinutes }),
      ...(change.maxWeeklyMinutes === undefined
        ? null
        : { max_weekly_duration_minutes: change.maxWeeklyMinutes }),
    },
    training_style: {
      ...canonicalBase.training_style,
      ...(change.preset === undefined
        ? null
        : { progression_pace: TRAINING_PREFERENCE_PRESET_VALUES[change.preset] }),
    },
  });

  const doseIssues = validateTrainingDoseLimitsConsistency(nextSettings.dose_limits);
  if (doseIssues.length > 0) {
    throw new TypeError(doseIssues.map((issue) => issue.message).join(" "));
  }

  return nextSettings;
}

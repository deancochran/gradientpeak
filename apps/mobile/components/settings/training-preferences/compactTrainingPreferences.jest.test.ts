import { defaultAthletePreferenceProfile } from "@repo/core/schemas/settings/profile_settings";
import {
  applyCompactTrainingPreferencesChange,
  TRAINING_PREFERENCE_PRESET_VALUES,
} from "./compactTrainingPreferences";

describe("compact training preferences", () => {
  it("maps each canonical preset to its progression pace", () => {
    expect(TRAINING_PREFERENCE_PRESET_VALUES).toEqual({
      safer: 0.25,
      balanced: 0.5,
      push_harder: 0.75,
    });

    for (const [preset, progressionPace] of Object.entries(TRAINING_PREFERENCE_PRESET_VALUES)) {
      const result = applyCompactTrainingPreferencesChange(defaultAthletePreferenceProfile, {
        preset: preset as keyof typeof TRAINING_PREFERENCE_PRESET_VALUES,
      });

      expect(result.training_style.progression_pace).toBe(progressionPace);
    }
  });

  it("preserves nested settings and onboarding intents outside compact changes", () => {
    const base = {
      ...defaultAthletePreferenceProfile,
      availability: {
        weekly_windows: [
          {
            day: "monday" as const,
            max_sessions: 2,
            windows: [{ start_minute_of_day: 420, end_minute_of_day: 600 }],
          },
        ],
        hard_rest_days: ["friday" as const],
      },
      dose_limits: {
        ...defaultAthletePreferenceProfile.dose_limits,
        sport_overrides: {
          run: { min_sessions_per_week: 2, max_sessions_per_week: 4 },
        },
      },
      recovery_preferences: {
        ...defaultAthletePreferenceProfile.recovery_preferences,
        recovery_priority: 0.9,
      },
      onboarding_intents: ["train_event" as const, "groups" as const],
    };

    const result = applyCompactTrainingPreferencesChange(base, {
      preset: "push_harder",
      minSessionsPerWeek: 4,
      maxSessionsPerWeek: 7,
      maxSingleSessionMinutes: 150,
      maxWeeklyMinutes: 600,
    });

    expect(result.availability).toEqual(base.availability);
    expect(result.dose_limits.sport_overrides).toEqual(base.dose_limits.sport_overrides);
    expect(result.recovery_preferences).toEqual(base.recovery_preferences);
    expect(result.onboarding_intents).toEqual(base.onboarding_intents);
    expect(result.training_style).toEqual({
      ...base.training_style,
      progression_pace: 0.75,
    });
  });

  it("preserves a custom progression pace and unset dose limits when weekly minutes change", () => {
    const base = {
      ...defaultAthletePreferenceProfile,
      dose_limits: {
        sport_overrides: {},
      },
      training_style: {
        ...defaultAthletePreferenceProfile.training_style,
        progression_pace: 0.6,
      },
    };

    const result = applyCompactTrainingPreferencesChange(base, { maxWeeklyMinutes: 480 });

    expect(result.training_style.progression_pace).toBe(0.6);
    expect(result.dose_limits).toEqual({
      sport_overrides: {},
      max_weekly_duration_minutes: 480,
    });
  });

  it("rejects an invalid compact session range", () => {
    expect(() =>
      applyCompactTrainingPreferencesChange(defaultAthletePreferenceProfile, {
        minSessionsPerWeek: 8,
        maxSessionsPerWeek: 3,
      }),
    ).toThrow("Minimum sessions per week cannot exceed maximum sessions");
  });

  it("rejects a single-session duration above the weekly budget", () => {
    expect(() =>
      applyCompactTrainingPreferencesChange(defaultAthletePreferenceProfile, {
        maxSingleSessionMinutes: 180,
        maxWeeklyMinutes: 120,
      }),
    ).toThrow("Weekly time budget must be at least as long as your longest activity");
  });
});

import { defaultAthletePreferenceProfile } from "@repo/core";
import { applyCompactTrainingPreferencesChange } from "@/components/settings/training-preferences/compactTrainingPreferences";
import {
  getCompactTrainingPreferencesValue,
  getTrainingPreferencesSummary,
} from "./onboarding-data";

describe("compact onboarding training preferences", () => {
  const customSettings = {
    ...defaultAthletePreferenceProfile,
    dose_limits: { sport_overrides: {} },
    training_style: {
      ...defaultAthletePreferenceProfile.training_style,
      progression_pace: 0.6,
    },
  };

  it("displays the nearest preset without applying that inferred preset", () => {
    expect(getCompactTrainingPreferencesValue(customSettings).preset).toBe("balanced");

    const result = applyCompactTrainingPreferencesChange(customSettings, {
      maxWeeklyMinutes: 480,
    });

    expect(result.training_style.progression_pace).toBe(0.6);
  });

  it("summarizes the actual persisted settings rather than display fallbacks", () => {
    expect(getTrainingPreferencesSummary(customSettings)).toBe(
      "custom (60%) · sessions/week unset · session length unset · weekly time unset",
    );
  });
});

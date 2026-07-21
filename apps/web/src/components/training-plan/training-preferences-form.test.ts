import { defaultAthletePreferenceProfile } from "@repo/core";
import { describe, expect, it } from "vitest";

import {
  hydrateTrainingPreferences,
  validateTrainingPreferences,
} from "./training-preferences-form";

describe("training preferences web form model", () => {
  it("hydrates a validated independent draft from persisted settings", () => {
    const persisted = {
      ...defaultAthletePreferenceProfile,
      dose_limits: {
        ...defaultAthletePreferenceProfile.dose_limits,
        max_sessions_per_week: 6,
      },
    };

    const draft = hydrateTrainingPreferences(persisted);
    draft.dose_limits.max_sessions_per_week = 4;

    expect(persisted.dose_limits.max_sessions_per_week).toBe(6);
    expect(validateTrainingPreferences(draft).success).toBe(true);
  });

  it("reports cross-field dose limits before save", () => {
    const draft = hydrateTrainingPreferences(defaultAthletePreferenceProfile);
    draft.dose_limits.min_sessions_per_week = 7;
    draft.dose_limits.max_sessions_per_week = 3;

    const result = validateTrainingPreferences(draft);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toMatch(/minimum/i);
  });
});

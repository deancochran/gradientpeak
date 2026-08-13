import { describe, expect, it } from "vitest";
import { buildOnboardingDraftDefaults } from "./draft-defaults";

describe("buildOnboardingDraftDefaults", () => {
  it("restores persisted identity, intents, metrics, preferences, and goal", () => {
    expect(
      buildOnboardingDraftDefaults({
        profile: {
          full_name: "Draft Athlete",
          username: "draft_athlete",
          dob: "1990-04-12",
          gender: "female",
          planning_timezone: "America/Denver",
          weight_kg: null,
        },
        metrics: [
          { metric_type: "weight_kg", value: 67.5 },
          { metric_type: "max_hr", value: 188 },
        ],
        settings: {
          onboarding_intents: ["train_event"],
          dose_limits: {
            min_sessions_per_week: 4,
            max_sessions_per_week: 6,
            max_single_session_duration_minutes: 95,
            max_weekly_duration_minutes: 420,
          },
          training_style: { progression_pace: 0.8 },
        },
        goal: {
          title: "Spring race",
          target_date: "2027-05-01",
          activity_category: "run",
          target_payload: { type: "consistency" },
        },
      }),
    ).toMatchObject({
      full_name: "Draft Athlete",
      username: "draft_athlete",
      intents: ["train_event"],
      weight_kg: 67.5,
      max_hr: 188,
      settings: { preset: "push_harder", minSessionsPerWeek: 4 },
      goal: { title: "Spring race" },
    });
  });
});

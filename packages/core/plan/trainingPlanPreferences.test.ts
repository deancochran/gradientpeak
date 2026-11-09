import { describe, expect, it } from "vitest";
import {
  trainingPlanPreferencesSchema,
  validateTrainingPlanPreferences,
} from "./trainingPlanPreferences";

const preferences = {
  weekly_session_count: 4,
  target_weekly_duration_minutes: 480,
  maximum_session_duration_minutes: 180,
  preferred_weekdays: [1, 3, 5],
  rest_days: [0, 2],
  progression_style: "balanced" as const,
  recovery_priority: "balanced" as const,
};

describe("training plan preferences", () => {
  it("accepts only the supported plan-owned controls", () => {
    expect(trainingPlanPreferencesSchema.parse(preferences)).toEqual(preferences);
    expect(
      trainingPlanPreferencesSchema.safeParse({ ...preferences, durationWeeks: 8 }).success,
    ).toBe(false);
  });

  it("blocks impossible session, rest-day, and duration combinations", () => {
    expect(
      validateTrainingPlanPreferences({
        ...preferences,
        weekly_session_count: 6,
        rest_days: [0, 1],
        target_weekly_duration_minutes: 1200,
        maximum_session_duration_minutes: 180,
      }).map((issue) => issue.code),
    ).toEqual(["sessions_and_rest_days_exceed_week", "weekly_duration_exceeds_session_capacity"]);
  });
});

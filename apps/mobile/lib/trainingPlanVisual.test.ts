import { describe, expect, it } from "vitest";
import { deriveTrainingPlanSummaryMetrics } from "./trainingPlanVisual";

describe("training plan summary presentation", () => {
  it("rejects legacy and malformed structures instead of synthesizing a visual", () => {
    const legacyPlan = {
      structure: {
        duration_weeks: 8,
        sessions: [{ day_offset: 0, activity_plan_id: "activity-plan-1" }],
      },
    };

    expect(deriveTrainingPlanSummaryMetrics(legacyPlan).durationLabel).toBe("--");
  });

  it("prefers an explicit session target and otherwise identifies the authored average", () => {
    const structure = {
      version: 1,
      plan_preferences: {
        weekly_session_count: null,
        target_weekly_duration_minutes: null,
        maximum_session_duration_minutes: null,
        preferred_weekdays: [],
        rest_days: [],
        progression_style: null,
        recovery_priority: null,
      },
      durationWeeks: { recommended: 2 },
      sessions: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          offset_days: 0,
          activity_plan_id: "11111111-1111-4111-8111-111111111112",
          demand: {
            activity_category: "run",
            training_intent: "aerobic_base",
            target_duration_minutes: null,
            target_common_load: null,
            importance: "normal",
          },
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          offset_days: 2,
          activity_plan_id: "22222222-2222-4222-8222-222222222223",
          demand: {
            activity_category: "run",
            training_intent: "aerobic_base",
            target_duration_minutes: null,
            target_common_load: null,
            importance: "normal",
          },
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          offset_days: 8,
          activity_plan_id: "33333333-3333-4333-8333-333333333334",
          demand: {
            activity_category: "run",
            training_intent: "aerobic_base",
            target_duration_minutes: null,
            target_common_load: null,
            importance: "normal",
          },
        },
      ],
    };

    expect(deriveTrainingPlanSummaryMetrics({ structure }).sessionsLabel).toBe(
      "Authored avg: 1.5/week",
    );
    expect(
      deriveTrainingPlanSummaryMetrics({ structure, sessions_per_week_target: 4 }).sessionsLabel,
    ).toBe("Target: 4/week");
  });
});

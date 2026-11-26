import { describe, expect, it } from "vitest";

import {
  buildTrainingPlanStructure,
  summarizeTrainingPlan,
  toTrainingPlanSessionDrafts,
} from "./training-plan-model";

const activityPlanId = "11111111-1111-4111-8111-111111111111";

describe("training plan web model", () => {
  it("builds and summarizes the shared canonical structure", () => {
    const structure = buildTrainingPlanStructure([
      { activityPlanId, activityCategory: "bike", offsetDays: 7, title: "Tempo" },
      { activityPlanId, activityCategory: "bike", offsetDays: 0, title: "Endurance" },
    ]);

    expect(structure.sessions.map((session) => session.offset_days)).toEqual([0, 7]);
    expect(summarizeTrainingPlan(structure)).toEqual({
      durationDays: 8,
      sessionCount: 2,
      weekCount: 2,
    });
  });

  it("hydrates persisted structures with their repository-owned ID", () => {
    const structure = {
      id: "22222222-2222-4222-8222-222222222222",
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
      sessions: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          activity_plan_id: activityPlanId,
          demand: {
            activity_category: "bike",
            training_intent: "general_maintenance",
            target_duration_minutes: null,
            target_common_load: null,
            importance: "normal",
          },
          offset_days: 0,
        },
      ],
    };

    expect(toTrainingPlanSessionDrafts(structure)).toMatchObject([
      {
        activityPlanId,
        activityCategory: "bike",
        draftId: "33333333-3333-4333-8333-333333333333",
        offsetDays: 0,
        title: "",
      },
    ]);
    expect(summarizeTrainingPlan(structure)).toEqual({
      durationDays: 1,
      sessionCount: 1,
      weekCount: 1,
    });
  });

  it("preserves catalog-selected sessions without an explicit activity plan", () => {
    const structure = buildTrainingPlanStructure([
      { activityPlanId: null, activityCategory: "run", offsetDays: 0, title: "" },
    ]);

    expect(structure.sessions[0]?.activity_plan_id).toBeNull();
    expect(toTrainingPlanSessionDrafts(structure)).toMatchObject([
      { activityPlanId: null, activityCategory: "run", offsetDays: 0 },
    ]);
  });

  it("round-trips persisted structure while patching edited, added, and removed sessions", () => {
    const structure = {
      id: "22222222-2222-4222-8222-222222222222",
      version: 1,
      plan_preferences: {
        weekly_session_count: 4,
        target_weekly_duration_minutes: 240,
        maximum_session_duration_minutes: 90,
        preferred_weekdays: [1, 3, 5],
        rest_days: [0, 6],
        progression_style: "ambitious",
        recovery_priority: "high",
      },
      activity_category: ["bike", "run"],
      durationWeeks: { recommended: 8, minimum: 6, maximum: 10 },
      experienceLevel: ["advanced"],
      goal_blueprints: [
        { title: "Race", priority: 9, activity_category: "run", target_offset_days: 56 },
      ],
      sessions: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          activity_plan_id: activityPlanId,
          demand: {
            activity_category: "bike",
            training_intent: "threshold_development",
            target_duration_minutes: 75,
            target_common_load: 120,
            importance: "key",
          },
          event_overrides: {
            title: "Intervals",
            description: "Keep cadence high",
            start_time: "06:30",
          },
          offset_days: 0,
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          activity_plan_id: activityPlanId,
          demand: {
            activity_category: "bike",
            training_intent: "general_maintenance",
            target_duration_minutes: null,
            target_common_load: null,
            importance: "normal",
          },
          offset_days: 2,
        },
      ],
    };
    const [existing] = toTrainingPlanSessionDrafts(structure);
    if (!existing) throw new Error("Expected persisted session draft");

    const rebuilt = buildTrainingPlanStructure(
      [
        { ...existing, activityPlanId: null, activityCategory: "run", offsetDays: 1 },
        { activityPlanId: null, activityCategory: "swim", offsetDays: 4, title: "" },
      ],
      structure,
    );

    expect(rebuilt).toMatchObject({
      plan_preferences: structure.plan_preferences,
      activity_category: structure.activity_category,
      durationWeeks: structure.durationWeeks,
      experienceLevel: structure.experienceLevel,
      goal_blueprints: structure.goal_blueprints,
    });
    expect(rebuilt.sessions).toMatchObject([
      {
        id: existing.draftId,
        activity_plan_id: null,
        offset_days: 1,
        demand: {
          activity_category: "run",
          training_intent: "threshold_development",
          target_duration_minutes: 75,
          target_common_load: 120,
          importance: "key",
        },
        event_overrides: {
          title: "Intervals",
          description: "Keep cadence high",
          start_time: "06:30",
        },
      },
      {
        activity_plan_id: null,
        offset_days: 4,
        demand: {
          activity_category: "swim",
          training_intent: "general_maintenance",
          target_duration_minutes: null,
          target_common_load: null,
          importance: "normal",
        },
      },
    ]);
    expect(rebuilt.sessions).toHaveLength(2);
  });

  it("rejects invalid activity plan identifiers before persistence", () => {
    expect(() =>
      buildTrainingPlanStructure([
        { activityPlanId: "not-a-uuid", activityCategory: "run", offsetDays: 0, title: "Run" },
      ]),
    ).toThrow();
  });
});

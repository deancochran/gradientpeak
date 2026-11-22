import { describe, expect, it } from "vitest";

import { deriveTrainingPlanScheduleVisual } from "../training-plan-schedule-visual";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const plan_preferences = {
  weekly_session_count: null,
  target_weekly_duration_minutes: null,
  maximum_session_duration_minutes: null,
  preferred_weekdays: [],
  rest_days: [],
  progression_style: null,
  recovery_priority: null,
};
const demand = {
  activity_category: "run",
  training_intent: "aerobic_base",
  target_duration_minutes: null,
  target_common_load: null,
  importance: "normal",
};

describe("training plan schedule visual", () => {
  it("derives weekly session distribution and only authored goal markers", () => {
    const visual = deriveTrainingPlanScheduleVisual({
      structure: {
        version: 1,
        activity_category: ["run", "strength"],
        durationWeeks: { recommended: 3 },
        plan_preferences,
        goal_blueprints: [
          { title: "Race day", priority: 10, activity_category: "run", target_offset_days: 15 },
        ],
        sessions: [
          { id: id(101), offset_days: 0, activity_plan_id: id(1), demand },
          { id: id(102), offset_days: 2, activity_plan_id: id(2), demand },
          { id: id(103), offset_days: 8, activity_plan_id: id(3), demand },
        ],
      },
    });

    expect(visual).toEqual({
      maxSessionsPerWeek: 2,
      scope: "weekly_session_distribution",
      totalSessions: 3,
      totalWeeks: 3,
      weeks: [
        {
          hasAuthoredGoal: false,
          plannedSessionCount: 2,
          relativeSessionVolume: 1,
          weekIndex: 0,
        },
        {
          hasAuthoredGoal: false,
          plannedSessionCount: 1,
          relativeSessionVolume: 0.5,
          weekIndex: 1,
        },
        {
          hasAuthoredGoal: true,
          plannedSessionCount: 0,
          relativeSessionVolume: 0,
          weekIndex: 2,
        },
      ],
    });
    expect(visual?.weeks[2]).toMatchObject({
      plannedSessionCount: 0,
      relativeSessionVolume: 0,
    });
    expect(JSON.stringify(visual)).not.toMatch(/phase|intensity|recovery|athlete|specificity/i);
  });

  it("uses a validated transport preview without inferring weekly composition", () => {
    const visual = deriveTrainingPlanScheduleVisual({
      preview: {
        scope: "weekly_session_count",
        weeks: [
          { weekIndex: 0, plannedSessionCount: 1 },
          { weekIndex: 1, plannedSessionCount: 3 },
        ],
      },
      structure: {
        version: 1,
        activity_category: ["bike"],
        plan_preferences,
        sessions: [{ id: id(104), offset_days: 0, activity_plan_id: id(4), demand }],
      },
    });

    expect(visual?.weeks.map((week) => week.relativeSessionVolume)).toEqual([1 / 3, 1]);
    expect(visual?.totalSessions).toBe(4);
  });

  it("rejects missing, empty, and unbounded schedule evidence", () => {
    expect(deriveTrainingPlanScheduleVisual({ structure: null })).toBeNull();
    expect(
      deriveTrainingPlanScheduleVisual({
        preview: {
          scope: "weekly_session_count",
          weeks: [{ weekIndex: 0, plannedSessionCount: 0 }],
        },
      }),
    ).toBeNull();
    expect(
      deriveTrainingPlanScheduleVisual({
        structure: {
          version: 1,
          plan_preferences,
          sessions: [{ id: id(105), offset_days: 104 * 7, activity_plan_id: id(5), demand }],
        },
      }),
    ).toBeNull();
  });
});

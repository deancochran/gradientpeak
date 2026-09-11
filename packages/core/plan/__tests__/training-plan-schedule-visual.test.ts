import { describe, expect, it } from "vitest";

import { deriveTrainingPlanScheduleVisual } from "../training-plan-schedule-visual";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

describe("training plan schedule visual", () => {
  it("derives weekly session distribution and only authored goal markers", () => {
    const visual = deriveTrainingPlanScheduleVisual({
      structure: {
        version: 1,
        activity_category: ["run", "strength"],
        durationWeeks: { recommended: 3 },
        goal_blueprints: [
          { title: "Race day", priority: 10, activity_category: "run", target_offset_days: 15 },
        ],
        sessions: [
          { offset_days: 0, activity_plan_id: id(1), activity_plan_variant_id: id(1) },
          { offset_days: 2, activity_plan_id: id(2), activity_plan_variant_id: id(2) },
          { offset_days: 8, activity_plan_id: id(3), activity_plan_variant_id: id(3) },
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
        sessions: [{ offset_days: 0, activity_plan_id: id(4), activity_plan_variant_id: id(4) }],
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
          sessions: [
            {
              offset_days: 104 * 7,
              activity_plan_id: id(5),
              activity_plan_variant_id: id(5),
            },
          ],
        },
      }),
    ).toBeNull();
  });
});

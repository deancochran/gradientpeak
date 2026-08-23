import { describe, expect, it } from "vitest";

import {
  deriveTrainingPlanPlannedSchedulePreview,
  projectProfileChartPoints,
  serializeProfileChartPoints,
  trainingPlanPlannedSchedulePreviewSchema,
} from "./profile-previews";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

describe("public profile previews", () => {
  it("derives a schedule-level weekly preview without claiming activity intensity", () => {
    const preview = deriveTrainingPlanPlannedSchedulePreview({
      version: 1,
      durationWeeks: { recommended: 3 },
      sessions: [
        { offset_days: 0, activity_plan_id: id(20) },
        { offset_days: 2, activity_plan_id: id(21) },
        { offset_days: 8, activity_plan_id: id(20) },
      ],
    });

    expect(preview).toEqual({
      scope: "weekly_session_count",
      weeks: [
        { weekIndex: 0, plannedSessionCount: 2 },
        { weekIndex: 1, plannedSessionCount: 1 },
        { weekIndex: 2, plannedSessionCount: 0 },
      ],
    });
    expect(trainingPlanPlannedSchedulePreviewSchema.parse(preview)).toEqual(preview);
    expect(JSON.stringify(preview)).not.toMatch(
      /load|target|threshold|intensity|provenance|raw|stream/i,
    );
    expect(
      trainingPlanPlannedSchedulePreviewSchema.safeParse({
        ...preview,
        targetLoad: 500,
      }).success,
    ).toBe(false);
    expect(
      trainingPlanPlannedSchedulePreviewSchema.safeParse({
        ...preview,
        weeks: preview?.weeks.map((week) => ({ ...week, relativeLoad: 1 })),
      }).success,
    ).toBe(false);
  });

  it("rejects unbounded schedules and projects deterministic cross-platform chart points", () => {
    expect(
      deriveTrainingPlanPlannedSchedulePreview({
        version: 1,
        sessions: [{ offset_days: 104 * 7, activity_plan_id: id(30) }],
      }),
    ).toBeNull();
    const points = projectProfileChartPoints(
      [
        { position: 0, value: 0.5 },
        { position: 10, value: 1 },
      ],
      { valueMinimum: 0, valueMaximum: 1 },
    );
    expect(serializeProfileChartPoints(points)).toBe("4.00,24.00 96.00,4.00");
    expect(
      projectProfileChartPoints([
        { position: 2, value: 0.5 },
        { position: 1, value: 0.7 },
      ]),
    ).toEqual([]);
    expect(projectProfileChartPoints([{ position: 0, value: 1 }])).toEqual([{ x: 50, y: 24 }]);
  });
});

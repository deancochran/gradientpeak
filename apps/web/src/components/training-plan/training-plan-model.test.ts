import { describe, expect, it } from "vitest";

import {
  buildTrainingPlanStructure,
  buildWorkoutReorderInput,
  moveScheduledWorkout,
  summarizeTrainingPlan,
} from "./training-plan-model";

const activityPlanId = "11111111-1111-4111-8111-111111111111";

describe("training plan web model", () => {
  it("builds and summarizes the shared canonical structure", () => {
    const structure = buildTrainingPlanStructure([
      { activityPlanId, offsetDays: 7, title: "Tempo" },
      { activityPlanId, offsetDays: 0, title: "Endurance" },
    ]);

    expect(structure.sessions.map((session) => session.offset_days)).toEqual([0, 7]);
    expect(summarizeTrainingPlan(structure)).toEqual({
      durationDays: 8,
      sessionCount: 2,
      weekCount: 2,
    });
  });

  it("rejects invalid activity plan identifiers before persistence", () => {
    expect(() =>
      buildTrainingPlanStructure([{ activityPlanId: "not-a-uuid", offsetDays: 0, title: "Run" }]),
    ).toThrow();
  });

  it("returns a new optimistic workout snapshot without mutating rollback data", () => {
    const workouts = [
      { id: "a", scheduled_date: "2026-07-20" },
      { id: "b", scheduled_date: "2026-07-21" },
    ];

    const moved = moveScheduledWorkout(workouts, "a", 1);

    expect(moved).toEqual([
      { id: "a", scheduled_date: "2026-07-21" },
      { id: "b", scheduled_date: "2026-07-21" },
    ]);
    expect(workouts[0]?.scheduled_date).toBe("2026-07-20");
  });

  it("builds one atomic reorder request with expected and requested dates", () => {
    const original = [
      { id: "a", scheduled_date: "2026-07-20", training_plan_id: activityPlanId },
      { id: "b", scheduled_date: "2026-07-21", training_plan_id: activityPlanId },
    ];
    const next = [
      { id: "a", scheduled_date: "2026-07-22", training_plan_id: activityPlanId },
      { id: "b", scheduled_date: "2026-07-23", training_plan_id: activityPlanId },
    ];

    expect(buildWorkoutReorderInput(original, next)).toEqual({
      training_plan_id: activityPlanId,
      changes: [
        {
          event_id: "a",
          expected_scheduled_date: "2026-07-20",
          requested_scheduled_date: "2026-07-22",
        },
        {
          event_id: "b",
          expected_scheduled_date: "2026-07-21",
          requested_scheduled_date: "2026-07-23",
        },
      ],
    });
  });
});

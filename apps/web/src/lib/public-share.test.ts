import type { TrainingPlan } from "@repo/core";
import { describe, expect, it } from "vitest";

import { projectPublicTrainingPlanStructure } from "./public-share";

const baseStructure: TrainingPlan = {
  id: "00000000-0000-4000-8000-000000000001",
  version: 1,
  sessions: [
    {
      activity_plan_id: "00000000-0000-4000-8000-000000000002",
      offset_days: 0,
    },
  ],
};

describe("projectPublicTrainingPlanStructure", () => {
  it("preserves serializable goal objectives", () => {
    const projected = projectPublicTrainingPlanStructure({
      ...baseStructure,
      goal_blueprints: [
        {
          objective: {
            distance_m: 10_000,
            labels: ["priority", null],
            type: "event_performance",
          },
          priority: 9,
          title: "10K race",
        },
      ],
    });

    expect(projected.goal_blueprints?.[0]?.objective).toEqual({
      distance_m: 10_000,
      labels: ["priority", null],
      type: "event_performance",
    });
  });

  it("omits unsupported opaque objective values", () => {
    const projected = projectPublicTrainingPlanStructure({
      ...baseStructure,
      goal_blueprints: [
        {
          objective: new Date("2026-07-17T00:00:00.000Z"),
          priority: 5,
          title: "Opaque objective",
        },
      ],
    });

    expect(projected.goal_blueprints?.[0]).toEqual({
      priority: 5,
      title: "Opaque objective",
    });
    expect(projected.goal_blueprints?.[0]).not.toHaveProperty("objective");
  });
});

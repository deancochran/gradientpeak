import { describe, expect, it } from "vitest";
import { deriveTrainingPlanSummaryMetrics, deriveTrainingPlanVisual } from "./trainingPlanVisual";

describe("training plan visual presentation", () => {
  it("derives a visual from a canonical training-plan structure", () => {
    const visual = deriveTrainingPlanVisual({
      id: "plan-1",
      structure: {
        version: 1,
        activity_category: ["run"],
        durationWeeks: { recommended: 2 },
        sessions: [
          { offset_days: 0, activity_plan_id: "11111111-1111-4111-8111-111111111111" },
          { offset_days: 8, activity_plan_id: "22222222-2222-4222-8222-222222222222" },
        ],
      },
    });

    expect(visual).toMatchObject({ planType: "template", totalSegments: 2 });
    expect(visual?.segments.map((segment) => segment.relativeLoad)).toEqual([1, 1]);
  });

  it("rejects legacy and malformed structures instead of synthesizing a visual", () => {
    const legacyPlan = {
      structure: {
        duration_weeks: 8,
        sessions: [{ day_offset: 0, activity_plan_id: "activity-plan-1" }],
      },
    };

    expect(deriveTrainingPlanVisual(legacyPlan)).toBeNull();
    expect(deriveTrainingPlanSummaryMetrics(legacyPlan).durationLabel).toBe("--");
  });
});

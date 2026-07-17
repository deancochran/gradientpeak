import { describe, expect, it } from "vitest";
import { deriveTrainingPlanVisual } from "./trainingPlanVisual";

describe("training plan visual presentation", () => {
  it("does not return legacy plan type for canonical list/detail fallback presentation", () => {
    const visual = deriveTrainingPlanVisual({
      id: "plan-1",
      name: "Canonical plan without periodized blocks",
      structure: { sessions: [{ offset_days: 0, activity_plan_id: "activity-plan-1" }] },
    });

    expect(visual.planType).toBe("template");
    expect(visual.planType).not.toBe("legacy");
  });
});

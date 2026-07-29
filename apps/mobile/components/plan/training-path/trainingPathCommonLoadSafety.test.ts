import { describe, expect, it } from "vitest";
import { buildTrainingPathViewModel } from "./trainingPathUtils";

describe("Training Path common Load safety", () => {
  it("does not let a legacy recommendation create or scale a common Load chart", () => {
    const model = buildTrainingPathViewModel({
      timeline: [{ date: "2026-07-28", recommended_load_tss: 1_000 }],
      fitnessHistory: [],
      projectedFitness: [],
      idealFitnessCurve: [],
      goalMarkers: [],
      range: "all",
      todayKey: "2026-07-28",
    });

    expect(model.emptyState).toBe("noGoal");
    expect(model.domains.load).toEqual([0, 10]);
  });
});

import { describe, expect, it } from "vitest";
import {
  getActivityCategoryDefaultDuration,
  getActivityCategoryDefaultStepName,
  getActivityCategoryDefaultTarget,
  getActivityCategoryTemplateDefaults,
  getActivityCategoryTypicalSpeed,
} from "../registry";

describe("ActivityCategory registry", () => {
  it("provides canonical step defaults for swim and strength", () => {
    expect(getActivityCategoryDefaultStepName("swim", { position: 0, totalSteps: 3 })).toBe(
      "Easy Swim",
    );
    expect(getActivityCategoryDefaultDuration("swim", { position: 1, totalSteps: 3 })).toEqual({
      type: "distance",
      meters: 400,
    });
    expect(getActivityCategoryDefaultStepName("strength", { position: 2, totalSteps: 4 })).toBe(
      "Exercise 2",
    );
  });

  it("preserves ActivityCategory-specific target and load heuristics", () => {
    expect(getActivityCategoryDefaultTarget("bike", { position: 1, totalSteps: 3 })).toEqual({
      type: "%FTP",
      intensity: 80,
    });
    expect(getActivityCategoryTypicalSpeed("run", "hard")).toBe(4.2);
    expect(getActivityCategoryTemplateDefaults("other")).toEqual({
      avgIF: 0.65,
      avgDuration: 1800,
      avgTSS: 30,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  getSportDefaultDuration,
  getSportDefaultStepName,
  getSportDefaultTarget,
  getSportTemplateDefaults,
  getSportTypicalSpeed,
} from "../registry";

describe("sport registry", () => {
  it("provides canonical step defaults for swim and strength", () => {
    expect(getSportDefaultStepName("swim", { position: 0, totalSteps: 3 })).toBe("Easy Swim");
    expect(getSportDefaultDuration("swim", { position: 1, totalSteps: 3 })).toEqual({
      type: "distance",
      meters: 400,
    });
    expect(getSportDefaultStepName("strength", { position: 2, totalSteps: 4 })).toBe("Exercise 2");
  });

  it("preserves sport-specific target and load heuristics", () => {
    expect(getSportDefaultTarget("bike", { position: 1, totalSteps: 3 })).toEqual({
      type: "%FTP",
      intensity: 80,
    });
    expect(getSportTypicalSpeed("run", "hard")).toBe(4.2);
    expect(getSportTemplateDefaults("other")).toEqual({
      avgIF: 0.65,
      avgDuration: 1800,
      avgTSS: 30,
    });
  });
});

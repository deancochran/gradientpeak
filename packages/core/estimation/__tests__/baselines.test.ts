import { describe, expect, it } from "vitest";
import {
  estimateConservativeFTPFromWeight,
  estimateCSSBaseline,
  estimateLTHRBaseline,
  estimateMaxHRBaseline,
  estimateMaxHRFromDOB,
  estimateThresholdPaceBaseline,
} from "../baselines";

describe("estimation baselines", () => {
  it("provides canonical scalar onboarding baselines", () => {
    expect(estimateConservativeFTPFromWeight(70)).toBe(123);
    expect(estimateMaxHRBaseline(30).value).toBe(190);
    expect(estimateLTHRBaseline(190).value).toBe(162);
    expect(estimateThresholdPaceBaseline("intermediate").value).toBe(300);
    expect(estimateCSSBaseline("female", "advanced")).toBe(90);
  });

  it("handles DOB-based max HR fallback safely", () => {
    expect(estimateMaxHRFromDOB("1996-03-21")).toBe(190);
    expect(estimateMaxHRFromDOB(null)).toBeNull();
    expect(estimateMaxHRFromDOB("bad-value")).toBeNull();
  });
});

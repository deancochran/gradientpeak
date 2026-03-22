import { describe, expect, it } from "vitest";
import {
  estimateConservativeFTPFromWeight,
  estimateFTPFromWeightByProfile,
  estimateLTHR,
  estimateMaxHR,
  estimateMaxHRFromDOB,
  estimateThresholdPaceFromGender,
} from "../index";

describe("canonical onboarding estimators", () => {
  it("provides shared onboarding estimates", () => {
    expect(estimateConservativeFTPFromWeight(70)).toBe(175);
    expect(estimateMaxHR(30).value).toBe(190);
    expect(estimateMaxHRFromDOB("1996-03-21")).toBe(190);
    expect(estimateLTHR(190).value).toBe(162);
  });

  it("supports profile-aware performance defaults", () => {
    expect(estimateFTPFromWeightByProfile(70, "male", "intermediate")).toBe(193);
    expect(estimateThresholdPaceFromGender("female", "advanced")).toBe(300);
  });
});

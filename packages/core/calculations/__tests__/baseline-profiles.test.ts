import { describe, expect, it } from "vitest";
import { calculateAge, getOnboardingBaselineProfile } from "../baseline-profiles";

describe("getOnboardingBaselineProfile", () => {
  it.each(["skip", "advanced"] as const)("returns null for %s experience", (experience) => {
    expect(getOnboardingBaselineProfile(experience, "male", 30)).toBeNull();
  });

  it("returns only non-threshold onboarding measurements", () => {
    expect(getOnboardingBaselineProfile("beginner", "male", 30)).toEqual({
      max_hr: 190,
      resting_hr: 70,
      vo2_max: expect.any(Number),
      confidence: "low",
      source: "baseline_beginner",
    });
  });

  it("uses the experience and gender resting-HR baseline", () => {
    const beginner = getOnboardingBaselineProfile("beginner", "female", 35);
    const intermediate = getOnboardingBaselineProfile("intermediate", "female", 35);

    expect(beginner?.resting_hr).toBe(75);
    expect(intermediate?.resting_hr).toBe(65);
    expect(intermediate?.confidence).toBe("medium");
  });
});

describe("calculateAge", () => {
  it("calculates age from strings and Date objects", () => {
    expect(calculateAge("1990-01-01")).toBeGreaterThanOrEqual(34);
    expect(calculateAge(new Date("1990-01-01"))).toBeGreaterThanOrEqual(34);
  });
});

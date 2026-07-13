import { describe, expect, it } from "vitest";
import { buildEstimationContext, estimateMetrics } from "../index";
import { calculateAgeFromDOB } from "../metrics";

describe("estimation asOf determinism", () => {
  it("uses the explicit birthday boundary rather than the wall clock", () => {
    const estimate = {
      tss: 50,
      duration: 36_000,
      intensityFactor: 0.8,
      confidence: "medium" as const,
      confidenceScore: 75,
      factors: [],
      warnings: [],
    };
    const context = (asOf: Date) =>
      buildEstimationContext({
        asOf,
        userProfile: { dob: "1990-07-12", threshold_hr: 170, weight_kg: 70 },
        activityPlan: { activity_category: "run" },
      });

    const beforeBirthday = estimateMetrics(estimate, context(new Date("2026-07-11T12:00:00Z")));
    const onBirthday = estimateMetrics(estimate, context(new Date("2026-07-12T12:00:00Z")));
    const repeated = estimateMetrics(estimate, context(new Date("2026-07-12T12:00:00Z")));

    expect(calculateAgeFromDOB("1990-07-12", new Date("2026-07-11T12:00:00Z"))).toBe(35);
    expect(calculateAgeFromDOB("1990-07-12", new Date("2026-07-12T12:00:00Z"))).toBe(36);
    expect(onBirthday.calories).not.toBe(beforeBirthday.calories);
    expect(repeated).toEqual(onBirthday);
  });
});

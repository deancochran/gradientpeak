import { profileMetricTypes } from "@repo/core/athlete-inputs";
import { describe, expect, it } from "vitest";
import { profileMetricSections } from "./trends";

describe("profileMetricSections", () => {
  it("keeps every canonical metric exactly once in the categorized order", () => {
    expect(profileMetricSections.map(({ id }) => id)).toEqual([
      "load_calibration",
      "supporting_physiology",
      "recovery",
      "body_aerobic",
    ]);

    const metricTypes = profileMetricSections.flatMap(({ metricTypes }) => metricTypes);

    expect(metricTypes).toEqual([
      "lthr",
      "max_hr",
      "resting_hr",
      "weight_kg",
      "hrv_rmssd",
      "sleep_hours",
      "stress_score",
      "soreness_level",
      "wellness_score",
      "hydration_level",
      "vo2_max",
      "body_fat_percentage",
    ]);
    expect(new Set(metricTypes).size).toBe(metricTypes.length);
    expect([...metricTypes].sort()).toEqual([...profileMetricTypes].sort());
  });
});

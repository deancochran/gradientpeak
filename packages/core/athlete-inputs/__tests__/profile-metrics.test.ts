import { describe, expect, it } from "vitest";
import {
  createProfileMetricInputSchema,
  formatProfileMetricValue,
  getCanonicalProfileMetricValueFromDisplay,
  getProfileMetricDisplayUnit,
  getProfileMetricDisplayValue,
  isProfileMetricValueWithinRange,
  profileMetricObservationSchema,
  profileMetricTypes,
} from "../profile-metrics";

describe("profile metric definitions", () => {
  it("defines every persisted profile metric with display and input bounds", () => {
    expect(profileMetricTypes).toContain("weight_kg");
    expect(profileMetricTypes).not.toContain("lthr");
  });

  it("validates values through the shared registry", () => {
    expect(isProfileMetricValueWithinRange("lthr", 165)).toBe(false);
    expect(isProfileMetricValueWithinRange("weight_kg", 70)).toBe(true);
    expect(isProfileMetricValueWithinRange("unknown", 20)).toBe(false);
  });

  it("normalizes units and values on create", () => {
    const parsed = createProfileMetricInputSchema.parse({
      metric_type: "weight_kg",
      value: 72.34,
      recorded_at: "2026-07-09T12:00:00.000Z",
    });

    expect(parsed).toMatchObject({ metric_type: "weight_kg", unit: "kg", value: 72.3 });
  });

  it("formats values with canonical units", () => {
    expect(formatProfileMetricValue({ metric_type: "stress_score", value: 7 })).toBe("7");
  });

  it("adapts convertible values to imperial display and back to canonical units", () => {
    expect(
      formatProfileMetricValue({
        metric_type: "weight_kg",
        preferredUnitSystem: "imperial",
        value: 70,
      }),
    ).toBe("154.3 lb");
    const displayedWeight = getProfileMetricDisplayValue("weight_kg", 70, "imperial");
    expect(getProfileMetricDisplayUnit("weight_kg", "imperial")).toBe("lb");
    expect(
      getCanonicalProfileMetricValueFromDisplay("weight_kg", displayedWeight, "imperial"),
    ).toBeCloseTo(70, 8);
  });

  it("rejects removed threshold observations", () => {
    expect(
      profileMetricObservationSchema.safeParse({
        metric_type: "lthr",
        source: "manual",
        provenance: {},
      }).success,
    ).toBe(false);
  });
});

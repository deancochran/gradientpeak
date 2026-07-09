import { describe, expect, it } from "vitest";
import {
  createProfileMetricInputSchema,
  formatProfileMetricValue,
  getProfileMetricDefinition,
  isProfileMetricValueWithinRange,
  profileMetricTypes,
} from "../profile-metrics";

describe("profile metric definitions", () => {
  it("defines every persisted profile metric with display and input bounds", () => {
    expect(profileMetricTypes).toContain("weight_kg");
    expect(profileMetricTypes).toContain("ftp");
    expect(getProfileMetricDefinition("lthr")).toMatchObject({ unit: "bpm", min: 80 });
  });

  it("validates values through the shared registry", () => {
    expect(isProfileMetricValueWithinRange("ftp", 250)).toBe(true);
    expect(isProfileMetricValueWithinRange("ftp", 20)).toBe(false);
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
    expect(formatProfileMetricValue({ metric_type: "ftp", value: 245 })).toBe("245 W");
    expect(formatProfileMetricValue({ metric_type: "stress_score", value: 7 })).toBe("7");
  });
});

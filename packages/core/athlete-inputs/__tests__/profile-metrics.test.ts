import { describe, expect, it } from "vitest";
import {
  createProfileMetricInputSchema,
  formatProfileMetricValue,
  getProfileMetricDefinition,
  isProfileMetricValueWithinRange,
  profileMetricObservationSchema,
  profileMetricTypes,
} from "../profile-metrics";

describe("profile metric definitions", () => {
  it("defines every persisted profile metric with display and input bounds", () => {
    expect(profileMetricTypes).toContain("weight_kg");
    expect(profileMetricTypes).toContain("ftp");
    expect(profileMetricTypes).toContain("threshold_pace_seconds_per_km");
    expect(profileMetricTypes).toContain("css_seconds_per_100m");
    expect(getProfileMetricDefinition("lthr")).toMatchObject({ unit: "bpm", min: 80 });
    expect(getProfileMetricDefinition("threshold_pace_seconds_per_km")).toMatchObject({
      unit: "seconds_per_km",
      min: 120,
    });
  });

  it("validates values through the shared registry", () => {
    expect(isProfileMetricValueWithinRange("ftp", 250)).toBe(true);
    expect(isProfileMetricValueWithinRange("ftp", 20)).toBe(true);
    expect(isProfileMetricValueWithinRange("ftp", 700)).toBe(true);
    expect(isProfileMetricValueWithinRange("ftp", 19)).toBe(false);
    expect(isProfileMetricValueWithinRange("ftp", 701)).toBe(false);
    expect(isProfileMetricValueWithinRange("threshold_pace_seconds_per_km", 1_200)).toBe(true);
    expect(isProfileMetricValueWithinRange("threshold_pace_seconds_per_km", 1_201)).toBe(false);
    expect(isProfileMetricValueWithinRange("css_seconds_per_100m", 45)).toBe(true);
    expect(isProfileMetricValueWithinRange("css_seconds_per_100m", 600)).toBe(true);
    expect(isProfileMetricValueWithinRange("css_seconds_per_100m", 44)).toBe(false);
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
    expect(
      formatProfileMetricValue({ metric_type: "threshold_pace_seconds_per_km", value: 270 }),
    ).toBe("4:30 /km");
    expect(formatProfileMetricValue({ metric_type: "css_seconds_per_100m", value: 100 })).toBe(
      "1:40 /100m",
    );
    expect(formatProfileMetricValue({ metric_type: "stress_score", value: 7 })).toBe("7");
  });

  it("represents a locked override as manual provenance", () => {
    expect(
      profileMetricObservationSchema.parse({
        metric_type: "threshold_pace_seconds_per_km",
        source: "manual",
        provenance: { manual_override: { locked: true } },
      }),
    ).toMatchObject({ source: "manual", provenance: { manual_override: { locked: true } } });

    expect(
      profileMetricObservationSchema.safeParse({
        metric_type: "css_seconds_per_100m",
        source: "provider",
        provenance: { manual_override: { locked: true } },
      }).success,
    ).toBe(false);
  });
});

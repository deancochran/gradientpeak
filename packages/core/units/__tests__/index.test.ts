import { describe, expect, it } from "vitest";
import {
  canonicalEffortValue,
  formatDistance,
  formatPace,
  formatSpeed,
  formatWeight,
  kgToLbs,
  kmToMiles,
  lbsToKg,
  milesToKm,
  preferredUnitSystemSchema,
  resolvePreferredUnitSystem,
} from "..";

describe("preferred unit systems", () => {
  it("has a bounded persisted contract and metric fallback", () => {
    expect(preferredUnitSystemSchema.safeParse("imperial").success).toBe(true);
    expect(preferredUnitSystemSchema.safeParse("customary").success).toBe(false);
    expect(resolvePreferredUnitSystem(null)).toBe("metric");
    expect(resolvePreferredUnitSystem("imperial")).toBe("imperial");
  });
});

describe("canonical effort units", () => {
  it.each([
    ["power", 1.2, "kW", { value: 1200, unit: "watts" }],
    ["speed", 36, "km/h", { value: 10, unit: "meters_per_second" }],
    ["speed", 10, "mph", { value: 4.4704, unit: "meters_per_second" }],
  ] as const)("normalizes %s aliases", (kind, value, unit, expected) => {
    expect(canonicalEffortValue({ kind, value, unit })).toEqual(expected);
  });

  it("rejects aliases outside the effort kind boundary", () => {
    expect(canonicalEffortValue({ kind: "power", value: 5, unit: "m/s" })).toBeNull();
  });
});

describe("SI display formatting", () => {
  it("preserves existing formatter output and precision", () => {
    expect(formatDistance(1_500)).toBe("1.50 km");
    expect(formatDistance(1_500, "imperial")).toBe("4921 ft");
    expect(formatSpeed(10)).toBe("36.0 km/h");
    expect(formatPace(4)).toBe("0:04/km");
    expect(formatWeight(70)).toBe("70.0 kg");
  });
});

describe("SI conversion round trips", () => {
  it("round trips the existing distance and mass conversions within their established precision", () => {
    expect(milesToKm(kmToMiles(42.195))).toBeCloseTo(42.195, 5);
    expect(lbsToKg(kgToLbs(70))).toBeCloseTo(70, 5);
  });
});

import { describe, expect, it } from "vitest";
import {
  canonicalEffortValue,
  displayUnitValueSchema,
  formatDisplayUnitValue,
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
  toCanonicalUnitValue,
  toDisplayUnitValue,
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
    ["speed", 4.2, "meters_per_second", { value: 4.2, unit: "meters_per_second" }],
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

describe("canonical display/input unit adapter", () => {
  it("formats canonical values in each preferred system with derived labels", () => {
    expect(
      toDisplayUnitValue({ dimension: "distance", value: 5_000, unit: "meters" }, "metric"),
    ).toEqual({ dimension: "distance", value: 5, unit: "kilometers" });
    expect(
      formatDisplayUnitValue(
        toDisplayUnitValue({ dimension: "distance", value: 5_000, unit: "meters" }, "imperial"),
      ),
    ).toBe("3.1 mi");
    expect(
      formatDisplayUnitValue(
        toDisplayUnitValue({ dimension: "temperature", value: 20, unit: "celsius" }, "imperial"),
      ),
    ).toBe("68.0 °F");
    expect(
      formatDisplayUnitValue(
        toDisplayUnitValue(
          { dimension: "running_pace", value: 300, unit: "seconds_per_kilometer" },
          "imperial",
        ),
      ),
    ).toBe("8:03/mi");
    expect(
      formatDisplayUnitValue(
        toDisplayUnitValue(
          { dimension: "swimming_pace", value: 100, unit: "seconds_per_100_meters" },
          "imperial",
        ),
      ),
    ).toBe("1:31/100yd");
  });

  it.each([
    { dimension: "distance", value: 5_000, unit: "meters" },
    { dimension: "elevation", value: 884.8, unit: "meters" },
    { dimension: "height", value: 1.75, unit: "meters" },
    { dimension: "pool_length", value: 25, unit: "meters" },
    { dimension: "speed", value: 4.2, unit: "meters_per_second" },
    { dimension: "mass", value: 70, unit: "kilograms" },
    { dimension: "temperature", value: 20, unit: "celsius" },
    { dimension: "running_pace", value: 300, unit: "seconds_per_kilometer" },
    { dimension: "swimming_pace", value: 100, unit: "seconds_per_100_meters" },
  ] as const)("round trips $dimension through both systems", (canonical) => {
    for (const unitSystem of ["metric", "imperial"] as const) {
      const roundTripped = toCanonicalUnitValue(toDisplayUnitValue(canonical, unitSystem));
      expect(roundTripped).not.toBeNull();
      expect(roundTripped?.value).toBeCloseTo(canonical.value, 5);
    }
  });

  it("rejects unknown, mismatched, and invalid display input at the canonical boundary", () => {
    const invalidInputs = [
      { dimension: "distance", value: 5, unit: "feet" },
      { dimension: "temperature", value: 20, unit: "miles" },
      { dimension: "distance", value: 5, unit: "leagues" },
      { dimension: "mystery", value: 5, unit: "meters" },
      { dimension: "mass", value: Number.POSITIVE_INFINITY, unit: "kilograms" },
      { dimension: "distance", value: 5, unit: "kilometers", label: "km" },
    ];

    for (const input of invalidInputs) {
      expect(displayUnitValueSchema.safeParse(input).success).toBe(false);
      expect(toCanonicalUnitValue(input)).toBeNull();
    }
  });
});

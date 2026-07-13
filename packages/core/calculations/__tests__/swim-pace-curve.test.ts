import { describe, expect, it } from "vitest";
import {
  deriveSwimPaceCurveFromCSS,
  pacePerHundredMetersToSpeed,
  speedToPacePerHundredMeters,
} from "../swim-pace-curve";

describe("deriveSwimPaceCurveFromCSS", () => {
  it("returns only a 30-minute CSS anchor", () => {
    expect(deriveSwimPaceCurveFromCSS(90)).toEqual([
      {
        duration_seconds: 1_800,
        effort_type: "speed",
        value: 1.11,
        unit: "meters_per_second",
        activity_category: "swim",
      },
    ]);
  });

  it.each([0, 44, 601, Number.NaN])("rejects invalid CSS %s", (css) => {
    expect(() => deriveSwimPaceCurveFromCSS(css)).toThrow();
  });

  it("accepts every canonical onboarding/profile CSS bound", () => {
    expect(deriveSwimPaceCurveFromCSS(45)).toHaveLength(1);
    expect(deriveSwimPaceCurveFromCSS(600)).toHaveLength(1);
  });
});

describe("swim pace conversions", () => {
  it("keeps conversion helpers available", () => {
    expect(pacePerHundredMetersToSpeed(80)).toBe(1.25);
    expect(speedToPacePerHundredMeters(1.25)).toBe(80);
  });
});

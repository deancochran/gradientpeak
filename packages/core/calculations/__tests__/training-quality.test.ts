import { describe, expect, it } from "vitest";
import {
  analyzeActivityIntensity,
  calculateRollingTrainingQuality,
  getIntensityAdjustedATLTimeConstant,
} from "../training-quality";

describe("training quality", () => {
  it("uses power zones when available", () => {
    const profile = analyzeActivityIntensity({
      power_zone_1_seconds: 300,
      power_zone_2_seconds: 300,
      power_zone_3_seconds: 200,
      power_zone_4_seconds: 100,
      power_zone_5_seconds: 50,
      power_zone_6_seconds: 50,
      power_zone_7_seconds: 0,
      hr_zone_5_seconds: 999,
    });

    expect(profile.source).toBe("power");
  });

  it("falls back to hr zones when power zones are missing", () => {
    const profile = analyzeActivityIntensity({
      hr_zone_1_seconds: 500,
      hr_zone_2_seconds: 300,
      hr_zone_3_seconds: 100,
      hr_zone_4_seconds: 50,
      hr_zone_5_seconds: 50,
    });

    expect(profile.source).toBe("hr");
  });

  it("falls back to neutral profile when zone data is missing", () => {
    const profile = analyzeActivityIntensity({});
    expect(profile.source).toBe("neutral");
    expect(profile.low_intensity_ratio).toBe(0.7);
    expect(profile.moderate_intensity_ratio).toBe(0.2);
    expect(profile.high_intensity_ratio).toBe(0.1);
  });

  it("handles null-heavy zone data without throwing", () => {
    const profile = analyzeActivityIntensity({
      power_zone_1_seconds: null,
      power_zone_2_seconds: null,
      hr_zone_1_seconds: null,
      hr_zone_5_seconds: null,
    });

    expect(profile.source).toBe("neutral");
  });

  it("computes rolling quality weighted by tss", () => {
    const asOf = new Date("2026-03-01T00:00:00Z");
    const profile = calculateRollingTrainingQuality(
      [
        {
          started_at: "2026-02-25T00:00:00Z",
          tss: 200,
          power_zone_1_seconds: 100,
          power_zone_2_seconds: 100,
          power_zone_3_seconds: 100,
          power_zone_4_seconds: 100,
          power_zone_5_seconds: 0,
          power_zone_6_seconds: 300,
          power_zone_7_seconds: 300,
        },
        {
          started_at: "2026-02-20T00:00:00Z",
          tss: 20,
          power_zone_1_seconds: 300,
          power_zone_2_seconds: 300,
          power_zone_3_seconds: 0,
          power_zone_4_seconds: 0,
          power_zone_5_seconds: 0,
          power_zone_6_seconds: 0,
          power_zone_7_seconds: 0,
        },
      ],
      28,
      asOf,
    );

    expect(profile.source).toBe("power");
    expect(profile.high_intensity_ratio).toBeGreaterThan(0.2);
    expect(profile.atl_extension_days).toBe(2);
  });

  it("ignores invalid date rows safely", () => {
    const profile = calculateRollingTrainingQuality([
      { started_at: "not-a-date", tss: 100, hr_zone_5_seconds: 100 },
    ]);

    expect(profile.source).toBe("neutral");
  });

  it("adjusts atl time constant by intensity extension", () => {
    const neutral = getIntensityAdjustedATLTimeConstant(7);
    const stressed = getIntensityAdjustedATLTimeConstant(7, {
      source: "power",
      low_intensity_ratio: 0.4,
      moderate_intensity_ratio: 0.3,
      high_intensity_ratio: 0.3,
      load_factor: 1.5,
      atl_extension_days: 2,
    });

    expect(neutral).toBe(7);
    expect(stressed).toBe(9);
  });
});

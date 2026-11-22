import { describe, expect, it } from "vitest";
import { calculateAvailableCommonLoad } from "../../load/common-relative-load";
import {
  analyzeActivityIntensity,
  calculateRollingTrainingQuality,
  getIntensityAdjustedRecentLoadTimeConstant,
} from "../training-quality";

function availableCommonLoad(intensity: number) {
  return calculateAvailableCommonLoad({
    activity_category: "bike",
    method: "power_threshold",
    intensity,
    contributingDurationSeconds: 3600,
    quality: {
      source: "validated_test",
      observed_at: "2026-02-25T00:00:00Z",
      valid_at: "2026-02-25T00:00:00Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "test-v1",
      evidence_fingerprint: "test-evidence",
    },
    thresholdEvidence: {
      type: "ftp_watts",
      value: 250,
      unit: "watts",
      source: "validated_test",
      observedAt: "2026-02-25T00:00:00Z",
      validAt: "2026-02-25T00:00:00Z",
      freshness: "current",
      calculationVersion: "test-v1",
      sourceFingerprint: "test-evidence",
    },
    evidenceFingerprint: "test-evidence",
    computedAsOf: "2026-02-25T00:00:00Z",
    estimated: false,
  });
}

describe("training quality", () => {
  it("uses power zones when available", () => {
    const profile = analyzeActivityIntensity({
      zones: {
        power: [
          { zone: 1, seconds: 300, label: "Zone 1" },
          { zone: 2, seconds: 300, label: "Zone 2" },
          { zone: 3, seconds: 200, label: "Zone 3" },
          { zone: 4, seconds: 100, label: "Zone 4" },
          { zone: 5, seconds: 50, label: "Zone 5" },
          { zone: 6, seconds: 50, label: "Zone 6" },
        ],
        hr: [{ zone: 5, seconds: 999, label: "Zone 5" }],
      },
    });

    expect(profile.source).toBe("power");
  });

  it("falls back to hr zones when power zones are missing", () => {
    const profile = analyzeActivityIntensity({
      zones: {
        hr: [
          { zone: 1, seconds: 500, label: "Zone 1" },
          { zone: 2, seconds: 300, label: "Zone 2" },
          { zone: 3, seconds: 100, label: "Zone 3" },
          { zone: 4, seconds: 50, label: "Zone 4" },
          { zone: 5, seconds: 50, label: "Zone 5" },
        ],
      },
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

  it("uses available Common Load intensity when zone data is unavailable", () => {
    const profile = analyzeActivityIntensity({
      common_load: availableCommonLoad(0.92),
    });

    expect(profile.source).toBe("neutral");
    expect(profile.high_intensity_ratio).toBeGreaterThan(0.5);
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

  it("computes rolling quality weighted by Common Load", () => {
    const asOf = new Date("2026-03-01T00:00:00Z");
    const profile = calculateRollingTrainingQuality(
      [
        {
          started_at: "2026-02-25T00:00:00Z",
          common_load: availableCommonLoad(1.1),
          zones: {
            power: [
              { zone: 1, seconds: 100, label: "Zone 1" },
              { zone: 2, seconds: 100, label: "Zone 2" },
              { zone: 3, seconds: 100, label: "Zone 3" },
              { zone: 4, seconds: 100, label: "Zone 4" },
              { zone: 6, seconds: 300, label: "Zone 6" },
              { zone: 7, seconds: 300, label: "Zone 7" },
            ],
          },
        },
        {
          started_at: "2026-02-20T00:00:00Z",
          common_load: availableCommonLoad(0.6),
          zones: {
            power: [
              { zone: 1, seconds: 300, label: "Zone 1" },
              { zone: 2, seconds: 300, label: "Zone 2" },
            ],
          },
        },
      ],
      28,
      asOf,
    );

    expect(profile.source).toBe("power");
    expect(profile.high_intensity_ratio).toBeGreaterThan(0.2);
    expect(profile.recent_load_extension_days).toBe(2);
  });

  it("ignores invalid date rows safely", () => {
    const profile = calculateRollingTrainingQuality([
      {
        started_at: "not-a-date",
        common_load: availableCommonLoad(1),
        zones: { hr: [{ zone: 5, seconds: 100, label: "Zone 5" }] },
      },
    ]);

    expect(profile.source).toBe("neutral");
  });

  it("computes rolling quality from Common Load intensity fallback", () => {
    const profile = calculateRollingTrainingQuality(
      [
        {
          started_at: "2026-02-25T00:00:00Z",
          common_load: availableCommonLoad(0.9),
        },
        {
          started_at: "2026-02-20T00:00:00Z",
          common_load: availableCommonLoad(0.68),
        },
      ],
      28,
      new Date("2026-03-01T00:00:00Z"),
    );

    expect(profile.high_intensity_ratio).toBeGreaterThan(0.3);
  });

  it("adjusts recentLoad time constant by intensity extension", () => {
    const neutral = getIntensityAdjustedRecentLoadTimeConstant(7);
    const stressed = getIntensityAdjustedRecentLoadTimeConstant(7, {
      source: "power",
      low_intensity_ratio: 0.4,
      moderate_intensity_ratio: 0.3,
      high_intensity_ratio: 0.3,
      load_factor: 1.5,
      recent_load_extension_days: 2,
    });

    expect(neutral).toBe(7);
    expect(stressed).toBe(9);
  });
});

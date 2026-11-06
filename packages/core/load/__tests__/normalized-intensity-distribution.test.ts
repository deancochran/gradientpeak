import { describe, expect, it } from "vitest";

import {
  buildNormalizedIntensityDistribution,
  NORMALIZED_INTENSITY_BANDS,
  NORMALIZED_INTENSITY_DISTRIBUTION_MAX_OBSERVATIONS,
} from "../normalized-intensity-distribution";

describe("buildNormalizedIntensityDistribution", () => {
  it("uses canonical normalized-intensity boundaries and duration-weighted percentages", () => {
    const result = buildNormalizedIntensityDistribution({
      sourceStatus: "complete",
      observations: [
        { status: "complete", intensity: 0.54, durationSeconds: 900 },
        { status: "complete", intensity: 0.55, durationSeconds: 1_800 },
        { status: "complete", intensity: 0.75, durationSeconds: 900 },
      ],
    });

    expect(result.status).toBe("complete");
    expect(result.contributingDurationSeconds).toBe(3_600);
    expect(result.bands).toHaveLength(7);
    expect(
      result.bands.map(({ band, minimumIntensity, maximumIntensity }) => ({
        band,
        minimumIntensity,
        maximumIntensity,
      })),
    ).toEqual(NORMALIZED_INTENSITY_BANDS);
    expect(result.bands.find((band) => band.band === "recovery")).toMatchObject({
      durationSeconds: 900,
      percentage: 25,
    });
    expect(result.bands.find((band) => band.band === "endurance")).toMatchObject({
      durationSeconds: 1_800,
      percentage: 50,
    });
    expect(result.bands.find((band) => band.band === "tempo")).toMatchObject({
      durationSeconds: 900,
      percentage: 25,
    });
    expect(result.bands.reduce((total, band) => total + band.percentage, 0)).toBeCloseTo(100, 8);
  });

  it("retains finite known duration for partial evidence and normalizes its distribution", () => {
    const result = buildNormalizedIntensityDistribution({
      sourceStatus: "partial",
      observations: [
        { status: "partial", intensity: 0.8, durationSeconds: 1_200 },
        { status: "complete", intensity: 1, durationSeconds: 600 },
      ],
    });

    expect(result.status).toBe("partial");
    expect(result.contributingDurationSeconds).toBe(1_800);
    expect(result.bands.find((band) => band.band === "tempo")?.percentage).toBe(66.67);
    expect(result.bands.find((band) => band.band === "vo2max")?.percentage).toBe(33.33);
    expect(result.bands.reduce((total, band) => total + band.percentage, 0)).toBe(100);
  });

  it("keeps unavailable source coverage numeric-free and bounds input work", () => {
    expect(
      buildNormalizedIntensityDistribution({
        sourceStatus: "unavailable",
        observations: [{ status: "complete", intensity: 0.8, durationSeconds: 1_800 }],
      }),
    ).toEqual({ status: "unavailable", contributingDurationSeconds: null, bands: [] });

    expect(() =>
      buildNormalizedIntensityDistribution({
        sourceStatus: "complete",
        observations: Array.from(
          { length: NORMALIZED_INTENSITY_DISTRIBUTION_MAX_OBSERVATIONS + 1 },
          () => ({ status: "known_zero" as const, intensity: null, durationSeconds: 0 }),
        ),
      }),
    ).toThrow();
  });
});

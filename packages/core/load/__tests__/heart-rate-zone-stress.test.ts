import { describe, expect, it } from "vitest";
import { calculateHeartRateZoneStress } from "../heart-rate-zone-stress";

describe("calculateHeartRateZoneStress", () => {
  it("integrates zone durations and derives an equivalent IF", () => {
    const result = calculateHeartRateZoneStress({
      durationSeconds: 3600,
      lthrBpm: 160,
      distribution: {
        coverageSeconds: 3600,
        buckets: [
          { bpm: 120, seconds: 1800 },
          { bpm: 160, seconds: 1800 },
        ],
      },
    });

    expect(result).toMatchObject({
      tss: 79.63,
      equivalentIntensityFactor: 0.8923,
      coverageRatio: 1,
      zoneSeconds: [1800, 0, 0, 0, 1800],
      calculationVersion: "heart-rate-zones-v1",
    });
    const expectedRawTss = (1800 / 3600) * 0.7 ** 2 * 100 + (1800 / 3600) * 1.05 ** 2 * 100;
    expect(result?.rawTss).toBe(expectedRawTss);
    expect(result?.rawEquivalentIntensityFactor).toBe(
      Math.sqrt(expectedRawTss / ((3600 / 3600) * 100)),
    );
  });

  it("abstains when coverage is insufficient", () => {
    expect(
      calculateHeartRateZoneStress({
        durationSeconds: 3600,
        lthrBpm: 160,
        distribution: { coverageSeconds: 1200, buckets: [{ bpm: 150, seconds: 1200 }] },
      }),
    ).toBeNull();
  });

  it.each([
    {
      coverageSeconds: 3601,
      buckets: [{ bpm: 150, seconds: 3601 }],
    },
    {
      coverageSeconds: 3600,
      buckets: [{ bpm: 150, seconds: 3599 }],
    },
  ])("rejects coverage that cannot fit the activity duration", (distribution) => {
    expect(
      calculateHeartRateZoneStress({ durationSeconds: 3600, lthrBpm: 160, distribution }),
    ).toBeNull();
  });

  it.each([
    { lthrBpm: 79, bpm: 150, seconds: 3600 },
    { lthrBpm: 160, bpm: 251, seconds: 3600 },
    { lthrBpm: 160, bpm: 150, seconds: Number.NaN },
  ])("rejects invalid threshold or distribution values", ({ lthrBpm, bpm, seconds }) => {
    expect(
      calculateHeartRateZoneStress({
        durationSeconds: 3600,
        lthrBpm,
        distribution: { coverageSeconds: 3600, buckets: [{ bpm, seconds }] },
      }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { extractBestEfforts } from "../best-efforts";
import {
  ACTIVITY_FILE_LTHR_CALCULATION_VERSION,
  detectLactateThresholdHeartRateFromBestEfforts,
} from "../threshold-detection";

describe("detectLactateThresholdHeartRateFromBestEfforts", () => {
  it("propagates the canonical exact 20-minute HR effort", () => {
    const extraction = extractBestEfforts({
      metric: "heart_rate",
      samples: Array.from({ length: 1_301 }, (_, timestampSeconds) => ({
        timestampSeconds,
        value: timestampSeconds <= 50 ? 140 : 170,
      })),
      config: { durationsSeconds: [1_200] },
    });

    expect(detectLactateThresholdHeartRateFromBestEfforts(extraction)).toMatchObject({
      valueBpm: 162,
      calculationVersion: ACTIVITY_FILE_LTHR_CALCULATION_VERSION,
      sourceEffortCalculationVersion: extraction.calculationVersion,
      sourceEffort: {
        status: "available",
        durationSeconds: 1_200,
        startTimestampSeconds: 50,
        endTimestampSeconds: 1_250,
        windowCoverage: 1,
      },
    });
  });

  it("does not propagate an incomplete 20-minute window or a non-HR extraction", () => {
    const incomplete = extractBestEfforts({
      metric: "heart_rate",
      samples: [
        { timestampSeconds: 0, value: 170 },
        { timestampSeconds: 600, value: 170 },
        { timestampSeconds: 1_200, value: 170 },
      ],
      config: { durationsSeconds: [1_200] },
    });
    const power = extractBestEfforts({
      metric: "power",
      samples: [
        { timestampSeconds: 0, value: 170 },
        { timestampSeconds: 1_200, value: 170 },
      ],
      config: { durationsSeconds: [1_200], maxGapSeconds: 1_200 },
    });

    expect(detectLactateThresholdHeartRateFromBestEfforts(incomplete)).toBeNull();
    expect(detectLactateThresholdHeartRateFromBestEfforts(power)).toBeNull();
  });
});

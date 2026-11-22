import { describe, expect, it } from "vitest";
import { extractBestEfforts } from "../best-efforts";
import {
  ACTIVITY_FILE_LTHR_CALCULATION_VERSION,
  detectLactateThresholdHeartRate,
} from "../threshold-detection";

describe("detectLactateThresholdHeartRate", () => {
  it("selects the 30-minute HR effort and uses only its final 20-minute time-weighted window", () => {
    const samples = Array.from({ length: 1_801 }, (_, timestampSeconds) => ({
      timestampSeconds,
      value: timestampSeconds <= 600 ? 120 : 170,
    }));
    const extraction = extractBestEfforts({
      metric: "heart_rate",
      samples,
      config: { durationsSeconds: [1_800] },
    });

    expect(detectLactateThresholdHeartRate({ extraction, samples })).toMatchObject({
      valueBpm: 170,
      calculationVersion: ACTIVITY_FILE_LTHR_CALCULATION_VERSION,
      sourceEffortCalculationVersion: extraction.calculationVersion,
      sourceEffort: {
        status: "available",
        durationSeconds: 1_800,
        startTimestampSeconds: 0,
        endTimestampSeconds: 1_800,
      },
      thresholdWindow: {
        status: "available",
        durationSeconds: 1_200,
        startTimestampSeconds: 600,
        endTimestampSeconds: 1_800,
        windowCoverage: 1,
      },
    });
  });

  it("does not substitute the removed 20-minute times 0.95 algorithm", () => {
    const samples = Array.from({ length: 1_201 }, (_, timestampSeconds) => ({
      timestampSeconds,
      value: 170,
    }));
    const twentyMinuteOnly = extractBestEfforts({
      metric: "heart_rate",
      samples,
      config: { durationsSeconds: [1_200] },
    });
    const power = extractBestEfforts({
      metric: "power",
      samples: [
        { timestampSeconds: 0, value: 170 },
        { timestampSeconds: 1_800, value: 170 },
      ],
      config: { durationsSeconds: [1_800], maxGapSeconds: 1_800 },
    });

    expect(detectLactateThresholdHeartRate({ extraction: twentyMinuteOnly, samples })).toBeNull();
    expect(detectLactateThresholdHeartRate({ extraction: power, samples })).toBeNull();
  });
});

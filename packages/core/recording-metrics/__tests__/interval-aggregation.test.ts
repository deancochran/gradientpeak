import { describe, expect, it } from "vitest";

import {
  calculateIntervalWeightedMetric,
  deriveClippedIntervalMetricEvidence,
} from "../interval-aggregation";

describe("calculateIntervalWeightedMetric", () => {
  it("weights each value by its preceding same-metric interval", () => {
    expect(
      calculateIntervalWeightedMetric({
        samples: [
          { timestampSeconds: 0, value: 120 },
          { timestampSeconds: 1, value: 160 },
          { timestampSeconds: 4, value: 180 },
        ],
        activeIntervals: [{ startSeconds: 0, endSeconds: 4 }],
      }),
    ).toEqual({ average: 175, maximum: 180, coverageSeconds: 4 });
  });

  it("does not hold values over gaps and clips represented intervals around pauses", () => {
    expect(
      calculateIntervalWeightedMetric({
        samples: [
          { timestampSeconds: 0, value: 100 },
          { timestampSeconds: 10, value: 200 },
          { timestampSeconds: 20, value: 300 },
        ],
        activeIntervals: [
          { startSeconds: 0, endSeconds: 5 },
          { startSeconds: 15, endSeconds: 20 },
        ],
      }),
    ).toEqual({ average: null, maximum: null, coverageSeconds: 0 });

    expect(
      calculateIntervalWeightedMetric({
        samples: [
          { timestampSeconds: 0, value: 100 },
          { timestampSeconds: 10, value: 200 },
          { timestampSeconds: 20, value: 300 },
          { timestampSeconds: 30, value: 400 },
        ],
        activeIntervals: [
          { startSeconds: 0, endSeconds: 15 },
          { startSeconds: 25, endSeconds: 30 },
        ],
        maxGapSeconds: 10,
      }),
    ).toEqual({ average: 275, maximum: 400, coverageSeconds: 20 });
  });

  it("counts a sparse interval crossing adjacent segment windows once", () => {
    expect(
      calculateIntervalWeightedMetric({
        samples: [
          { timestampSeconds: 0, value: 100 },
          { timestampSeconds: 9, value: 200 },
          { timestampSeconds: 11, value: 300 },
        ],
        activeIntervals: [
          { startSeconds: 0, endSeconds: 10 },
          { startSeconds: 10, endSeconds: 20 },
        ],
        maxGapSeconds: 10,
      }),
    ).toEqual({ average: 2400 / 11, maximum: 300, coverageSeconds: 11 });
  });

  it("clips a paused timeline exactly, including fractional pause boundaries", () => {
    const input = {
      samples: [0, 1, 2, 3, 4].map((timestampSeconds) => ({
        timestampSeconds,
        value: 100 + timestampSeconds * 100,
      })),
      activeIntervals: [
        { startSeconds: 0, endSeconds: 1.5 },
        { startSeconds: 2.5, endSeconds: 4 },
      ],
    };
    expect(deriveClippedIntervalMetricEvidence(input)).toEqual([
      { startSeconds: 0, endSeconds: 1, value: 200 },
      { startSeconds: 1, endSeconds: 1.5, value: 300 },
      { startSeconds: 2.5, endSeconds: 3, value: 400 },
      { startSeconds: 3, endSeconds: 4, value: 500 },
    ]);
    expect(calculateIntervalWeightedMetric(input).coverageSeconds).toBe(3);
  });

  it("does not invent coverage over an unknown six-second gap", () => {
    expect(
      calculateIntervalWeightedMetric({
        samples: [
          { timestampSeconds: 0, value: 100 },
          { timestampSeconds: 6, value: 200 },
          { timestampSeconds: 7, value: 300 },
        ],
        activeIntervals: [{ startSeconds: 0, endSeconds: 7 }],
      }),
    ).toEqual({ average: 300, maximum: 300, coverageSeconds: 1 });
  });

  it("produces one clipped interval per represented second for a 20k-sample workload", () => {
    const samples = Array.from({ length: 20_000 }, (_, timestampSeconds) => ({
      timestampSeconds,
      value: 200,
    }));
    expect(
      deriveClippedIntervalMetricEvidence({
        samples,
        activeIntervals: [{ startSeconds: 0, endSeconds: 20_000 }],
      }),
    ).toHaveLength(19_999);
  });
});

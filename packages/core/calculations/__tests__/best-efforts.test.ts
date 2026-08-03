import { describe, expect, it } from "vitest";
import {
  BEST_EFFORT_CALCULATION_VERSION,
  type BestEffortMetric,
  DEFAULT_BEST_EFFORT_MAX_GAP_SECONDS,
  extractBestEfforts,
} from "../best-efforts";

function extract(input: {
  values: readonly (number | null)[];
  timestamps: readonly number[];
  included?: readonly boolean[];
  durationSeconds?: number;
  metric?: BestEffortMetric;
  maxGapSeconds?: number;
  unpositionedValueCount?: number;
}) {
  return extractBestEfforts({
    metric: input.metric ?? "power",
    samples: input.timestamps.map((timestampSeconds, index) => {
      const value = input.values[index];
      const included = input.included?.[index];
      if (value === undefined) throw new Error("Test values and timestamps must align");
      return {
        timestampSeconds,
        value,
        ...(included === undefined ? {} : { included }),
      };
    }),
    config: {
      durationsSeconds: [input.durationSeconds ?? 3],
      maxGapSeconds: input.maxGapSeconds ?? DEFAULT_BEST_EFFORT_MAX_GAP_SECONDS,
      unpositionedValueCount: input.unpositionedValueCount ?? 0,
    },
  });
}

describe("extractBestEfforts", () => {
  it("uses the current observation for the preceding interval and preserves exact boundaries", () => {
    const extraction = extract({
      values: [10, 10, 10, 10, 20, 20, 20, 10],
      timestamps: [0, 1, 2, 3, 4, 5, 6, 7],
    });

    expect(extraction).toMatchObject({
      calculationVersion: BEST_EFFORT_CALCULATION_VERSION,
      metric: "power",
      unit: "watts",
      intervalConvention: "current_sample_applies_to_preceding_interval",
      results: [
        {
          status: "available",
          durationSeconds: 3,
          value: 20,
          startTimestampSeconds: 3,
          endTimestampSeconds: 6,
          contributingDurationSeconds: 3,
          windowCoverage: 1,
        },
      ],
    });
  });

  it("uses duration-weighted means for irregular samples and exact interior boundaries", () => {
    const extraction = extract({
      values: [10, 10, 20, 40],
      timestamps: [0, 0.5, 2, 3],
      durationSeconds: 2,
    });

    expect(extraction.results[0]).toEqual({
      status: "available",
      durationSeconds: 2,
      value: 30,
      startTimestampSeconds: 1,
      endTimestampSeconds: 3,
      contributingDurationSeconds: 2,
      windowCoverage: 1,
    });
  });

  it("does not bridge a missing interval and reports surviving evidence as partial", () => {
    const extraction = extract({
      values: [100, 100, null, 200, 200],
      timestamps: [0, 1, 2, 3, 4],
      durationSeconds: 2,
    });

    expect(extraction.results[0]).toMatchObject({
      status: "partial",
      reason: "source_incomplete",
      value: 200,
      startTimestampSeconds: 2,
      endTimestampSeconds: 4,
    });
    expect(extraction.diagnostics).toMatchObject({
      excludedMissingDurationSeconds: 1,
      segmentCount: 2,
      maximumContinuousDurationSeconds: 2,
      sourceTimeCoverage: 0.75,
    });
  });

  it("rejects an incomplete duration assembled from valid fragments", () => {
    const extraction = extract({
      values: [100, 100, null, 200, 200],
      timestamps: [0, 1, 2, 3, 4],
      durationSeconds: 3,
    });

    expect(extraction.results[0]).toEqual({
      status: "unavailable",
      reason: "insufficient_contiguous_coverage",
      durationSeconds: 3,
      value: null,
    });
  });

  it("excludes pauses, resets the window, and keeps known inactivity out of source coverage", () => {
    const extraction = extract({
      values: [100, 100, 999, 200, 200],
      timestamps: [0, 1, 2, 3, 4],
      included: [true, true, false, true, true],
      durationSeconds: 2,
    });

    expect(extraction.results[0]).toMatchObject({
      status: "available",
      value: 200,
      startTimestampSeconds: 2,
      endTimestampSeconds: 4,
    });
    expect(extraction.diagnostics).toMatchObject({
      excludedInactiveDurationSeconds: 1,
      sourceTimeCoverage: 1,
    });
  });

  it("does not cross a sparse gap and exposes the source defect", () => {
    const extraction = extract({
      values: [100, 100, 999, 200, 200],
      timestamps: [0, 1, 10, 11, 12],
      durationSeconds: 2,
    });

    expect(extraction.results[0]).toMatchObject({
      status: "partial",
      reason: "source_incomplete",
      value: 200,
      startTimestampSeconds: 10,
      endTimestampSeconds: 12,
    });
    expect(extraction.diagnostics.excludedGapDurationSeconds).toBe(9);
  });

  it("ignores duplicate and reversed timestamps without replacing the accepted anchor", () => {
    const extraction = extract({
      values: [0, 100, 999, 999, 100],
      timestamps: [0, 1, 1, 0.5, 2],
      durationSeconds: 2,
    });

    expect(extraction.results[0]).toMatchObject({
      status: "partial",
      value: 100,
      startTimestampSeconds: 0,
      endTimestampSeconds: 2,
    });
    expect(extraction.diagnostics).toMatchObject({
      acceptedSampleCount: 3,
      duplicateTimestampCount: 1,
      reversedTimestampCount: 1,
    });
  });

  it("marks positionless source values as partial without fabricating their timestamps", () => {
    const extraction = extract({
      values: [0, 100, 100],
      timestamps: [0, 1, 2],
      durationSeconds: 2,
      unpositionedValueCount: 1,
    });

    expect(extraction.results[0]).toMatchObject({
      status: "partial",
      reason: "source_incomplete",
      value: 100,
    });
    expect(extraction.diagnostics.unpositionedValueCount).toBe(1);
  });

  it.each([
    ["power", "watts"],
    ["speed", "meters_per_second"],
    ["grade_adjusted_speed", "meters_per_second"],
    ["heart_rate", "bpm"],
  ] as const)("applies identical extraction semantics to %s", (metric, unit) => {
    const extraction = extract({
      metric,
      values: [0, 10, 20, 30],
      timestamps: [0, 1, 2, 3],
      durationSeconds: 2,
    });

    expect(extraction).toMatchObject({ metric, unit });
    expect(extraction.results[0]).toMatchObject({
      status: "available",
      value: 25,
      startTimestampSeconds: 1,
      endTimestampSeconds: 3,
    });
  });

  it("returns evidence-backed unavailable reasons", () => {
    expect(
      extractBestEfforts({
        metric: "power",
        samples: [],
        config: { durationsSeconds: [5] },
      }).results[0],
    ).toEqual({
      status: "unavailable",
      reason: "no_samples",
      durationSeconds: 5,
      value: null,
    });
    expect(
      extract({ values: [0, null], timestamps: [0, 1], durationSeconds: 1 }).results[0],
    ).toEqual({
      status: "unavailable",
      reason: "no_contributing_intervals",
      durationSeconds: 1,
      value: null,
    });
  });

  it("rejects invalid samples and duplicate duration requests", () => {
    expect(() =>
      extractBestEfforts({
        metric: "power",
        samples: [
          { timestampSeconds: 0, value: 100 },
          { timestampSeconds: 1, value: Number.NaN },
        ],
      }),
    ).toThrow();
    expect(() =>
      extractBestEfforts({
        metric: "power",
        samples: [],
        config: { durationsSeconds: [5, 5] },
      }),
    ).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  calculateCriticalPower,
  calculateSeasonBestCurve,
  evaluateCriticalPower,
  type ObservedCriticalPowerEffort,
  selectCanonicalCriticalPowerEfforts,
} from "../critical-power";

// Helper to create mock efforts
const createEffort = (
  duration: number,
  value: number,
  overrides: Partial<ObservedCriticalPowerEffort> = {},
): ObservedCriticalPowerEffort => {
  const activityId = overrides.activity_id ?? `activity-${duration}`;
  return {
    activity_category: "bike",
    effort_type: "power",
    duration_seconds: duration,
    value,
    unit: "watts",
    recorded_at: new Date().toISOString(),
    activity_id: activityId,
    source: "imported",
    method: "activity_file_best_effort",
    provenance: { activity_id: activityId, derived_from: "activity_file_stream" },
    ...overrides,
  };
};

describe("calculateSeasonBestCurve", () => {
  it("should filter out non-bike activities", () => {
    const efforts = [
      createEffort(60, 300, { activity_category: "bike" }),
      createEffort(60, 400, { activity_category: "run" }),
    ];
    const result = calculateSeasonBestCurve(efforts);
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe(300);
  });

  it("should filter out non-power efforts", () => {
    const efforts = [
      createEffort(60, 300, { effort_type: "power" }),
      createEffort(60, 10, { effort_type: "speed" }),
    ];
    const result = calculateSeasonBestCurve(efforts);
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe(300);
  });

  it("should filter out old efforts", () => {
    const now = new Date("2024-01-01T12:00:00Z");
    const recent = new Date("2023-12-01T12:00:00Z").toISOString(); // 30 days ago
    const old = new Date("2023-09-01T12:00:00Z").toISOString(); // 120 days ago

    const efforts = [
      createEffort(60, 300, { recorded_at: recent }),
      createEffort(60, 400, { recorded_at: old }),
    ];

    const result = calculateSeasonBestCurve(efforts, { now, days: 90 });
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe(300);
  });

  it("should find the max value for each duration", () => {
    const efforts = [
      createEffort(60, 300),
      createEffort(60, 350), // Better 1 min
      createEffort(300, 250),
      createEffort(300, 240),
    ];

    const result = calculateSeasonBestCurve(efforts);
    expect(result).toHaveLength(2);

    const best1Min = result.find((e) => e.duration_seconds === 60);
    const best5Min = result.find((e) => e.duration_seconds === 300);

    expect(best1Min?.value).toBe(350);
    expect(best5Min?.value).toBe(250);
  });
});

describe("calculateCriticalPower", () => {
  it("selects one strongest deterministic observation per duration", () => {
    const selected = selectCanonicalCriticalPowerEfforts([
      createEffort(300, 320, {
        activity_id: "later-id",
        recorded_at: "2026-07-01T10:00:00.000Z",
      }),
      createEffort(300, 325, {
        activity_id: "stronger",
        recorded_at: "2026-06-01T10:00:00.000Z",
      }),
      createEffort(1_200, 275, {
        activity_id: "z-id",
        recorded_at: "2026-07-01T10:00:00.000Z",
      }),
      createEffort(1_200, 275, {
        activity_id: "a-id",
        recorded_at: "2026-07-01T10:00:00.000Z",
      }),
    ]);

    expect(
      selected.map(({ duration_seconds, activity_id, value }) => ({
        duration_seconds,
        activity_id,
        value,
      })),
    ).toEqual([
      { duration_seconds: 300, activity_id: "stronger", value: 325 },
      { duration_seconds: 1_200, activity_id: "a-id", value: 275 },
    ]);
  });

  it("keeps canonical threshold curves to materialized standard durations", () => {
    const selected = selectCanonicalCriticalPowerEfforts([
      createEffort(180, 340),
      createEffort(300, 320),
      createEffort(900, 280),
      createEffort(1_200, 270),
    ]);

    expect(selected.map((effort) => effort.duration_seconds)).toEqual([300, 1_200]);
  });

  it("requires at least three distinct observed points", () => {
    expect(calculateCriticalPower([createEffort(180, 330), createEffort(1_200, 260)])).toBeNull();
    expect(
      calculateCriticalPower([
        createEffort(180, 330),
        createEffort(180, 325),
        createEffort(1_200, 260),
      ]),
    ).toBeNull();
  });

  it("rejects any non-bike-power input", () => {
    const curve = [createEffort(180, 330), createEffort(600, 280), createEffort(1_200, 260)];
    expect(
      calculateCriticalPower([
        ...curve,
        createEffort(300, 5, { activity_category: "run", effort_type: "speed" }),
      ]),
    ).toBeNull();
  });

  it("fits positive finite CP/W' and reports the observed fit domain", () => {
    const curve = [
      createEffort(180, 250 + 15_000 / 180),
      createEffort(300, 250 + 15_000 / 300),
      createEffort(600, 250 + 15_000 / 600),
      createEffort(1_200, 250 + 15_000 / 1_200),
    ];

    const result = calculateCriticalPower(curve);
    expect(result).toMatchObject({
      source: "observed-curve-fit",
      cp: 250,
      wPrime: 15_000,
      fitMinDurationSeconds: 180,
      fitMaxDurationSeconds: 1_200,
      pointCount: 4,
      activityCount: 4,
    });
    expect(result?.rSquared).toBeGreaterThan(0.99);
    expect(result?.error).toBe(result?.rSquared);
    expect(result?.rmseWatts).toBeCloseTo(0, 8);
    expect(result?.residuals).toHaveLength(4);
    expect(result?.stability.maxPredictionChangeRatio).toBeCloseTo(0, 8);
  });

  it("predicts a held-out point within the observed domain", () => {
    const result = calculateCriticalPower([
      createEffort(180, 250 + 15_000 / 180),
      createEffort(300, 250 + 15_000 / 300),
      createEffort(900, 250 + 15_000 / 900),
      createEffort(1_200, 250 + 15_000 / 1_200),
    ]);

    expect(result).not.toBeNull();
    expect(result && Math.round(result.cp + result.wPrime / 600)).toBe(275);
  });

  it("requires trusted observations from at least two independent activities", () => {
    const sameActivity = [180, 600, 1_200].map((duration) =>
      createEffort(duration, 250 + 15_000 / duration, {
        activity_id: "one-activity",
        provenance: { activity_id: "one-activity", derived_from: "activity_file_stream" },
      }),
    );
    expect(evaluateCriticalPower(sameActivity)).toEqual({
      status: "abstained",
      reason: "insufficient-independent-activities",
    });

    expect(
      evaluateCriticalPower([
        createEffort(180, 333),
        createEffort(600, 275, { source: "estimated" }),
        createEffort(1_200, 263),
      ]),
    ).toEqual({ status: "abstained", reason: "untrusted-effort" });
  });

  it("rejects poor fits and point-dominated fits with explicit reasons", () => {
    expect(
      evaluateCriticalPower([
        createEffort(180, 340),
        createEffort(300, 300),
        createEffort(600, 292),
        createEffort(1_200, 250),
      ]),
    ).toMatchObject({ status: "abstained", reason: "poor-fit" });

    expect(
      evaluateCriticalPower(
        [
          createEffort(180, 340),
          createEffort(300, 300),
          createEffort(600, 276),
          createEffort(1_200, 263),
        ],
        { minRSquared: 0, maxPredictionChangeRatio: 0.001 },
      ),
    ).toMatchObject({ status: "abstained", reason: "dominant-point" });
  });

  it("requires coverage in both the 3-5m and 15-30m windows", () => {
    expect(
      calculateCriticalPower([
        createEffort(300, 320),
        createEffort(600, 290),
        createEffort(800, 270),
      ]),
    ).toBeNull();
    expect(
      calculateCriticalPower([
        createEffort(600, 290),
        createEffort(900, 275),
        createEffort(1_800, 260),
      ]),
    ).toBeNull();
  });

  it("rejects non-monotonic, non-finite, implausible, or non-positive fits", () => {
    expect(
      calculateCriticalPower([
        createEffort(180, 320),
        createEffort(600, 330),
        createEffort(1_200, 270),
      ]),
    ).toBeNull();
    expect(
      calculateCriticalPower([
        createEffort(180, Number.NaN),
        createEffort(600, 290),
        createEffort(1_200, 270),
      ]),
    ).toBeNull();
    expect(
      calculateCriticalPower([
        createEffort(180, 1_300),
        createEffort(600, 700),
        createEffort(1_200, 600),
      ]),
    ).toBeNull();
    expect(
      calculateCriticalPower([
        createEffort(180, 250),
        createEffort(600, 250),
        createEffort(1_200, 250),
      ]),
    ).toBeNull();
  });
});

import type { CanonicalCyclingDurationEffortEvidence } from "@repo/core";
import { getCalibrationRegistryEntry, selectCalibration } from "@repo/core/performance-calibration";
import { describe, expect, it } from "vitest";
import {
  evaluateBikeThresholdPowerEvidence,
  evaluateRunThresholdSpeedEvidence,
} from "./reconcile-performance-calibrations";

function runWindow(durationSeconds: number, value: number) {
  return {
    activity_category: "run",
    duration_seconds: durationSeconds,
    value,
    provenance: {
      source_series: "grade_adjusted_speed",
      output_window_coverage: 1,
      maximum_gap_seconds: 1,
      output_coefficient_of_variation: 0.05,
    },
  } as never;
}

function bikeEffort(
  id: string,
  activityId: string,
  durationSeconds: number,
  value: number,
): CanonicalCyclingDurationEffortEvidence {
  return {
    observationId: id,
    evidenceId: id,
    evidenceRevision: 1,
    athleteId: "profile-1",
    activityId,
    segmentId: `segment-${activityId}`,
    recordedAt: "2026-08-10T11:00:00.000Z",
    activityCategory: "bike",
    metric: "power",
    durationSeconds,
    value,
    unit: "watts",
    evidenceContext: { kind: "cycling_power" },
    source: "imported",
    method: "activity_file_best_effort",
    calculationVersion: "best-effort-extraction-v1",
    provenance: {
      observationId: id,
      activityId,
      segmentId: `segment-${activityId}`,
      derivedFrom: "activity_file_stream",
      sourceSeries: "power",
      exactWindowStartOffsetSeconds: 0,
      exactWindowEndOffsetSeconds: durationSeconds,
      durationSeconds,
      contributingDurationSeconds: durationSeconds,
      windowCoverage: 1,
      sourceTimeCoverage: 1,
      extractionStatus: "available",
      extractionReason: null,
      calculationVersion: "best-effort-extraction-v1",
    },
  };
}

function bikeFitEfforts(secondActivity = true): CanonicalCyclingDurationEffortEvidence[] {
  return [
    bikeEffort("bike-300", "ride-1", 300, 320),
    bikeEffort("bike-600", "ride-1", 600, 280),
    bikeEffort("bike-1200", "ride-1", 1_200, 260),
    bikeEffort("bike-1800", secondActivity ? "ride-2" : "ride-1", 1_800, 253.3333333333),
  ];
}

describe("bike threshold-power profile model evidence", () => {
  const entry = getCalibrationRegistryEntry({
    metricKey: "threshold_power",
    activityCategory: "bike",
  });
  if (!entry) throw new Error("Bike threshold-power registry entry is unavailable");

  it("creates first provisional only from an accepted multi-activity fit", () => {
    const oneRide = evaluateBikeThresholdPowerEvidence({
      entry,
      efforts: bikeFitEfforts(false),
      effortReadTruncated: false,
      profileId: "profile-1",
      asOf: new Date("2026-08-10T12:00:00.000Z"),
    });
    expect(oneRide.evaluation).toMatchObject({
      state: "rejected",
      reason: "model_history_insufficient",
      diagnostics: {
        model: {
          reasons: expect.arrayContaining(["critical_power_insufficient_independent_activities"]),
          activityCount: 1,
        },
      },
    });

    const multipleRides = evaluateBikeThresholdPowerEvidence({
      entry,
      efforts: bikeFitEfforts(),
      effortReadTruncated: false,
      profileId: "profile-1",
      asOf: new Date("2026-08-10T12:00:00.000Z"),
    });
    expect(multipleRides.evaluation).toMatchObject({ state: "candidate" });
    if (multipleRides.evaluation.state !== "candidate") {
      throw new Error("Expected accepted multi-activity bike fit");
    }
    expect(multipleRides.evaluation.value).toBeCloseTo(247, 6);
    expect(multipleRides.modelSourceEffortIds).toEqual([
      "bike-1200",
      "bike-1800",
      "bike-300",
      "bike-600",
    ]);
    const selection = selectCalibration({
      identity: entry.identity,
      asOf: "2026-08-10T12:00:00.000Z",
      candidates: [
        {
          id: "bike-model-run",
          activityId: "ride-2",
          observedAt: "2026-08-10T11:00:00.000Z",
          value: multipleRides.evaluation.value,
          state: "candidate",
          invalidatedAt: null,
        },
      ],
      current: null,
      nextId: "bike-provisional",
    });
    expect(selection).toMatchObject({ state: "provisional" });
    if (selection.state === "unavailable") throw new Error("Expected provisional selection");
    expect(selection.calibration.value).toBeCloseTo(247, 6);
  });

  it("reports poor model shape as model quality rather than value range", () => {
    const malformed = bikeFitEfforts().map((effort) =>
      effort.durationSeconds === 600 ? { ...effort, value: 330 } : effort,
    );
    expect(
      evaluateBikeThresholdPowerEvidence({
        entry,
        efforts: malformed,
        effortReadTruncated: false,
        profileId: "profile-1",
        asOf: new Date("2026-08-10T12:00:00.000Z"),
      }).evaluation,
    ).toMatchObject({
      state: "rejected",
      reason: "model_quality_insufficient",
      diagnostics: { model: { reasons: ["non_monotonic_canonical_curve"] } },
    });
  });
});

describe("run threshold-speed calibration evidence", () => {
  it("selects the same current calibration from chronological or reverse provider evidence", () => {
    const identity = { metricKey: "threshold_speed", activityCategory: "run" } as const;
    const candidates = [
      {
        id: "older",
        activityId: "run-1",
        observedAt: "2026-07-01T12:00:00.000Z",
        value: 4,
        state: "candidate" as const,
        invalidatedAt: null,
      },
      {
        id: "newer",
        activityId: "run-2",
        observedAt: "2026-07-10T12:00:00.000Z",
        value: 4.02,
        state: "candidate" as const,
        invalidatedAt: null,
      },
    ];
    const select = (ordered: typeof candidates) =>
      selectCalibration({
        identity,
        asOf: "2026-08-10T12:00:00.000Z",
        candidates: ordered,
        current: null,
        nextId: "selection",
      });
    expect(select(candidates)).toEqual(select([...candidates].reverse()));
  });

  it("publishes a first stable 30-minute grade-adjusted window provisionally", () => {
    const entry = getCalibrationRegistryEntry({
      metricKey: "threshold_speed",
      activityCategory: "run",
    });
    if (!entry) throw new Error("Run threshold-speed registry entry is unavailable");
    const evaluation = evaluateRunThresholdSpeedEvidence({
      entry,
      efforts: [runWindow(1_200, 4.2), runWindow(1_800, 4)],
    });

    expect(evaluation).toMatchObject({ state: "candidate", value: 4 });
    if (evaluation.state !== "candidate") throw new Error("Expected qualifying run evidence");
    expect(
      selectCalibration({
        identity: entry.identity,
        asOf: "2026-08-10T12:00:00.000Z",
        candidates: [
          {
            id: "run-evidence",
            activityId: "run-activity",
            observedAt: "2026-08-10T11:00:00.000Z",
            value: evaluation.value,
            state: "candidate",
            invalidatedAt: null,
          },
        ],
        current: null,
        nextId: "run-calibration",
      }),
    ).toMatchObject({
      state: "provisional",
      calibration: { value: 4, unit: "meters_per_second" },
    });
  });

  it("rejects unstable or non-threshold-like 30-minute running", () => {
    const entry = getCalibrationRegistryEntry({
      metricKey: "threshold_speed",
      activityCategory: "run",
    });
    if (!entry) throw new Error("Run threshold-speed registry entry is unavailable");
    expect(
      evaluateRunThresholdSpeedEvidence({
        entry,
        efforts: [runWindow(1_200, 5), runWindow(1_800, 4)],
      }),
    ).toMatchObject({ state: "rejected", reason: "supporting_output_not_threshold_like" });
  });
});

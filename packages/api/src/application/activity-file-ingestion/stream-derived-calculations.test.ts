import type { CanonicalActivityCategory } from "@repo/core";
import {
  BEST_EFFORT_CALCULATION_VERSION,
  selectAerobicDecouplingValue,
  selectCyclingNormalizedPowerWatts,
  selectEfficiencyFactorValue,
  selectRunningNormalizedGradedSpeedMetersPerSecond,
} from "@repo/core/calculations";
import { AEROBIC_NUMERICAL_TRUST_FIXTURES_V1 } from "@repo/core/testing/aerobic-numerical-trust";
import { CYCLING_NUMERICAL_TRUST_FIXTURES_V1 } from "@repo/core/testing/cycling-numerical-trust";
import { RUNNING_NUMERICAL_TRUST_FIXTURES_V1 } from "@repo/core/testing/running-numerical-trust";
import { describe, expect, it } from "vitest";
import { buildCompletedSegmentAnalysisActivity } from "../../lib/activity-analysis/derived";
import {
  buildActivityFileDerivedSegmentSummary,
  calculateActivityFileStreamDerivedCalculations,
  calculateActivityFileStreamDerivedMetrics,
} from "./stream-derived-calculations";
import { collectActivityFileStreamMetadata } from "./stream-metadata";

const base = {
  activityId: "11111111-1111-4111-8111-111111111111",
  profileId: "22222222-2222-4222-8222-222222222222",
  segmentId: "33333333-3333-4333-8333-333333333333",
  activityStartedAt: new Date(0),
  segmentStartOffsetSeconds: 0,
};

function calculationsFor(input: {
  activityCategory: CanonicalActivityCategory;
  records: Array<{
    timestamp?: Date;
    power?: number;
    speed?: number;
    altitude?: number;
    heartRate?: number;
  }>;
  includedTimeline?: readonly boolean[];
  segmentEndOffsetSeconds?: number;
}) {
  const segmentEndOffsetSeconds = input.segmentEndOffsetSeconds ?? 60;
  return calculateActivityFileStreamDerivedCalculations({
    ...base,
    activityCategory: input.activityCategory,
    ...(input.activityCategory === "swim"
      ? {
          swimmingEvidenceContext: {
            environment: "pool" as const,
            timingBasis: "pool_length_timing" as const,
            poolLengthMeters: 25,
          },
        }
      : {}),
    distance: 0,
    duration: segmentEndOffsetSeconds,
    segmentEndOffsetSeconds,
    ...(input.includedTimeline === undefined ? {} : { includedTimeline: input.includedTimeline }),
    streamMetadata: collectActivityFileStreamMetadata(input.records),
  });
}

function rowsFor(activityCategory: CanonicalActivityCategory) {
  return calculationsFor({
    activityCategory,
    records: Array.from({ length: 61 }, (_, second) => ({
      timestamp: new Date(second * 1_000),
      power: 250,
      speed: activityCategory === "swim" ? 2 : 4,
      altitude: 0,
    })),
  }).effortsToInsert;
}

describe("canonical activity-file best-effort evidence", () => {
  it("retains swim extraction but does not promote speed without qualified context", () => {
    const calculation = calculateActivityFileStreamDerivedCalculations({
      ...base,
      activityCategory: "swim",
      distance: 60,
      duration: 60,
      segmentEndOffsetSeconds: 60,
      streamMetadata: collectActivityFileStreamMetadata(
        Array.from({ length: 61 }, (_, second) => ({
          timestamp: new Date(second * 1_000),
          speed: 1,
        })),
      ),
    });

    expect(calculation.bestEffortExtractions).toContainEqual(
      expect.objectContaining({ metric: "speed" }),
    );
    expect(calculation.effortsToInsert).toEqual([]);
  });

  it.each([
    ["bike", ["power"]],
    ["run", ["speed"]],
    ["swim", ["speed"]],
    ["strength", []],
  ] as const)("enforces the %s stream-derived effort matrix", (activityCategory, effortTypes) => {
    const rows = rowsFor(activityCategory);
    expect([...new Set(rows.map((row) => row.effort_type))]).toEqual(effortTypes);
    expect(rows.every((row) => row.activity_category === activityCategory)).toBe(true);
  });

  it("persists canonical units and import provenance", () => {
    expect(rowsFor("bike")[0]).toMatchObject({
      effort_type: "power",
      source_series: "power",
      unit: "watts",
      source: "imported",
      method: "activity_file_best_effort",
      calculation_version: BEST_EFFORT_CALCULATION_VERSION,
      provenance: {
        derived_from: "activity_file_stream",
        activity_id: base.activityId,
        segment_id: base.segmentId,
        source_series: "power",
        window_coverage: 1,
      },
    });
    expect(rowsFor("swim")[0]).toMatchObject({
      effort_type: "speed",
      source_series: "swim_speed",
      unit: "meters_per_second",
    });
  });

  it("persists exact run calibration-window variability diagnostics", () => {
    const row = calculationsFor({
      activityCategory: "run",
      segmentEndOffsetSeconds: 1_800,
      records: Array.from({ length: 1_801 }, (_, second) => ({
        timestamp: new Date(second * 1_000),
        speed: 4,
        altitude: 0,
      })),
    }).effortsToInsert.find((effort) => effort.duration_seconds === 1_800);

    expect(row?.provenance).toMatchObject({
      source_series: "grade_adjusted_speed",
      output_window_coverage: 1,
      maximum_gap_seconds: 1,
      output_coefficient_of_variation: 0,
    });
  });

  it("persists maximum sustained HR curve points without inventing trial semantics", () => {
    const rows = calculationsFor({
      activityCategory: "bike",
      segmentEndOffsetSeconds: 1_800,
      records: Array.from({ length: 1_801 }, (_, second) => ({
        timestamp: new Date(second * 1_000),
        heartRate: second <= 600 ? 140 : 170,
      })),
    }).effortsToInsert;

    expect(rows).toContainEqual(
      expect.objectContaining({
        effort_type: "heart_rate",
        source_series: "heart_rate",
        duration_seconds: 1200,
        value: 170,
        unit: "bpm",
        method: "activity_file_best_effort",
        calculation_version: BEST_EFFORT_CALCULATION_VERSION,
        recorded_at: new Date(1_800_000),
      }),
    );
  });

  it("does not promote sparse HR samples into sustained curve evidence", () => {
    const rows = calculationsFor({
      activityCategory: "bike",
      segmentEndOffsetSeconds: 2_000,
      records: [
        { timestamp: new Date(0), heartRate: 160 },
        { timestamp: new Date(2_000_000), heartRate: 170 },
      ],
    }).effortsToInsert;

    expect(rows.filter((row) => row.effort_type === "heart_rate")).toEqual([]);
  });

  it.each([
    ["bike", "power"],
    ["swim", "speed"],
  ] as const)("uses sparse %s stream timestamps for best-effort offsets", (activityCategory, metric) => {
    const lowSpeed = activityCategory === "swim" ? 1 : 2;
    const highSpeed = activityCategory === "swim" ? 2.5 : 6;
    const records = Array.from({ length: 11 }, (_, second) => ({
      timestamp: new Date(second * 1000),
      ...(second === 1 ? {} : { power: second < 5 ? 100 : 300 }),
      ...(second === 1 ? {} : { speed: second < 5 ? lowSpeed : highSpeed }),
      altitude: 0,
    }));
    const rows = calculationsFor({
      activityCategory,
      records,
      segmentEndOffsetSeconds: 10,
    }).effortsToInsert;

    expect(
      rows.find((row) => row.effort_type === metric && row.duration_seconds === 5),
    ).toMatchObject({ start_offset_ms: 4_000 });
  });

  it("retains exact fractional effort boundaries in provenance when the offset column quantizes", () => {
    const rows = calculationsFor({
      activityCategory: "bike",
      segmentEndOffsetSeconds: 5.5,
      records: [
        { timestamp: new Date(0), power: 0 },
        { timestamp: new Date(1_000), power: 0 },
        { timestamp: new Date(2_500), power: 100 },
        { timestamp: new Date(4_000), power: 100 },
        { timestamp: new Date(5_500), power: 100 },
      ],
    }).effortsToInsert;
    const effort = rows.find((row) => row.effort_type === "power" && row.duration_seconds === 5);

    expect(effort).toMatchObject({
      start_offset_ms: 500,
      end_offset_ms: 5_500,
      recorded_at: new Date(5_500),
      provenance: {
        exact_window_start_timestamp_seconds: 0.5,
        exact_window_end_timestamp_seconds: 5.5,
        exact_window_start_offset_seconds: 0.5,
        exact_window_end_offset_seconds: 5.5,
        persisted_start_offset_quantization: "nearest_millisecond_v1",
      },
    });
  });

  it("omits hard-invalid speed efforts without clamping valid stream evidence", () => {
    const rows = calculationsFor({
      activityCategory: "run",
      records: Array.from({ length: 61 }, (_, second) => ({
        timestamp: new Date(second * 1_000),
        speed: second === 30 ? 100 : 4,
      })),
    }).effortsToInsert;

    expect(rows.map((row) => row.duration_seconds)).toEqual([30, 60]);
    expect(rows.every((row) => row.value >= 0.3 && row.value <= 13)).toBe(true);
    expect(rows.some((row) => row.value === 13)).toBe(false);
  });

  it("retains unavailable and partial reasons while never bridging null, pause, or gap intervals", () => {
    const missing = calculationsFor({
      activityCategory: "bike",
      segmentEndOffsetSeconds: 12,
      records: Array.from({ length: 13 }, (_, second) => ({
        timestamp: new Date(second * 1_000),
        ...(second === 5 ? {} : { power: second < 6 ? 100 : 200 }),
      })),
    });
    const paused = calculationsFor({
      activityCategory: "bike",
      segmentEndOffsetSeconds: 12,
      includedTimeline: Array.from({ length: 13 }, (_, second) => second !== 5),
      records: Array.from({ length: 13 }, (_, second) => ({
        timestamp: new Date(second * 1_000),
        power: second < 6 ? 100 : 200,
      })),
    });
    const gap = calculationsFor({
      activityCategory: "bike",
      segmentEndOffsetSeconds: 16,
      records: [0, 1, 2, 10, 11, 12, 13, 14, 15, 16].map((second) => ({
        timestamp: new Date(second * 1_000),
        power: second < 10 ? 100 : 200,
      })),
    });
    const resultFor = (calculation: typeof missing, durationSeconds: number) =>
      calculation.bestEffortExtractions
        .find((extraction) => extraction.metric === "power")
        ?.results.find((result) => result.durationSeconds === durationSeconds);

    expect(resultFor(missing, 10)).toMatchObject({
      status: "unavailable",
      reason: "insufficient_contiguous_coverage",
    });
    expect(resultFor(missing, 5)).toMatchObject({
      status: "partial",
      startTimestampSeconds: 5,
      endTimestampSeconds: 10,
    });
    expect(resultFor(paused, 5)).toMatchObject({
      status: "available",
      startTimestampSeconds: 5,
      endTimestampSeconds: 10,
    });
    expect(resultFor(gap, 5)).toMatchObject({
      status: "partial",
      startTimestampSeconds: 10,
      endTimestampSeconds: 15,
    });
  });

  it("persists grade-adjusted and raw running speed independently when both are available", () => {
    const graded = calculationsFor({
      activityCategory: "run",
      records: Array.from({ length: 61 }, (_, second) => ({
        timestamp: new Date(second * 1_000),
        speed: 4,
        altitude: second * 0.4,
      })),
    });
    const rawFallback = calculationsFor({
      activityCategory: "run",
      records: Array.from({ length: 61 }, (_, second) => ({
        timestamp: new Date(second * 1_000),
        speed: 4,
      })),
    });

    expect(
      graded.effortsToInsert
        .filter((effort) => effort.duration_seconds === 60)
        .map((effort) => effort.source_series),
    ).toEqual(["grade_adjusted_speed", "raw_speed"]);
    expect(graded.effortsToInsert[0]).toMatchObject({
      effort_type: "speed",
      source_series: "grade_adjusted_speed",
      provenance: { source_series: "grade_adjusted_speed" },
    });
    expect(rawFallback.effortsToInsert[0]).toMatchObject({
      effort_type: "speed",
      source_series: "raw_speed",
      value: 4,
      provenance: { source_series: "raw_speed" },
    });
    expect(
      rawFallback.bestEffortExtractions.find(
        (extraction) => extraction.metric === "grade_adjusted_speed",
      )?.results[0],
    ).toMatchObject({ status: "unavailable", reason: "no_contributing_intervals" });
  });
});

describe("sparse activity-file stream calculations", () => {
  it("uses moving, then active, then elapsed facts for normalized speed", () => {
    const streamMetadata = collectActivityFileStreamMetadata([]);
    const moving = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "run",
      distance: 1_000,
      duration: 200,
      activeDuration: 150,
      movingDuration: 100,
      streamMetadata,
    });
    expect(moving).toMatchObject({
      normalizedSpeed: 10,
      normalizedSpeedDurationBasis: "moving",
      normalizedSpeedDurationSeconds: 100,
    });

    const active = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "run",
      distance: 1_000,
      duration: 200,
      activeDuration: 125,
      movingDuration: null,
      streamMetadata,
    });
    expect(active).toMatchObject({
      normalizedSpeed: 8,
      normalizedSpeedDurationBasis: "active",
      normalizedSpeedDurationSeconds: 125,
    });

    const elapsed = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "run",
      distance: 1_000,
      duration: 200,
      streamMetadata,
    });
    expect(elapsed).toMatchObject({
      normalizedSpeed: 5,
      normalizedSpeedDurationBasis: "elapsed",
      normalizedSpeedDurationSeconds: 200,
    });
  });

  it("retains untimestamped metric counts without assigning fabricated instants", () => {
    const metadata = collectActivityFileStreamMetadata([
      { power: 999 },
      { timestamp: new Date(0), power: 100 },
      { timestamp: new Date(1000), power: 120 },
    ]);

    expect(metadata.samples).toEqual([
      expect.objectContaining({ timestampSeconds: 0, powerWatts: 100 }),
      expect.objectContaining({ timestampSeconds: 1, powerWatts: 120 }),
    ]);
    expect(metadata.unpositionedValueCounts.power).toBe(1);
  });

  it("retains and persists an explicit missing timestamp as numeric partial NP", () => {
    const fixture = CYCLING_NUMERICAL_TRUST_FIXTURES_V1.missing;
    const metrics = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "bike",
      distance: 0,
      duration: 61,
      streamMetadata: collectActivityFileStreamMetadata(
        fixture.samples.map((sample) => ({
          timestamp: new Date(sample.timestampSeconds * 1_000),
          ...(sample.powerWatts === null ? {} : { power: sample.powerWatts }),
        })),
      ),
    });

    expect(metrics.normalizedPowerResult).toMatchObject({
      status: "partial",
      valueWatts: fixture.expected.normalizedPowerWatts,
      reason: "source_incomplete",
      calculationVersion: CYCLING_NUMERICAL_TRUST_FIXTURES_V1.calculationVersion,
      diagnostics: fixture.expected.diagnostics,
    });
    expect(selectCyclingNormalizedPowerWatts(metrics.normalizedPowerResult)).toBe(
      fixture.expected.normalizedPowerWatts,
    );
    expect(
      buildActivityFileDerivedSegmentSummary({
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 61_000, movingMs: 61_000 },
          normalizedPowerResult: metrics.normalizedPowerResult,
        },
        metrics,
      }),
    ).toMatchObject({
      normalizedPowerResult: {
        status: "partial",
        valueWatts: fixture.expected.normalizedPowerWatts,
        diagnostics: fixture.expected.diagnostics,
      },
    });
  });

  it("aligns power and heart rate by their shared record timestamps", () => {
    const metadata = collectActivityFileStreamMetadata([
      { timestamp: new Date(0), power: 100, heartRate: 100 },
      { timestamp: new Date(1000), power: 120 },
      { timestamp: new Date(2000), heartRate: 130 },
      { timestamp: new Date(3000), power: 180, heartRate: 150 },
      { timestamp: new Date(4000), power: 200, heartRate: 160 },
    ]);

    expect(metadata.samples.map((sample) => sample.powerWatts)).toEqual([100, 120, null, 180, 200]);
    expect(metadata.samples.map((sample) => sample.heartRateBpm)).toEqual([
      100,
      null,
      130,
      150,
      160,
    ]);

    const metrics = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "bike",
      distance: 0,
      duration: 4,
      streamMetadata: metadata,
    });
    expect(metrics.normalizedPowerResult).toMatchObject({
      status: "unavailable",
      valueWatts: null,
      reason: "insufficient_window",
    });
    expect(selectCyclingNormalizedPowerWatts(metrics.normalizedPowerResult)).toBeNull();
    expect(selectAerobicDecouplingValue(metrics.aerobicDecouplingResult)).toBeNull();
    const persistedSummary = buildActivityFileDerivedSegmentSummary({
      summary: {
        version: 1,
        timing: { timingCoverage: "complete", activeMs: 4_000, movingMs: 4_000 },
        normalizedPowerResult: metrics.normalizedPowerResult,
      },
      metrics,
    });
    expect(persistedSummary).not.toHaveProperty("normalizedPowerWatts");
    expect(persistedSummary.normalizedPowerResult).toEqual(metrics.normalizedPowerResult);
    expect(persistedSummary.normalizedPowerResult).toMatchObject({
      status: "unavailable",
      reason: "insufficient_window",
      calculationVersion: CYCLING_NUMERICAL_TRUST_FIXTURES_V1.calculationVersion,
      diagnostics: {
        sourceTimeCoverage: 0.75,
        excludedGapDurationSeconds: 0,
      },
    });
    expect(
      buildCompletedSegmentAnalysisActivity({
        activityStartedAt: new Date(0),
        segment: {
          id: "33333333-3333-4333-8333-333333333333",
          activity_id: "44444444-4444-4444-8444-444444444444",
          ordinal: 0,
          role: "activity",
          activity_category: "bike",
          start_offset_ms: 0,
          end_offset_ms: 4_000,
          timing_coverage: "complete",
          active_ms: 4_000,
          moving_ms: 4_000,
          summary: persistedSummary,
        },
        summary: persistedSummary,
      }).normalized_power_result,
    ).toEqual(metrics.normalizedPowerResult);
  });

  it("retains aligned timestamps and persists numeric partial running NGP", () => {
    const fixture = RUNNING_NUMERICAL_TRUST_FIXTURES_V1.missingElevation;
    const metadata = collectActivityFileStreamMetadata(
      fixture.samples.map((sample) => ({
        timestamp: new Date(sample.timestampSeconds * 1_000),
        ...(sample.speedMetersPerSecond === null ? {} : { speed: sample.speedMetersPerSecond }),
        ...(sample.elevationMeters === null ? {} : { altitude: sample.elevationMeters }),
      })),
    );
    const metrics = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "run",
      distance: fixture.expected.distanceMeters,
      duration: fixture.expected.elapsedDurationSeconds,
      activeDuration: fixture.expected.activeDurationSeconds,
      movingDuration: fixture.expected.movingDurationSeconds,
      streamMetadata: metadata,
    });

    expect(metrics.normalizedGradedPaceResult).toMatchObject({
      status: "partial",
      calculationVersion: RUNNING_NUMERICAL_TRUST_FIXTURES_V1.calculationVersion,
      diagnostics: fixture.expected.diagnostics,
    });
    expect(
      metrics.normalizedGradedPaceResult === null
        ? null
        : selectRunningNormalizedGradedSpeedMetersPerSecond(metrics.normalizedGradedPaceResult),
    ).toBeCloseTo(fixture.expected.normalizedGradedSpeedMetersPerSecond, 12);
    expect(
      buildActivityFileDerivedSegmentSummary({
        summary: {
          version: 1,
          timing: {
            timingCoverage: "complete",
            activeMs: fixture.expected.activeDurationSeconds * 1_000,
            movingMs: fixture.expected.movingDurationSeconds * 1_000,
          },
          normalizedPowerResult: metrics.normalizedPowerResult,
        },
        metrics,
      }),
    ).toMatchObject({
      normalizedGradedPaceResult: {
        status: "partial",
        diagnostics: fixture.expected.diagnostics,
      },
    });
  });

  it("rejects offset elevation alignment instead of shifting it onto speed", () => {
    const fixture = RUNNING_NUMERICAL_TRUST_FIXTURES_V1.misalignedElevation;
    const metadata = collectActivityFileStreamMetadata(
      fixture.samples.map((sample) => ({
        timestamp: new Date(sample.timestampSeconds * 1_000),
        ...(sample.speedMetersPerSecond === null ? {} : { speed: sample.speedMetersPerSecond }),
        ...(sample.elevationMeters === null ? {} : { altitude: sample.elevationMeters }),
      })),
    );
    const metrics = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "run",
      distance: 120,
      duration: 31,
      activeDuration: 31,
      movingDuration: 31,
      streamMetadata: metadata,
    });

    expect(metrics.normalizedGradedPaceResult).toMatchObject({
      status: fixture.expected.status,
      reason: fixture.expected.reason,
      valueMetersPerSecond: null,
    });
    expect(
      metrics.normalizedGradedPaceResult === null
        ? null
        : selectRunningNormalizedGradedSpeedMetersPerSecond(metrics.normalizedGradedPaceResult),
    ).toBeNull();
    expect(
      buildActivityFileDerivedSegmentSummary({
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 31_000, movingMs: 31_000 },
          normalizedPowerResult: metrics.normalizedPowerResult,
        },
        metrics,
      }),
    ).toMatchObject({
      normalizedGradedPaceResult: {
        status: "unavailable",
        valueMetersPerSecond: null,
      },
    });
  });
});

describe("activity-file aerobic analysis", () => {
  it("derives cycling W/bpm EF and decoupling only from timestamp-aligned evidence", () => {
    const fixture = AEROBIC_NUMERICAL_TRUST_FIXTURES_V1.knownCyclingDrift;
    const metadata = collectActivityFileStreamMetadata(
      fixture.input.samples.map((sample) => ({
        timestamp: new Date(sample.timestampSeconds * 1_000),
        ...(sample.output === null ? {} : { power: sample.output }),
        ...(sample.heartRateBpm === null ? {} : { heartRate: sample.heartRateBpm }),
      })),
    );
    const metrics = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "bike",
      distance: 12_000,
      duration: fixture.expected.contributingDurationSeconds,
      streamMetadata: metadata,
    });

    expect(metrics.efficiencyFactorResult).toMatchObject({
      status: "available",
      modality: "cycling",
      outputUnit: "watts",
      unit: "watts_per_bpm",
      diagnostics: {
        contributingDurationSeconds: fixture.expected.contributingDurationSeconds,
        outputCoverage: 1,
        heartRateCoverage: 1,
      },
    });
    expect(metrics.aerobicDecouplingResult).toMatchObject({
      status: "available",
      modality: "cycling",
      efficiencyFactorUnit: "watts_per_bpm",
    });
    expect(selectEfficiencyFactorValue(metrics.efficiencyFactorResult)).toBeCloseTo(
      fixture.expected.efficiencyFactor,
      12,
    );
    expect(selectAerobicDecouplingValue(metrics.aerobicDecouplingResult)).toBeCloseTo(
      fixture.expected.decoupling,
      12,
    );
    const persistedSummary = buildActivityFileDerivedSegmentSummary({
      summary: {
        version: 1,
        timing: { timingCoverage: "complete", activeMs: 1_200_000, movingMs: 1_200_000 },
        normalizedPowerResult: metrics.normalizedPowerResult,
      },
      metrics,
    });
    expect(persistedSummary).toMatchObject({
      efficiencyFactorResult: { status: "available", modality: "cycling" },
      aerobicDecouplingResult: { status: "available", modality: "cycling" },
    });
    expect(
      persistedSummary.efficiencyFactorResult
        ? selectEfficiencyFactorValue(persistedSummary.efficiencyFactorResult)
        : null,
    ).toBeCloseTo(fixture.expected.efficiencyFactor, 12);
    expect(
      persistedSummary.aerobicDecouplingResult
        ? selectAerobicDecouplingValue(persistedSummary.aerobicDecouplingResult)
        : null,
    ).toBeCloseTo(fixture.expected.decoupling, 12);
  });

  it("derives running m/s/bpm EF without comparing it to cycling power", () => {
    const fixture = AEROBIC_NUMERICAL_TRUST_FIXTURES_V1.knownRunningDrift;
    const metadata = collectActivityFileStreamMetadata(
      fixture.input.samples.map((sample) => ({
        timestamp: new Date(sample.timestampSeconds * 1_000),
        ...(sample.output === null ? {} : { speed: sample.output }),
        altitude: 100,
        ...(sample.heartRateBpm === null ? {} : { heartRate: sample.heartRateBpm }),
      })),
    );
    const metrics = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "run",
      distance: 4_800,
      duration: fixture.expected.contributingDurationSeconds,
      activeDuration: fixture.expected.contributingDurationSeconds,
      movingDuration: fixture.expected.contributingDurationSeconds,
      streamMetadata: metadata,
    });

    expect(metrics.efficiencyFactorResult).toMatchObject({
      status: "available",
      modality: "running",
      outputUnit: "meters_per_second",
      unit: "meters_per_second_per_bpm",
    });
    expect(metrics.aerobicDecouplingResult).toMatchObject({
      status: "available",
      modality: "running",
      efficiencyFactorUnit: "meters_per_second_per_bpm",
    });
    expect(selectEfficiencyFactorValue(metrics.efficiencyFactorResult)).toBeCloseTo(
      fixture.expected.efficiencyFactor,
      12,
    );
    expect(selectAerobicDecouplingValue(metrics.aerobicDecouplingResult)).toBeCloseTo(
      fixture.expected.decoupling,
      12,
    );
  });

  it("keeps missing HR unavailable and never maps it to scalar zero", () => {
    const fixture = AEROBIC_NUMERICAL_TRUST_FIXTURES_V1.missingHeartRate;
    const metadata = collectActivityFileStreamMetadata(
      fixture.input.samples.map((sample) => ({
        timestamp: new Date(sample.timestampSeconds * 1_000),
        ...(sample.output === null ? {} : { power: sample.output }),
      })),
    );
    const metrics = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "bike",
      distance: 0,
      duration: 1_200,
      streamMetadata: metadata,
    });

    expect(metrics.efficiencyFactorResult).toMatchObject({
      status: "unavailable",
      value: null,
      reason: fixture.expected.reason,
    });
    expect(metrics.aerobicDecouplingResult).toMatchObject({
      status: "unavailable",
      value: null,
      reason: fixture.expected.reason,
    });
    expect(selectEfficiencyFactorValue(metrics.efficiencyFactorResult)).toBeNull();
    expect(selectAerobicDecouplingValue(metrics.aerobicDecouplingResult)).toBeNull();
    const summary = buildActivityFileDerivedSegmentSummary({
      summary: {
        version: 1,
        timing: { timingCoverage: "complete", activeMs: 1_200_000, movingMs: 1_200_000 },
        normalizedPowerResult: metrics.normalizedPowerResult,
      },
      metrics,
    });
    expect(summary).toMatchObject({
      efficiencyFactorResult: { status: "unavailable", value: null },
      aerobicDecouplingResult: { status: "unavailable", value: null },
    });
    expect(summary).not.toHaveProperty("efficiencyFactor");
    expect(summary).not.toHaveProperty("aerobicDecoupling");
  });

  it("does not reinterpret power on an unsupported modality as cycling output", () => {
    const fixture = AEROBIC_NUMERICAL_TRUST_FIXTURES_V1.validZeroDrift;
    const metadata = collectActivityFileStreamMetadata(
      fixture.input.samples.map((sample) => ({
        timestamp: new Date(sample.timestampSeconds * 1_000),
        ...(sample.output === null ? {} : { power: sample.output }),
        ...(sample.heartRateBpm === null ? {} : { heartRate: sample.heartRateBpm }),
      })),
    );
    const metrics = calculateActivityFileStreamDerivedMetrics({
      activityCategory: "swim",
      distance: 0,
      duration: 1_200,
      streamMetadata: metadata,
    });

    expect(metrics.efficiencyFactorResult).toMatchObject({
      status: "unavailable",
      reason: "unsupported_modality",
      value: null,
    });
    expect(metrics.aerobicDecouplingResult).toMatchObject({
      status: "unavailable",
      reason: "unsupported_modality",
      value: null,
    });
    expect(selectEfficiencyFactorValue(metrics.efficiencyFactorResult)).toBeNull();
    expect(selectAerobicDecouplingValue(metrics.aerobicDecouplingResult)).toBeNull();
  });
});

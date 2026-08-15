import {
  activityArtifactSemanticsSchema,
  analyzeActivityDerivedMetrics,
  getNormalizedIntensity,
} from "@repo/core";
import { selectCyclingNormalizedPowerWatts } from "@repo/core/calculations";
import { calculateProvisionalRecordingMetrics } from "@repo/core/recording-metrics";
import { AEROBIC_NUMERICAL_TRUST_FIXTURES_V1 } from "@repo/core/testing/aerobic-numerical-trust";
import { CYCLING_NUMERICAL_TRUST_FIXTURES_V1 } from "@repo/core/testing/cycling-numerical-trust";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { describe, expect, it, vi } from "vitest";
import type { getRequiredDb } from "../../db";
import { analyzeParsedActivityFile } from "./analyze-parsed-activity-file";

type DbClient = ReturnType<typeof getRequiredDb>;

function dbWithoutProfileMetrics(): DbClient {
  const tail = {
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
    })),
  };
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        ...tail,
        innerJoin: vi.fn(() => tail),
      })),
    })),
  } as unknown as DbClient;
}

function dbWithMetricResults(results: unknown[][]): DbClient {
  const queued = [...results];
  return {
    select: vi.fn(() => {
      const result = queued.shift() ?? [];
      const tail = {
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(result) })),
        })),
      };
      return {
        from: vi.fn(() => ({ ...tail, innerJoin: vi.fn(() => tail) })),
      };
    }),
  } as unknown as DbClient;
}

function sustainedHeartRateRecords(startedAt: Date, heartRate = 170) {
  return Array.from({ length: 1_201 }, (_, second) => ({
    timestamp: new Date(startedAt.getTime() + second * 1000),
    heartRate,
  }));
}

function explicitBikeSegment(startedAt: Date, seconds: number) {
  return [
    {
      sessionMessageIndex: 0,
      role: "activity" as const,
      activity_category: "bike" as const,
      rawSport: "cycling",
      startTime: startedAt,
      endTime: new Date(startedAt.getTime() + seconds * 1000),
    },
  ];
}

function cyclingPerformanceTargets(asOf: string, thresholdPowerWatts: number) {
  return buildPerformanceTargetFactsFixture({
    asOf,
    bikeThresholdWatts: thresholdPowerWatts,
    calculationVersion: "cycling-parity-threshold-v1",
  });
}

describe("analyzeParsedActivityFile", () => {
  it("extracts the final 20-minute HR mean only from a complete stable 30-minute output window", async () => {
    const startedAt = new Date("2026-07-31T10:00:00.000Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "stable-threshold-window",
      profileId: "stable-threshold-profile",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: {
          totalTime: 1_800,
          totalDistance: 15_000,
          avgPower: 250,
          avgHeartRate: 170,
        },
        records: Array.from({ length: 1_801 }, (_, second) => ({
          sessionMessageIndex: 0,
          timestamp: new Date(startedAt.getTime() + second * 1_000),
          power: 250,
          heartRate: 170,
        })),
        segments: explicitBikeSegment(startedAt, 1_800),
      },
    });

    expect(result.detectedLTHR).toMatchObject({
      valueBpm: 170,
      recordedAt: new Date(startedAt.getTime() + 1_800_000),
      provenance: {
        duration_seconds: 1_800,
        hr_coverage: 1,
        supporting_output_coverage: 1,
        maximum_gap_seconds: 1,
        output_coefficient_of_variation: 0,
        supporting_output_value: 250,
      },
    });
  });

  it("keeps missing output variability out of detected threshold provenance", async () => {
    const startedAt = new Date("2026-07-31T10:00:00.000Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "threshold-window-without-output",
      profileId: "threshold-profile-without-output",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: { totalTime: 1_800, totalDistance: 15_000, avgHeartRate: 170 },
        records: Array.from({ length: 1_801 }, (_, second) => ({
          sessionMessageIndex: 0,
          timestamp: new Date(startedAt.getTime() + second * 1_000),
          heartRate: 170,
        })),
        segments: explicitBikeSegment(startedAt, 1_800),
      },
    });

    expect(result.detectedLTHR?.provenance).not.toHaveProperty("output_coefficient_of_variation");
  });

  it("persists valid zero decoupling while keeping unavailable evidence nullable", async () => {
    const fixture = AEROBIC_NUMERICAL_TRUST_FIXTURES_V1.validZeroDrift;
    const startedAt = new Date("2026-07-31T10:00:00.000Z");
    const durationSeconds = 1_200;
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "aerobic-zero-drift-import-v1",
      profileId: "aerobic-zero-drift-profile-v1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: {
          totalTime: durationSeconds,
          totalDistance: 12_000,
          avgPower: 200,
          avgHeartRate: 145,
        },
        records: fixture.input.samples.map((sample) => ({
          sessionMessageIndex: 0,
          timestamp: new Date(startedAt.getTime() + sample.timestampSeconds * 1_000),
          ...(sample.output === null ? {} : { power: sample.output }),
          ...(sample.heartRateBpm === null ? {} : { heartRate: sample.heartRateBpm }),
        })),
        segments: explicitBikeSegment(startedAt, durationSeconds),
      },
    });

    expect(result.summaryValues).not.toHaveProperty("efficiency_factor");
    expect(result.summaryValues).not.toHaveProperty("aerobic_decoupling");
    expect(result.segmentSet.segments[0]?.summary).toMatchObject({
      efficiencyFactorResult: { status: "available", value: fixture.expected.efficiencyFactor },
      aerobicDecouplingResult: { status: "available", value: 0 },
    });

    const unavailable = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "aerobic-missing-hr-import-v1",
      profileId: "aerobic-missing-hr-profile-v1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: { totalTime: durationSeconds, totalDistance: 12_000, avgPower: 200 },
        records: fixture.input.samples.map((sample) => ({
          sessionMessageIndex: 0,
          timestamp: new Date(startedAt.getTime() + sample.timestampSeconds * 1_000),
          ...(sample.output === null ? {} : { power: sample.output }),
        })),
        segments: explicitBikeSegment(startedAt, durationSeconds),
      },
    });
    expect(unavailable.summaryValues).not.toHaveProperty("efficiency_factor");
    expect(unavailable.summaryValues).not.toHaveProperty("aerobic_decoupling");
    expect(unavailable.segmentSet.segments[0]?.summary).toMatchObject({
      efficiencyFactorResult: { status: "unavailable", value: null },
      aerobicDecouplingResult: { status: "unavailable", value: null },
    });
    expect(unavailable.segmentSet.segments[0]?.summary).not.toHaveProperty("efficiencyFactor");
    expect(unavailable.segmentSet.segments[0]?.summary).not.toHaveProperty("aerobicDecoupling");
  });

  it("keeps final cycling duration, distance, NP, intensity, and Common Load aligned with live replay", async () => {
    const fixture = CYCLING_NUMERICAL_TRUST_FIXTURES_V1.canonicalThresholdHour;
    const expected = fixture.expected;
    const tolerance = CYCLING_NUMERICAL_TRUST_FIXTURES_V1.tolerances;
    const startedAt = new Date("2026-07-31T10:00:00.000Z");
    const finishedAt = new Date(startedAt.getTime() + expected.durationSeconds * 1_000);
    const records = fixture.samples.map((sample) => ({
      sessionMessageIndex: 0,
      timestamp: new Date(startedAt.getTime() + sample.timestampSeconds * 1_000),
      ...(sample.powerWatts === null ? {} : { power: sample.powerWatts }),
    }));
    const imported = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "cycling-numerical-trust-import-v1",
      profileId: "cycling-numerical-trust-profile-v1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: {
          totalTime: expected.durationSeconds,
          totalDistance: expected.distanceMeters,
          avgPower: expected.normalizedPowerWatts,
        },
        records,
        segments: explicitBikeSegment(startedAt, expected.durationSeconds),
        sessions: [
          {
            messageIndex: 0,
            rawSport: "cycling",
            startTime: startedAt,
            endTime: finishedAt,
            totalElapsedTime: expected.durationSeconds,
            totalTimerTime: expected.durationSeconds,
            totalMovingTime: expected.durationSeconds,
            totalDistance: expected.distanceMeters,
            laps: [],
            records: [],
          },
        ],
      },
    });
    const segment = imported.segmentSet.segments[0];
    if (segment?.role !== "activity" || segment.summary.timing.timingCoverage !== "complete") {
      throw new Error("Expected one completely timed imported bike segment");
    }
    const importedCommonLoad = analyzeActivityDerivedMetrics({
      activity: {
        id: segment.id,
        type: "bike",
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_seconds: segment.summary.timing.activeMs / 1_000,
        moving_seconds: segment.summary.timing.movingMs / 1_000,
        distance_meters: segment.summary.distanceMeters ?? null,
        avg_power: segment.summary.averagePowerWatts ?? null,
        normalized_power_result: segment.summary.normalizedPowerResult,
      },
      context: {
        profileMetrics: {},
        performanceTargets: buildPerformanceTargetFactsFixture({
          asOf: finishedAt.toISOString(),
          bikeThresholdWatts: fixture.thresholdPowerWatts,
          calculationVersion: "cycling-parity-threshold-v1",
        }),
        recentEfforts: [],
        profile: {},
      },
      computedAsOf: finishedAt.toISOString(),
    }).stress.common_load;
    const live = calculateProvisionalRecordingMetrics({
      config: {
        activityCategory: "bike",
        performanceTargets: cyclingPerformanceTargets(
          finishedAt.toISOString(),
          fixture.thresholdPowerWatts,
        ),
        recordingSessionId: "cycling-numerical-trust-live-v1",
      },
      samples: fixture.samples.map((sample) => ({
        timestampMs: startedAt.getTime() + sample.timestampSeconds * 1_000,
        moving: sample.included !== false,
        powerWatts: sample.powerWatts,
        distanceMeters: fixture.distanceMetersPerSecond * sample.timestampSeconds,
      })),
    });

    expect(imported.summaryValues).toMatchObject({
      elapsed_ms: expected.durationSeconds * 1_000,
      active_ms: expected.durationSeconds * 1_000,
      moving_ms: expected.durationSeconds * 1_000,
      distance_meters: expected.distanceMeters,
    });
    expect(live.stage).toBe("provisional");
    expect(live.authority).toBe("live_recording_only");
    expect(live.normalizedPowerResult).toMatchObject({
      status: "available",
      calculationVersion: CYCLING_NUMERICAL_TRUST_FIXTURES_V1.calculationVersion,
      valueWatts: expected.normalizedPowerWatts,
    });
    expect(live.observations.duration.value).toMatchObject({
      elapsed: { status: "available", value: expected.durationSeconds },
      active: { status: "available", value: expected.durationSeconds },
      moving: { status: "available", value: expected.durationSeconds },
    });
    expect(live.observations.distance.value).toMatchObject({
      status: "available",
      value: expected.distanceMeters,
    });
    const importedNormalizedPower = selectCyclingNormalizedPowerWatts(
      segment.summary.normalizedPowerResult,
    );
    const liveNormalizedPower = selectCyclingNormalizedPowerWatts(live.normalizedPowerResult);
    expect(importedNormalizedPower).not.toBeNull();
    expect(liveNormalizedPower).not.toBeNull();
    if (importedNormalizedPower === null || liveNormalizedPower === null) {
      throw new Error("Expected imported and live normalized power");
    }
    expect(Math.abs(importedNormalizedPower - expected.normalizedPowerWatts)).toBeLessThanOrEqual(
      tolerance.normalizedPowerWatts,
    );
    expect(Math.abs(liveNormalizedPower - expected.normalizedPowerWatts)).toBeLessThanOrEqual(
      tolerance.normalizedPowerWatts,
    );
    expect(Math.abs(importedNormalizedPower - liveNormalizedPower)).toBeLessThanOrEqual(
      tolerance.normalizedPowerWatts,
    );

    const importedIntensity = getNormalizedIntensity(importedCommonLoad);
    const liveIntensity = getNormalizedIntensity(live.commonLoad);
    expect(importedIntensity).not.toBeNull();
    expect(liveIntensity).not.toBeNull();
    if (importedIntensity === null || liveIntensity === null) {
      throw new Error("Expected imported and live normalized intensity");
    }
    expect(Math.abs(importedIntensity - expected.normalizedIntensity)).toBeLessThanOrEqual(
      tolerance.normalizedIntensity,
    );
    expect(Math.abs(liveIntensity - expected.normalizedIntensity)).toBeLessThanOrEqual(
      tolerance.normalizedIntensity,
    );
    expect(importedCommonLoad).toMatchObject({
      status: "available",
      load: expected.commonLoad,
      intensity: expected.normalizedIntensity,
    });
    expect(live.commonLoad).toMatchObject({
      status: "partial",
      load: expected.commonLoad,
      intensity: expected.normalizedIntensity,
      reason: "duration_partial",
    });
    if (
      importedCommonLoad.status !== "available" ||
      live.commonLoad.status !== "partial" ||
      live.commonLoad.load === null
    ) {
      throw new Error("Expected final import authority and provisional live authority");
    }
    expect(Math.abs(importedCommonLoad.load - live.commonLoad.load)).toBeLessThanOrEqual(
      tolerance.commonLoad,
    );
  });

  it("persists numeric partial Normalized Power with its coverage diagnostics", async () => {
    const fixture = CYCLING_NUMERICAL_TRUST_FIXTURES_V1.missing;
    const startedAt = new Date("2026-07-31T10:00:00.000Z");
    const elapsedSeconds = 61;
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "cycling-partial-import-v1",
      profileId: "cycling-partial-profile-v1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: { totalTime: elapsedSeconds, totalDistance: 610, avgPower: 200 },
        records: fixture.samples.map((sample) => ({
          sessionMessageIndex: 0,
          timestamp: new Date(startedAt.getTime() + sample.timestampSeconds * 1_000),
          ...(sample.powerWatts === null ? {} : { power: sample.powerWatts }),
        })),
        segments: explicitBikeSegment(startedAt, elapsedSeconds),
        sessions: [
          {
            messageIndex: 0,
            rawSport: "cycling",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + elapsedSeconds * 1_000),
            totalElapsedTime: elapsedSeconds,
            totalTimerTime: elapsedSeconds,
            totalMovingTime: elapsedSeconds,
            totalDistance: 610,
            laps: [],
            records: [],
          },
        ],
      },
    });

    expect(result.segmentSet.segments[0]?.summary).toMatchObject({
      normalizedPowerResult: {
        status: "partial",
        valueWatts: fixture.expected.normalizedPowerWatts,
        reason: "source_incomplete",
        diagnostics: fixture.expected.diagnostics,
      },
    });
  });

  it("uses retained semantic pause ranges as inactive rather than missing power", async () => {
    const fixture = CYCLING_NUMERICAL_TRUST_FIXTURES_V1.paused;
    const startedAt = new Date("2026-07-31T10:00:00.000Z");
    const elapsedSeconds = 61;
    const activeSeconds = 60;
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "cycling-pause-import-v1",
      profileId: "cycling-pause-profile-v1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: { totalTime: elapsedSeconds, totalDistance: 600, avgPower: 200 },
        records: fixture.samples.map((sample) => ({
          sessionMessageIndex: 0,
          timestamp: new Date(startedAt.getTime() + sample.timestampSeconds * 1_000),
          ...(sample.powerWatts === null ? {} : { power: sample.powerWatts }),
        })),
        segments: explicitBikeSegment(startedAt, elapsedSeconds),
        sessions: [
          {
            messageIndex: 0,
            rawSport: "cycling",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + elapsedSeconds * 1_000),
            totalElapsedTime: elapsedSeconds,
            totalTimerTime: activeSeconds,
            totalMovingTime: activeSeconds,
            totalDistance: 600,
            laps: [],
            records: [],
          },
        ],
        semantics: activityArtifactSemanticsSchema.parse({
          segments: [
            {
              role: "activity",
              activity_category: "bike",
              rawSport: "cycling",
              startOffsetMs: 0,
              endOffsetMs: elapsedSeconds * 1_000,
              activeMs: activeSeconds * 1_000,
              movingMs: activeSeconds * 1_000,
              distanceMeters: 600,
              pauseRanges: [{ startOffsetMs: 30_000, endOffsetMs: 31_000 }],
            },
          ],
          totals: {
            elapsedMs: elapsedSeconds * 1_000,
            activeMs: activeSeconds * 1_000,
            movingMs: activeSeconds * 1_000,
            distanceMeters: 600,
          },
        }),
      },
    });

    expect(result.segmentSet.segments[0]?.summary.normalizedPowerResult).toMatchObject({
      status: "available",
      valueWatts: fixture.expected.normalizedPowerWatts,
      diagnostics: fixture.expected.diagnostics,
    });
  });

  it("isolates normalized metrics and efforts by ordered segment activity category and record slice", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const segment = (
      sessionMessageIndex: number,
      role: "activity" | "transition" | "unknown",
      startSeconds: number,
      endSeconds: number,
      activity_category?: "run" | "bike",
      rawSport: string | number = activity_category === "run" ? "running" : "cycling",
    ) => ({
      sessionMessageIndex,
      role,
      ...(role === "activity" && activity_category ? { activity_category } : {}),
      rawSport,
      startTime: new Date(startedAt.getTime() + startSeconds * 1000),
      endTime: new Date(startedAt.getTime() + endSeconds * 1000),
    });
    const records = [
      ...Array.from({ length: 60 }, (_, second) => ({
        sessionMessageIndex: 1,
        timestamp: new Date(startedAt.getTime() + second * 1000),
        speed: 4 + second / 100,
      })),
      ...Array.from({ length: 60 }, (_, second) => ({
        sessionMessageIndex: 3,
        timestamp: new Date(startedAt.getTime() + (70 + second) * 1000),
        power: 200 + second,
      })),
      ...Array.from({ length: 60 }, (_, second) => ({
        sessionMessageIndex: 5,
        timestamp: new Date(startedAt.getTime() + (140 + second) * 1000),
        speed: 5 + second / 100,
      })),
    ];
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "multisport" },
        summary: { totalTime: 200, totalDistance: 2_000 },
        records,
        segments: [
          segment(1, "activity", 0, 60, "run"),
          segment(2, "transition", 60, 70, undefined, "transition"),
          segment(3, "activity", 70, 130, "bike"),
          segment(4, "unknown", 130, 140, undefined, 254),
          segment(5, "activity", 140, 200, "run"),
        ],
      },
    });

    const efforts = result.effortsToInsert;
    expect(efforts.some((effort) => effort.activity_category === "bike")).toBe(true);
    expect(efforts.filter((effort) => effort.activity_category === "run")).not.toHaveLength(0);
    expect(
      efforts.every((effort) => {
        const start = effort.start_offset_ms / 1_000;
        const end = effort.end_offset_ms / 1_000;
        return effort.activity_category === "bike"
          ? start >= 70 && end <= 130
          : (start >= 0 && end <= 60) || (start >= 140 && end <= 200);
      }),
    ).toBe(true);
    expect(
      efforts.every((effort) => {
        const provenance = effort.provenance;
        if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) {
          return false;
        }
        const entries = Object.entries(provenance);
        const exactStart = entries.find(
          ([key]) => key === "exact_window_start_offset_seconds",
        )?.[1];
        const exactEnd = entries.find(([key]) => key === "exact_window_end_offset_seconds")?.[1];
        if (typeof exactStart !== "number" || typeof exactEnd !== "number") return false;
        return effort.activity_category === "bike"
          ? exactStart >= 70 && exactEnd <= 130
          : (exactStart >= 0 && exactEnd <= 60) || (exactStart >= 140 && exactEnd <= 200);
      }),
    ).toBe(true);
    expect(result.summaryValues).toMatchObject({
      normalized_speed_mps: null,
    });
    expect(result.summaryValues).not.toHaveProperty("normalized_graded_speed_mps");
    expect(result.segmentSet.segments[0]).toMatchObject({
      activity_category: "run",
      summary: {
        averageSpeedMetersPerSecond: expect.any(Number),
      },
    });
    expect(result.segmentSet.segments[2]).toMatchObject({
      activity_category: "bike",
      summary: {
        averagePowerWatts: expect.any(Number),
        normalizedPowerResult: {
          status: "available",
          valueWatts: expect.any(Number),
        },
      },
    });
    expect(result.segmentSet.segments[3]).toMatchObject({ role: "unknown" });
  });

  it("preserves every source session, unknown activity-category identity, and sparse timing", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "multisport" },
        summary: { totalTime: 120, totalDistance: 500 },
        records: [],
        segments: [
          {
            sessionMessageIndex: 7,
            role: "activity",
            activity_category: "run",
            rawSport: "running",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 50_000),
          },
          {
            sessionMessageIndex: 8,
            role: "unknown",
            rawSport: 254,
            startTime: new Date(startedAt.getTime() + 60_000),
            endTime: new Date(startedAt.getTime() + 120_000),
          },
        ],
        sessions: [
          {
            messageIndex: 7,
            rawSport: "running",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 50_000),
            totalElapsedTime: 50,
            totalTimerTime: 45,
            laps: [],
            records: [],
          },
          {
            messageIndex: 8,
            rawSport: 254,
            startTime: new Date(startedAt.getTime() + 60_000),
            endTime: new Date(startedAt.getTime() + 120_000),
            totalElapsedTime: 60,
            laps: [],
            records: [],
          },
        ],
      },
    });
    expect(result.segmentSet.segments).toHaveLength(2);
    expect(result.segmentSet.segments[0]?.summary.timing).toEqual({
      timingCoverage: "partial",
      activeMs: 45_000,
    });
    expect(result.segmentSet.segments[1]).toMatchObject({
      role: "unknown",
      source: { kind: "raw", rawSport: 254 },
      summary: { timing: { timingCoverage: "unavailable" } },
    });
    expect(result.summaryValues).toMatchObject({
      active_ms: null,
      moving_ms: null,
      timing_coverage: "partial",
    });
  });

  it("keeps an unsupported provider modality unavailable instead of forcing the other category", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      artifactId: "11111111-1111-4111-8111-111111111111",
      provider: "wahoo",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "hiking" },
        summary: { totalTime: 60, totalDistance: 500 },
        records: [],
        segments: [
          {
            sessionMessageIndex: 0,
            role: "activity",
            activity_category: "other",
            rawSport: "hiking",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
          },
        ],
      },
    });

    expect(result.segmentSet.segments).toEqual([
      expect.objectContaining({
        role: "unknown",
        source: expect.objectContaining({
          kind: "artifact",
          rawSport: "hiking",
        }),
      }),
    ]);
    expect(result.segmentSet.segments[0]).not.toHaveProperty("activity_category");
    expect(result.effortsToInsert).toEqual([]);
  });

  it("uses wall-clock segment bounds when an aggregate summary reports active time", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "multisport" },
        summary: { totalTime: 100, totalDistance: 1_000 },
        records: [],
        segments: [
          {
            sessionMessageIndex: 1,
            role: "activity",
            activity_category: "run",
            rawSport: "running",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
          },
          {
            sessionMessageIndex: 2,
            role: "activity",
            activity_category: "bike",
            rawSport: "cycling",
            startTime: new Date(startedAt.getTime() + 60_000),
            endTime: new Date(startedAt.getTime() + 120_000),
          },
        ],
        sessions: [
          {
            messageIndex: 1,
            rawSport: "running",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
            totalElapsedTime: 60,
            totalTimerTime: 50,
            totalMovingTime: 45,
            laps: [],
            records: [],
          },
          {
            messageIndex: 2,
            rawSport: "cycling",
            startTime: new Date(startedAt.getTime() + 60_000),
            endTime: new Date(startedAt.getTime() + 120_000),
            totalElapsedTime: 60,
            totalTimerTime: 50,
            totalMovingTime: 45,
            laps: [],
            records: [],
          },
        ],
      },
    });

    expect(result.activityCompletedAt).toEqual(new Date(startedAt.getTime() + 120_000));
    expect(result.segmentSet.elapsedMs).toBe(120_000);
    expect(result.segmentSet.segments.map((segment) => segment.endOffsetMs)).toEqual([
      60_000, 120_000,
    ]);
    expect(result.summaryValues).toMatchObject({
      elapsed_ms: 120_000,
      active_ms: 100_000,
      moving_ms: 90_000,
      timing_coverage: "complete",
    });
  });

  it("omits contradictory source timing instead of exceeding segment bounds", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "running" },
        summary: { totalTime: 60, totalDistance: 500 },
        records: [],
        segments: [
          {
            sessionMessageIndex: 1,
            role: "activity",
            activity_category: "run",
            rawSport: "running",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
          },
        ],
        sessions: [
          {
            messageIndex: 1,
            rawSport: "running",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
            totalElapsedTime: 60,
            totalTimerTime: 61,
            totalMovingTime: 62,
            laps: [],
            records: [],
          },
        ],
      },
    });

    expect(result.segmentSet.segments[0]?.summary.timing).toEqual({
      timingCoverage: "unavailable",
    });
    expect(result.summaryValues).toMatchObject({
      elapsed_ms: 60_000,
      active_ms: null,
      moving_ms: null,
      timing_coverage: "unavailable",
    });
  });

  it("uses bounded provider active duration for a single segment only when FIT active timing is absent", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      refreshWeather: false,
      providerActiveDurationSeconds: 55,
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: { totalTime: 60, totalDistance: 500 },
        records: [],
        segments: explicitBikeSegment(startedAt, 60),
      },
    });

    expect(result.segmentSet.segments[0]?.summary.timing).toEqual({
      timingCoverage: "partial",
      activeMs: 55_000,
    });
    expect(result.summaryValues).toMatchObject({
      active_ms: null,
      moving_ms: null,
      timing_coverage: "partial",
    });
  });

  it("preserves FIT swim session average speed over sparse per-length record averages", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      refreshWeather: false,
      providerActiveDurationSeconds: 50,
      parsedData: {
        metadata: { startTime: startedAt, type: "swimming" },
        summary: { totalTime: 60, totalDistance: 50, avgSpeed: 9 },
        records: [
          { sessionMessageIndex: 0, timestamp: startedAt, speed: 1.2 },
          {
            sessionMessageIndex: 0,
            timestamp: new Date(startedAt.getTime() + 30_000),
            speed: 1.4,
          },
        ],
        segments: [
          {
            sessionMessageIndex: 0,
            role: "activity",
            activity_category: "swim",
            rawSport: "swimming",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
          },
        ],
        sessions: [
          {
            messageIndex: 0,
            rawSport: "swimming",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
            totalElapsedTime: 60,
            totalDistance: 50,
            avgSpeed: 1,
            laps: [],
            records: [],
          },
        ],
      },
    });

    expect(result.segmentSet.segments[0]?.summary).toMatchObject({
      timing: { timingCoverage: "partial", activeMs: 50_000 },
      distanceMeters: 50,
      averageSpeedMetersPerSecond: 1,
    });
    expect(result.segmentSet.segments[0]?.summary.normalizedSpeedMetersPerSecond).toBeCloseTo(
      50 / 50,
    );
    expect(result.summaryValues.avg_speed_mps).toBe(1);
  });

  it("falls back to swim record speed when FIT session average speed is not positive", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "swimming" },
        summary: { totalTime: 60, totalDistance: 50 },
        records: [
          { sessionMessageIndex: 0, timestamp: startedAt, speed: 1.2 },
          {
            sessionMessageIndex: 0,
            timestamp: new Date(startedAt.getTime() + 30_000),
            speed: 1.4,
          },
        ],
        segments: [
          {
            sessionMessageIndex: 0,
            role: "activity",
            activity_category: "swim",
            rawSport: "swimming",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
          },
        ],
        sessions: [
          {
            messageIndex: 0,
            rawSport: "swimming",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
            totalElapsedTime: 60,
            totalTimerTime: 60,
            totalMovingTime: 60,
            totalDistance: 50,
            avgSpeed: 0,
            laps: [],
            records: [],
          },
        ],
      },
    });

    expect(result.segmentSet.segments[0]?.summary.averageSpeedMetersPerSecond).toBeCloseTo(1.3);
  });

  it("does not allocate provider active duration across multisport segments", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      refreshWeather: false,
      providerActiveDurationSeconds: 180,
      parsedData: {
        metadata: { startTime: startedAt, type: "multisport" },
        summary: { totalTime: 120, totalDistance: 500 },
        records: [],
        segments: [
          ...explicitBikeSegment(startedAt, 60),
          {
            sessionMessageIndex: 1,
            role: "activity" as const,
            activity_category: "run" as const,
            rawSport: "running",
            startTime: new Date(startedAt.getTime() + 60_000),
            endTime: new Date(startedAt.getTime() + 120_000),
          },
        ],
      },
    });

    expect(result.segmentSet.segments.map((segment) => segment.summary.timing)).toEqual([
      { timingCoverage: "unavailable" },
      { timingCoverage: "unavailable" },
    ]);
  });

  it("rejects provider active duration beyond a single segment's elapsed bounds", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      refreshWeather: false,
      providerActiveDurationSeconds: 60.5,
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: { totalTime: 60, totalDistance: 500 },
        records: [],
        segments: explicitBikeSegment(startedAt, 60),
      },
    });

    expect(result.segmentSet.segments[0]?.summary.timing).toEqual({
      timingCoverage: "unavailable",
    });
  });

  it("keeps parsed moving-only timing without provider active fallback", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      refreshWeather: false,
      providerActiveDurationSeconds: 55,
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: { totalTime: 60, totalDistance: 500 },
        records: [],
        segments: explicitBikeSegment(startedAt, 60),
        sessions: [
          {
            messageIndex: 0,
            rawSport: "cycling",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
            totalElapsedTime: 60,
            totalMovingTime: 60,
            laps: [],
            records: [],
          },
        ],
      },
    });

    expect(result.segmentSet.segments[0]?.summary.timing).toEqual({
      timingCoverage: "partial",
      movingMs: 60_000,
    });
  });

  it("collects every available per-activity effort without profile metrics or prior records", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const records = Array.from({ length: 61 }, (_, second) => ({
      timestamp: new Date(startedAt.getTime() + second * 1000),
      power: 200 + second,
    }));

    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: { totalTime: 60, totalDistance: 500, avgPower: 230 },
        records,
        laps: [],
        segments: explicitBikeSegment(startedAt, 60),
      },
    });

    expect(result.effortsToInsert.map((effort) => effort.duration_seconds)).toEqual([
      5, 10, 30, 60,
    ]);
    expect(result.effortsToInsert).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activity_id: "activity-1",
          profile_id: "profile-1",
          activity_category: "bike",
          effort_type: "power",
          source: "imported",
          method: "activity_file_best_effort",
        }),
      ]),
    );
  });

  it("retains both exact run source-series efforts through full parsed-file analysis", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "running" },
        summary: { totalTime: 1_800, totalDistance: 7_200 },
        records: Array.from({ length: 1_801 }, (_, second) => ({
          sessionMessageIndex: 0,
          timestamp: new Date(startedAt.getTime() + second * 1_000),
          speed: 4,
          altitude: second * 0.01,
        })),
        segments: [
          {
            sessionMessageIndex: 0,
            role: "activity",
            activity_category: "run",
            rawSport: "running",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 1_800_000),
          },
        ],
      },
    });

    const exact = result.effortsToInsert.filter(
      (effort) => effort.duration_seconds === 1_800 && effort.effort_type === "speed",
    );
    expect(exact.map(({ source_series }) => source_series)).toEqual([
      "grade_adjusted_speed",
      "raw_speed",
    ]);
    expect(exact).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_series: "grade_adjusted_speed",
          provenance: expect.objectContaining({ source_series: "grade_adjusted_speed" }),
        }),
        expect.objectContaining({
          source_series: "raw_speed",
          provenance: expect.objectContaining({ source_series: "raw_speed" }),
        }),
      ]),
    );
  });

  it("treats a supported artifact with no eligible stream as analyzed with zero efforts", async () => {
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      parsedData: {
        metadata: { startTime: new Date("2026-01-01T10:00:00Z"), type: "cycling" },
        summary: { totalTime: 60, totalDistance: 500 },
        records: [],
        segments: explicitBikeSegment(new Date("2026-01-01T10:00:00Z"), 60),
      },
    });

    expect(result.effortsToInsert).toEqual([]);
    expect(result.detectedLTHR).toBeNull();
  });

  it("does not promote a legacy 20-minute best-HR effort as calibration evidence", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithMetricResults([[], []]), {
      activityId: "bike-activity",
      profileId: "profile-1",
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: { totalTime: 1_200, totalDistance: 20_000, avgHeartRate: 170 },
        records: sustainedHeartRateRecords(startedAt),
        segments: explicitBikeSegment(startedAt, 1_200),
      },
    });

    expect(result.detectedLTHR).toBeNull();
    expect(result.segmentSet.segments[0]?.summary).toMatchObject({
      heartRateDistribution: {
        coverageSeconds: 1200,
        buckets: [{ bpm: 170, seconds: 1200 }],
      },
    });
    expect(result.effortsToInsert).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          segment_id: expect.any(String),
          effort_type: "heart_rate",
          unit: "bpm",
        }),
      ]),
    );
  });

  it("does not use a prior profile metric to authorize a short HR effort", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const db = dbWithMetricResults([
      [
        {
          referenceActivityId: "prior-bike-activity",
          value: 175,
          source: "derived",
          method: "activity_file_lthr_detection",
          provenance: {
            activity_id: "prior-bike-activity",
            derived_from: "activity_file_stream",
          },
        },
      ],
    ]);
    const result = await analyzeParsedActivityFile(db, {
      activityId: "bike-activity",
      profileId: "profile-1",
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: { totalTime: 1_200, totalDistance: 20_000, avgHeartRate: 170 },
        records: sustainedHeartRateRecords(startedAt, 174),
        segments: explicitBikeSegment(startedAt, 1_200),
      },
    });

    expect(result.detectedLTHR).toBeNull();
  });

  it("does not let an untrusted profile LTHR promote a short activity window", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(
      dbWithMetricResults([
        [
          {
            referenceActivityId: "manual-threshold",
            value: 190,
            source: "manual",
            method: "manual_entry",
            provenance: null,
          },
        ],
        [],
      ]),
      {
        activityId: "bike-activity",
        profileId: "profile-1",
        parsedData: {
          metadata: { startTime: startedAt, type: "cycling" },
          summary: { totalTime: 1_200, totalDistance: 20_000, avgHeartRate: 170 },
          records: sustainedHeartRateRecords(startedAt),
          segments: explicitBikeSegment(startedAt, 1_200),
        },
      },
    );

    expect(result.detectedLTHR).toBeNull();
  });

  it("projects only complete owned pool-length evidence and single-swim parent fields", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "swim-activity",
      profileId: "profile-1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "swimming" },
        summary: { totalTime: 60, totalDistance: 50 },
        records: [],
        segments: [
          {
            sessionMessageIndex: 4,
            role: "activity",
            activity_category: "swim",
            rawSport: "swimming",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
          },
        ],
        sessions: [
          {
            messageIndex: 4,
            rawSport: "swimming",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
            totalElapsedTime: 60,
            poolLengthMeters: 22.86,
            numActiveLengths: 2,
            totalStrokes: 40,
            laps: [],
            records: [],
          },
        ],
        lengths: [
          { sessionMessageIndex: 4, lengthType: "active", totalTimerTime: 25, totalStrokes: 20 },
          { sessionMessageIndex: 4, lengthType: "active", totalElapsedTime: 30, totalStrokes: 20 },
          { sessionMessageIndex: 4, lengthType: "idle", totalElapsedTime: 10, totalStrokes: 0 },
        ],
      },
    });

    expect(result.segmentSet.segments[0]?.summary.swim).toMatchObject({
      poolLengthMeters: 22.86,
      lengthCount: 2,
      strokeCount: 40,
      averageSwolf: 47.5,
    });
    expect(result.summaryValues).toMatchObject({
      pool_length_meters: 22.86,
      total_strokes: 40,
      avg_swolf: 47.5,
    });
  });

  it("uses complete owned pool lengths to separate active swim time from rest", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "swim-timing-activity",
      profileId: "profile-1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "swimming" },
        summary: { totalTime: 60, totalDistance: 30 },
        records: [
          { timestamp: startedAt, speed: 1 },
          { timestamp: new Date(startedAt.getTime() + 30_000), speed: 1 },
        ],
        segments: [
          {
            sessionMessageIndex: 4,
            role: "activity",
            activity_category: "swim",
            rawSport: "swimming",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
          },
        ],
        sessions: [
          {
            messageIndex: 4,
            rawSport: "swimming",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
            totalElapsedTime: 60,
            numActiveLengths: 1,
            totalDistance: 30,
            laps: [],
            records: [],
          },
        ],
        lengths: [
          { sessionMessageIndex: 4, lengthType: "active", totalTimerTime: 30 },
          { sessionMessageIndex: 4, lengthType: "rest", totalElapsedTime: 30 },
        ],
      },
    });

    expect(result.segmentSet.segments[0]?.summary.timing).toEqual({
      timingCoverage: "complete",
      activeMs: 30_000,
      movingMs: 30_000,
    });
    expect(result.segmentSet.segments[0]?.summary.swim?.timingEvidence).toMatchObject({
      status: "available",
      calculationVersion: "swim-active-rest-duration-v1",
      activeDurationSeconds: 30,
      restDurationSeconds: 30,
    });
    expect(result.summaryValues).toMatchObject({
      elapsed_ms: 60_000,
      active_ms: 30_000,
      moving_ms: 30_000,
      timing_coverage: "complete",
      normalized_speed_mps: 1,
    });
    expect(result.effortsToInsert).toEqual([]);
    expect(
      result.segmentSet.segments[0]?.summary.bestEffortExtractions?.find(
        (extraction) => extraction.metric === "speed",
      ),
    ).toBeDefined();
  });

  it("omits partial swim length metrics and leaves multisport parent swim fields null", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "multi-activity",
      profileId: "profile-1",
      refreshWeather: false,
      parsedData: {
        metadata: { startTime: startedAt, type: "multisport" },
        summary: { totalTime: 120, totalDistance: 1_000 },
        records: [],
        segments: [
          {
            sessionMessageIndex: 1,
            role: "activity",
            activity_category: "swim",
            rawSport: "swimming",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
          },
          {
            sessionMessageIndex: 2,
            role: "activity",
            activity_category: "bike",
            rawSport: "cycling",
            startTime: new Date(startedAt.getTime() + 60_000),
            endTime: new Date(startedAt.getTime() + 120_000),
          },
        ],
        sessions: [
          {
            messageIndex: 1,
            rawSport: "swimming",
            startTime: startedAt,
            endTime: new Date(startedAt.getTime() + 60_000),
            totalElapsedTime: 60,
            numActiveLengths: 2,
            laps: [],
            records: [],
          },
          {
            messageIndex: 2,
            rawSport: "cycling",
            startTime: new Date(startedAt.getTime() + 60_000),
            endTime: new Date(startedAt.getTime() + 120_000),
            totalElapsedTime: 60,
            laps: [],
            records: [],
          },
        ],
        lengths: [
          { sessionMessageIndex: 1, lengthType: "active", totalTimerTime: 25, totalStrokes: 20 },
        ],
      },
    });

    expect(result.segmentSet.segments[0]?.summary.swim).toMatchObject({ lengthCount: 2 });
    expect(result.summaryValues).toMatchObject({
      pool_length_meters: null,
      total_strokes: null,
      avg_swolf: null,
    });
  });

  it("does not let an activity's legacy profile metric promote its own short window", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(
      dbWithMetricResults([
        [
          {
            referenceActivityId: "bike-activity",
            value: 162,
            source: "derived",
            method: "activity_file_lthr_detection",
            provenance: {
              activity_id: "bike-activity",
              derived_from: "activity_file_stream",
            },
          },
        ],
        [],
      ]),
      {
        activityId: "bike-activity",
        profileId: "profile-1",
        parsedData: {
          metadata: { startTime: startedAt, type: "cycling" },
          summary: { totalTime: 1_200, totalDistance: 20_000, avgHeartRate: 170 },
          records: sustainedHeartRateRecords(startedAt),
          segments: explicitBikeSegment(startedAt, 1_200),
        },
      },
    );

    expect(result.detectedLTHR).toBeNull();
  });
});

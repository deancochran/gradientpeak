import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { getRequiredDb } from "../../db";
import {
  analyzeParsedActivityFile,
  getLatestActivityCategoryLthrValue,
} from "./analyze-parsed-activity-file";

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

describe("analyzeParsedActivityFile", () => {
  it("compares JSON provenance with the UUID reference through an explicit text cast", async () => {
    let whereCondition: unknown;
    const tail = {
      where: vi.fn((condition: unknown) => {
        whereCondition = condition;
        return {
          orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
        };
      }),
    };
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ innerJoin: vi.fn(() => tail) })),
      })),
    } as unknown as DbClient;

    await getLatestActivityCategoryLthrValue(db, {
      activityCategory: "run",
      profileId: "profile-1",
      recordedAtLte: new Date("2026-01-01T10:00:00Z"),
    });

    const query = new PgDialect().sqlToQuery(whereCondition as never).sql;
    expect(query).toContain(
      `"profile_metrics"."provenance" ->> 'activity_id' = cast("profile_metrics"."reference_activity_id" as text)`,
    );
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
        const start = effort.start_offset ?? 0;
        const end = start + effort.duration_seconds;
        return effort.activity_category === "bike"
          ? start >= 70 && end <= 130
          : (start >= 0 && end <= 60) || (start >= 140 && end <= 200);
      }),
    ).toBe(true);
    expect(
      efforts.every((effort) => {
        const provenance = effort.provenance as Record<string, unknown>;
        const exactStart = provenance.exact_window_start_seconds;
        const exactEnd = provenance.exact_window_end_seconds;
        if (typeof exactStart !== "number" || typeof exactEnd !== "number") return false;
        return effort.activity_category === "bike"
          ? exactStart >= 70 && exactEnd <= 130
          : (exactStart >= 0 && exactEnd <= 60) || (exactStart >= 140 && exactEnd <= 200);
      }),
    ).toBe(true);
    expect(result.summaryValues).toMatchObject({
      normalized_speed_mps: null,
      normalized_graded_speed_mps: null,
    });
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
        normalizedPowerWatts: expect.any(Number),
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
      50 / 60,
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
  });

  it("promotes a bike LTHR even when another activity category has a higher threshold", async () => {
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

    expect(result.detectedLTHR).toBe(162);
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

  it("keeps the same-category LTHR high-water behavior", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(
      dbWithMetricResults([
        [
          {
            referenceActivityId: "prior-bike-activity",
            value: 165,
            source: "derived",
            method: "activity_file_lthr_detection",
            provenance: {
              activity_id: "prior-bike-activity",
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

  it("does not let untrusted LTHR suppress trusted activity detection", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(
      dbWithMetricResults([
        [
          {
            referenceActivityId: "manual-threshold",
            value: 190,
            source: "manual",
            method: "profile_update_override",
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

    expect(result.detectedLTHR).toBe(162);
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

    expect(result.segmentSet.segments[0]?.summary.swim).toEqual({
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

    expect(result.segmentSet.segments[0]?.summary.swim).toEqual({ lengthCount: 2 });
    expect(result.summaryValues).toMatchObject({
      pool_length_meters: null,
      total_strokes: null,
      avg_swolf: null,
    });
  });

  it("does not let an activity suppress its own equal LTHR during reanalysis", async () => {
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

    expect(result.detectedLTHR).toBe(162);
  });
});

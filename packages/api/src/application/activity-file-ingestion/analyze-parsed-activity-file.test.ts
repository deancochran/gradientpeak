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
      category: "bike" as const,
      rawSport: "cycling",
      startTime: startedAt,
      endTime: new Date(startedAt.getTime() + seconds * 1000),
    },
  ];
}

describe("analyzeParsedActivityFile", () => {
  it("isolates normalized metrics and efforts by ordered segment category and record slice", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const segment = (
      sessionMessageIndex: number,
      role: "activity" | "transition" | "unknown",
      startSeconds: number,
      endSeconds: number,
      category?: "run" | "bike",
      rawSport: string | number = category === "run" ? "running" : "cycling",
    ) => ({
      sessionMessageIndex,
      role,
      ...(role === "activity" && category ? { category } : {}),
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
    expect(result.summaryValues).toMatchObject({
      normalized_power: null,
      normalized_speed_mps: null,
      normalized_graded_speed_mps: null,
    });
    expect(result.segmentSet.segments[0]).toMatchObject({
      category: "run",
      summary: { averageSpeedMetersPerSecond: expect.any(Number) },
    });
    expect(result.segmentSet.segments[2]).toMatchObject({
      category: "bike",
      summary: { averagePowerWatts: expect.any(Number) },
    });
    expect(result.segmentSet.segments[3]).toMatchObject({ role: "unknown" });
  });

  it("preserves every source session, unknown sport identity, and sparse timing", async () => {
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
            category: "run",
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

  it("promotes a bike LTHR even when another sport has a higher threshold", async () => {
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
  });

  it("keeps the same-sport LTHR high-water behavior", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(
      dbWithMetricResults([[{ value: 165, method: null, provenance: null }], []]),
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

  it("does not let an activity suppress its own equal LTHR during reanalysis", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(
      dbWithMetricResults([
        [
          {
            referenceActivityId: "bike-activity",
            value: 162,
            method: "activity_file_lthr_detection",
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
});

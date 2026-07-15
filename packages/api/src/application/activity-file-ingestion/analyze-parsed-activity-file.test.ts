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

describe("analyzeParsedActivityFile", () => {
  it("collects every available per-activity effort without profile metrics or prior records", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const records = Array.from({ length: 61 }, (_, second) => ({
      timestamp: new Date(startedAt.getTime() + second * 1000),
      power: 200 + second,
    }));

    const result = await analyzeParsedActivityFile(dbWithoutProfileMetrics(), {
      activityId: "activity-1",
      profileId: "profile-1",
      activityType: "bike",
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: { totalTime: 60, totalDistance: 500, avgPower: 230 },
        records,
        laps: [],
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
      activityType: "bike",
      parsedData: {
        metadata: { startTime: new Date("2026-01-01T10:00:00Z"), type: "cycling" },
        summary: { totalTime: 60, totalDistance: 500 },
        records: [],
      },
    });

    expect(result.effortsToInsert).toEqual([]);
  });

  it("promotes a bike LTHR even when another sport has a higher threshold", async () => {
    const startedAt = new Date("2026-01-01T10:00:00Z");
    const result = await analyzeParsedActivityFile(dbWithMetricResults([[], []]), {
      activityId: "bike-activity",
      profileId: "profile-1",
      activityType: "bike",
      parsedData: {
        metadata: { startTime: startedAt, type: "cycling" },
        summary: { totalTime: 1_200, totalDistance: 20_000, avgHeartRate: 170 },
        records: sustainedHeartRateRecords(startedAt),
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
        activityType: "bike",
        parsedData: {
          metadata: { startTime: startedAt, type: "cycling" },
          summary: { totalTime: 1_200, totalDistance: 20_000, avgHeartRate: 170 },
          records: sustainedHeartRateRecords(startedAt),
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
        activityType: "bike",
        parsedData: {
          metadata: { startTime: startedAt, type: "cycling" },
          summary: { totalTime: 1_200, totalDistance: 20_000, avgHeartRate: 170 },
          records: sustainedHeartRateRecords(startedAt),
        },
      },
    );

    expect(result.detectedLTHR).toBe(162);
  });
});

import { describe, expect, it, vi } from "vitest";
import { getTrendsDashboard } from "./get-dashboard";

const profileId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";
const segmentId = "33333333-3333-4333-8333-333333333333";

function activity(category: "bike" | "run" = "bike") {
  return {
    id: activityId,
    profile_id: profileId,
    name: "Tempo",
    started_at: new Date("2026-04-01T07:00:00.000Z"),
    finished_at: new Date("2026-04-01T08:00:00.000Z"),
    elapsed_ms: 3_600_000,
    active_ms: 3_600_000,
    moving_ms: 3_600_000,
    timing_coverage: "complete" as const,
    distance_meters: 10_000,
    avg_heart_rate: 145,
    max_heart_rate: 160,
    segments: [
      {
        id: segmentId,
        activity_id: activityId,
        ordinal: 0,
        role: "activity" as const,
        category,
        start_offset_ms: 0,
        end_offset_ms: 3_600_000,
        timing_coverage: "complete" as const,
        active_ms: 3_600_000,
        moving_ms: 3_600_000,
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 3_600_000, movingMs: 3_600_000 },
          distanceMeters: 10_000,
          averagePowerWatts: 220,
          averageSpeedMetersPerSecond: 6.5,
          averageHeartRateBpm: 145,
        },
      },
    ],
  };
}

describe("getTrendsDashboard", () => {
  it("builds parity sections once from the same normalized category-filtered rows", async () => {
    const buildDerivedSummaries = vi
      .fn()
      .mockResolvedValue(new Map([[segmentId, { intensity_factor: 0.8, tss: 50 }]]));
    const repository = { loadDashboardActivities: vi.fn().mockResolvedValue([activity()]) };
    const result = await getTrendsDashboard({
      buildDerivedSummaries,
      repository,
      store: {} as never,
      profileId,
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-04-01T23:59:59.999Z"),
      groupBy: "day",
      type: "bike",
    });
    expect(result).toMatchObject({
      volume: { totals: { totalDistance: 10_000, totalTime: 3_600, totalActivities: 1 } },
      performance: { dataPoints: [{ activityId: segmentId, avgPower: 220 }] },
      consistency: { totalActivities: 1, totalDays: 2 },
    });
    expect(buildDerivedSummaries).toHaveBeenCalledOnce();
    expect(buildDerivedSummaries.mock.calls[0]?.[0].activities).toHaveLength(1);
  });

  it("returns empty section semantics without deriving and excludes other categories", async () => {
    const buildDerivedSummaries = vi.fn();
    const repository = { loadDashboardActivities: vi.fn().mockResolvedValue([activity("run")]) };
    const result = await getTrendsDashboard({
      buildDerivedSummaries,
      repository,
      store: {} as never,
      profileId,
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-04-01T23:59:59.999Z"),
      groupBy: "day",
      type: "bike",
    });
    expect(result).toMatchObject({
      volume: { dataPoints: [], totals: null },
      performance: { dataPoints: [] },
      zones: { weeklyData: [] },
      consistency: { totalActivities: 0, totalDays: 0 },
    });
    expect(buildDerivedSummaries).not.toHaveBeenCalled();
  });
});

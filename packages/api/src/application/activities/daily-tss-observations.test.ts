import type { ActivityListDerivedSummary } from "@repo/core";
import type { activities } from "@repo/db";
import { describe, expect, it, vi } from "vitest";

const analysisMocks = vi.hoisted(() => ({
  buildActivityDerivedSummaryMap: vi.fn(),
  createActivityAnalysisStore: vi.fn(() => ({ kind: "analysis-store" })),
}));

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: analysisMocks.createActivityAnalysisStore,
}));
vi.mock("../../lib/activity-analysis", () => ({
  buildActivityDerivedSummaryMap: analysisMocks.buildActivityDerivedSummaryMap,
}));

import {
  aggregateDailyTssObservations,
  DailyTssActivityLimitExceededError,
  dailyTssActivityLimit,
  getDailyTssObservations,
} from "./daily-tss-observations";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const identity = {
  sport: "bike",
  method: "power_threshold",
  source: "activity_analysis",
  version: "1",
  calibration: { type: "ftp_watts", value: 250 },
} as const;

function activity(id: string, startedAt: string) {
  return {
    id,
    profile_id: PROFILE_ID,
    started_at: new Date(startedAt),
  } as unknown as typeof activities.$inferSelect;
}

function derived(
  tss: number | null,
  tssIdentity: ActivityListDerivedSummary["tss_identity"] = identity,
): ActivityListDerivedSummary {
  return {
    tss,
    tss_identity: tssIdentity,
    intensity_factor: tss === null ? null : 0.8,
    method: tss === null ? null : "power_threshold",
    unavailable_reason: tss === null ? "threshold_missing" : null,
    computed_as_of: "2026-03-09T00:00:00.000Z",
  };
}

describe("daily TSS observations", () => {
  it("sums stable series across calibration changes and marks missing or mixed methods unavailable", () => {
    const rows = [
      activity("same-1", "2026-03-08T15:00:00.000Z"),
      activity("same-2", "2026-03-08T18:00:00.000Z"),
      activity("missing", "2026-03-09T15:00:00.000Z"),
      activity("mixed-1", "2026-03-10T15:00:00.000Z"),
      activity("mixed-2", "2026-03-10T18:00:00.000Z"),
    ];
    const observations = aggregateDailyTssObservations({
      activities: rows,
      derivedByActivityId: new Map([
        ["same-1", derived(40)],
        ["same-2", derived(60, { ...identity, calibration: { value: 275, type: "ftp_watts" } })],
        ["missing", derived(null, null)],
        ["mixed-1", derived(30)],
        [
          "mixed-2",
          derived(20, {
            ...identity,
            method: "heart_rate_threshold",
            calibration: { type: "lthr_bpm", value: 170 },
          }),
        ],
      ]),
      startDate: "2026-03-08",
      endDate: "2026-03-10",
      timezone: "UTC",
    });

    expect(observations).toEqual([
      {
        date: "2026-03-08",
        state: "calculated",
        value: 100,
        tss_identity: identity,
        activity_count: 2,
        unavailable_activity_count: 0,
      },
      {
        date: "2026-03-09",
        state: "unavailable",
        value: null,
        tss_identity: null,
        activity_count: 1,
        unavailable_activity_count: 1,
        reason: "tss_unavailable",
      },
      {
        date: "2026-03-10",
        state: "unavailable",
        value: null,
        tss_identity: null,
        activity_count: 2,
        unavailable_activity_count: 0,
        reason: "mixed_tss_identities",
      },
    ]);
  });

  it("buckets by requested local date across the DST transition and stays sparse", () => {
    const rows = [
      activity("before-midnight", "2026-03-08T04:30:00.000Z"),
      activity("after-midnight", "2026-03-08T05:30:00.000Z"),
      activity("dst-midnight", "2026-03-09T04:30:00.000Z"),
    ];
    const observations = aggregateDailyTssObservations({
      activities: rows,
      derivedByActivityId: new Map(rows.map((row) => [row.id, derived(10)])),
      startDate: "2026-03-08",
      endDate: "2026-03-09",
      timezone: "America/New_York",
    });

    expect(observations.map(({ date, value }) => ({ date, value }))).toEqual([
      { date: "2026-03-08", value: 10 },
      { date: "2026-03-09", value: 10 },
    ]);
  });

  it("uses the analysis store and rejects activity sets above the ceiling", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue(
        Array.from({ length: dailyTssActivityLimit + 1 }, (_, index) =>
          activity(`activity-${index}`, "2026-03-08T12:00:00.000Z"),
        ),
      );
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({ orderBy: () => ({ limit }) }),
        }),
      }),
    } as unknown as Parameters<typeof getDailyTssObservations>[0]["db"];

    await expect(
      getDailyTssObservations({
        db,
        profileId: PROFILE_ID,
        range: { start_date: "2026-03-08", end_date: "2026-03-09", timezone: "UTC" },
      }),
    ).rejects.toBeInstanceOf(DailyTssActivityLimitExceededError);
    expect(limit).toHaveBeenCalledWith(10_001);
    expect(analysisMocks.buildActivityDerivedSummaryMap).not.toHaveBeenCalled();
  });
});

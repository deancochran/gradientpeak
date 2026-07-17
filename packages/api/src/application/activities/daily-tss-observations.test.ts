import { describe, expect, it } from "vitest";
import type { SegmentDerivedSummary } from "../../lib/activity-analysis";
import { aggregateDailyTssObservations } from "./daily-tss-observations";

const identity = {
  sport: "bike",
  method: "power_threshold",
  source: "activity_analysis",
  version: "1",
  calibration: { type: "ftp_watts", value: 250 },
} as const;

function summary(segmentId: string, value: number): SegmentDerivedSummary {
  return {
    activity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    segment_id: segmentId,
    category: "bike",
    tss: value,
    tss_identity: identity,
    intensity_factor: 0.8,
    method: "power_threshold",
    unavailable_reason: null,
    calibration_quality: null,
    computed_as_of: "2026-07-01T08:00:00.000Z",
    dedupe_key: `activity-segment:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:${segmentId}:load:v1`,
    load_stream_key: "bike:power_threshold:activity_analysis:1",
  };
}

describe("daily segment load observations", () => {
  it("dedupes into a stable load stream without a parent TSS observation", () => {
    const observations = aggregateDailyTssObservations({
      activities: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          started_at: new Date("2026-07-01T08:00:00.000Z"),
        },
      ],
      segmentSummaries: [summary("segment-1", 30), summary("segment-2", 20)],
      startDate: "2026-07-01",
      endDate: "2026-07-01",
      timezone: "UTC",
    });
    expect(observations).toEqual([
      {
        date: "2026-07-01",
        state: "calculated",
        value: 50,
        tss_identity: identity,
        activity_count: 2,
        unavailable_activity_count: 0,
      },
    ]);
  });
});

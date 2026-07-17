import { describe, expect, it, vi } from "vitest";
import {
  buildActivityDerivedSummaryMap,
  buildActivitySegmentDerivedSummaries,
  deriveActivityParentClassification,
} from "../derived";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

function segment(
  id: string,
  ordinal: number,
  category: "bike" | "run",
  start: number,
  end: number,
) {
  return {
    id,
    activity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ordinal,
    role: "activity" as const,
    category,
    start_offset_ms: start,
    end_offset_ms: end,
    timing_coverage: "complete" as const,
    active_ms: end - start,
    moving_ms: end - start,
    summary: {
      version: 1,
      timing: { timingCoverage: "complete", activeMs: end - start, movingMs: end - start },
      distanceMeters: category === "bike" ? 20_000 : 5_000,
      averagePowerWatts: category === "bike" ? 200 : undefined,
      averageSpeedMetersPerSecond: category === "run" ? 3.5 : undefined,
    },
  };
}

function activity(segments: ReturnType<typeof segment>[]) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    profile_id: PROFILE_ID,
    started_at: new Date("2026-07-01T08:00:00.000Z"),
    finished_at: new Date("2026-07-01T09:00:00.000Z"),
    elapsed_ms: 3_600_000,
    active_ms: 3_600_000,
    moving_ms: 3_600_000,
    timing_coverage: "complete" as const,
    distance_meters: 25_000,
    avg_heart_rate: null,
    max_heart_rate: null,
    segments,
  };
}

function store() {
  return {
    loadContextEvidence: vi.fn(
      async () =>
        new Map([
          [
            PROFILE_ID,
            {
              profile: { dob: null, gender: null },
              profileMetrics: [
                {
                  id: "ftp",
                  metric_type: "ftp",
                  value: 250,
                  unit: "watts",
                  recorded_at: new Date("2026-01-01T00:00:00.000Z"),
                  source: "manual",
                  method: null,
                  calculation_version: null,
                  provenance: null,
                  reference_activity_id: null,
                  reference_activity_category: null,
                },
              ],
              recentEfforts: [],
            },
          ],
        ]),
    ),
  };
}

describe("segment-derived activity analysis", () => {
  it("preserves ordered and repeated parent categories", () => {
    const segments = [
      segment("11111111-1111-4111-8111-111111111111", 0, "run", 0, 600_000),
      segment("22222222-2222-4222-8222-222222222222", 1, "bike", 600_000, 1_800_000),
      segment("33333333-3333-4333-8333-333333333333", 2, "run", 1_800_000, 2_400_000),
    ];
    expect(deriveActivityParentClassification(segments)).toEqual({
      kind: "multisport",
      categories: ["run", "bike", "run"],
      category: null,
    });
  });

  it("derives category-safe loads and does not publish a multisport parent TSS", async () => {
    const input = activity([
      segment("11111111-1111-4111-8111-111111111111", 0, "bike", 0, 1_800_000),
      segment("22222222-2222-4222-8222-222222222222", 1, "run", 1_800_000, 3_600_000),
    ]);
    const segments = await buildActivitySegmentDerivedSummaries({
      store: store() as never,
      profileId: PROFILE_ID,
      activities: [input],
    });
    expect(segments.map(({ category }) => category)).toEqual(["bike", "run"]);
    expect(segments[0]).toMatchObject({
      dedupe_key: `activity-segment:${input.id}:11111111-1111-4111-8111-111111111111:load:v1`,
      load_stream_key: "bike:power_threshold:activity_analysis:1",
    });

    const parent = await buildActivityDerivedSummaryMap({
      store: store() as never,
      profileId: PROFILE_ID,
      activities: [input],
    });
    expect(parent.has(input.id)).toBe(false);
    expect(parent.has(input.segments[0]?.id ?? "missing-segment")).toBe(true);
  });
});

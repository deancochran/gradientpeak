import { describe, expect, it } from "vitest";
import { mapFeedActivity } from "./feed-read-repository";

describe("feed activity projections", () => {
  it("preserves ordered repeated and multisport category composition with modern timing", () => {
    const result = mapFeedActivity(
      {
        id: "33333333-3333-4333-8333-333333333333",
        profile_id: "22222222-2222-4222-8222-222222222222",
        name: "Run bike run",
        category_composition: ["run", "bike", "run"],
        elapsed_ms: 7_200_000,
        active_ms: 6_600_000,
        moving_ms: 6_400_000,
        timing_coverage: "complete",
        started_at: new Date("2026-07-17T08:00:00.000Z"),
        finished_at: new Date("2026-07-17T10:00:00.000Z"),
        distance_meters: 42_000,
        avg_heart_rate: 150,
        max_heart_rate: 180,
        avg_power: 210,
        avg_cadence: 86,
        elevation_gain_meters: 450,
        calories: 1_200,
        polyline: null,
        is_private: false,
        content_visibility: "public",
        created_at: new Date("2026-07-17T10:01:00.000Z"),
        profile_username: "athlete",
        profile_avatar_url: null,
      },
      { commentCounts: new Map(), derivedMap: new Map(), likeStats: new Map() },
    );

    expect(result.activity_categories).toEqual(["run", "bike", "run"]);
    expect(result).toMatchObject({
      type: null,
      activity_kind: "multisport",
      elapsed_seconds: 7_200,
      duration_seconds: 6_600,
      moving_seconds: 6_400,
    });
    expect(result).not.toHaveProperty("activity_file_path");
  });
});

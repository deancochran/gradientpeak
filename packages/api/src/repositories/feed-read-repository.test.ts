import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { listFeedActivityRows, mapFeedActivity } from "./feed-read-repository";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";

describe("feed activity projections", () => {
  it("includes private activities for their owner without exposing them to followers", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });

    await listFeedActivityRows({ execute } as never, VIEWER_ID, { limit: 20 });

    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0] as never);
    const normalizedSql = query.sql.replace(/\s+/g, " ");

    expect(normalizedSql).toContain(
      "where ( a.profile_id = $1::uuid or a.content_visibility = 'public' or ( a.content_visibility = 'followers' and exists ( select 1 from follows f where f.follower_id = $2::uuid and f.following_id = a.profile_id and f.status = 'accepted' ) ) ) order by a.started_at desc, a.id desc",
    );
    expect(query.params).toEqual([VIEWER_ID, VIEWER_ID, 21]);
  });

  it("parses node-postgres bigint and timestamp values from feed rows", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          profile_id: VIEWER_ID,
          name: "Private run",
          category_composition: ["run"],
          elapsed_ms: "3600000",
          active_ms: "3500000",
          moving_ms: null,
          timing_coverage: "complete",
          distance_meters: 10_000,
          avg_heart_rate: null,
          max_heart_rate: null,
          avg_power: null,
          max_power: null,
          avg_cadence: null,
          avg_speed_mps: null,
          max_speed_mps: null,
          normalized_power: null,
          normalized_speed_mps: null,
          normalized_graded_speed_mps: null,
          elevation_gain_meters: null,
          calories: null,
          polyline: null,
          is_private: true,
          content_visibility: "private",
          started_at: "2026-07-18T10:00:00.000Z",
          finished_at: "2026-07-18T11:00:00.000Z",
          created_at: "2026-07-18T11:01:00.000Z",
          profile_username: "athlete",
          profile_avatar_url: null,
          ingestion_status: null,
          ingestion_last_error_message: null,
        },
      ],
    });

    const [row] = await listFeedActivityRows({ execute } as never, VIEWER_ID, { limit: 20 });

    expect(row).toMatchObject({
      elapsed_ms: 3_600_000,
      active_ms: 3_500_000,
      moving_ms: null,
      started_at: new Date("2026-07-18T10:00:00.000Z"),
    });
  });

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

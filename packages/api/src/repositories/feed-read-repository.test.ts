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
    expect(normalizedSql).toContain("select s.activity_category from activity_segments s");
    expect(normalizedSql).not.toContain("select s.category from activity_segments s");
    expect(normalizedSql).toContain("(a.polyline is not null) as has_route");
    expect(normalizedSql).not.toContain("activity_file_ingestions");
    expect(normalizedSql).not.toContain("last_error_message");
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
          normalized_speed_mps: null,
          elevation_gain_meters: null,
          calories: null,
          has_route: false,
          content_visibility: "private",
          started_at: "2026-07-18T10:00:00.000Z",
          finished_at: "2026-07-18T11:00:00.000Z",
          profile_username: "athlete",
          profile_avatar_url: null,
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
        has_route: false,
        content_visibility: "public",
        profile_username: "athlete",
        profile_avatar_url: null,
      },
      {
        commentCounts: new Map(),
        derivedMap: new Map(),
        likeStats: new Map(),
        viewerId: VIEWER_ID,
      },
    );

    expect(result).toMatchObject({
      title: "Run bike run",
      activityComposition: { kind: "multisport", categories: ["run", "bike", "run"] },
      capabilities: { canEdit: false, canDelete: false, hasRoute: false },
    });
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "elapsed_duration", value: 7_200 }),
        expect.objectContaining({ key: "active_duration", value: 6_600 }),
        expect.objectContaining({ key: "moving_duration", value: 6_400 }),
      ]),
    );
    expect(result).not.toHaveProperty("activity_file_path");
    expect(result).not.toHaveProperty("polyline");
    expect(result).not.toHaveProperty("ingestion");
    expect(result).not.toHaveProperty("segments");
  });

  it("keeps feed items available when legacy profile presentation fields are malformed", () => {
    const result = mapFeedActivity(
      {
        id: "33333333-3333-4333-8333-333333333333",
        profile_id: VIEWER_ID,
        name: "Recovery Run",
        category_composition: ["run"],
        elapsed_ms: 1_800_000,
        active_ms: null,
        moving_ms: null,
        timing_coverage: "unavailable",
        started_at: new Date("2026-07-17T08:00:00.000Z"),
        finished_at: new Date("2026-07-17T08:30:00.000Z"),
        distance_meters: 5_000,
        avg_heart_rate: null,
        max_heart_rate: null,
        avg_power: null,
        avg_cadence: null,
        elevation_gain_meters: null,
        calories: null,
        has_route: false,
        content_visibility: "public",
        profile_username: "   ",
        profile_avatar_url: "/legacy-avatar.png",
      },
      {
        commentCounts: new Map(),
        derivedMap: new Map(),
        likeStats: new Map(),
        viewerId: VIEWER_ID,
      },
    );

    expect(result.owner).toEqual({
      id: VIEWER_ID,
      username: null,
      avatarUrl: null,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const analysisMocks = vi.hoisted(() => ({
  buildActivityDerivedSummaryMap: vi.fn(),
  createActivityAnalysisStore: vi.fn(() => ({ kind: "activity-analysis-store" })),
  loadActivitySegmentsByActivityId: vi.fn(),
}));

vi.mock("../../lib/activity-analysis", () => ({
  buildActivityDerivedSummaryMap: analysisMocks.buildActivityDerivedSummaryMap,
  loadActivitySegmentsByActivityId: analysisMocks.loadActivitySegmentsByActivityId,
}));

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: analysisMocks.createActivityAnalysisStore,
}));

import { feedRouter } from "../feed";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVITY_ID = "33333333-3333-4333-8333-333333333333";
const ACTIVITY_ID_2 = "44444444-4444-4444-8444-444444444444";

type DbPlan = {
  execute?: Array<Array<Record<string, unknown>>>;
  likeStatsRows?: Array<{ entity_id: string; likes_count: number; has_liked: boolean }>;
};

function createDbMock(plan: DbPlan = {}) {
  const executeQueue = [...(plan.execute ?? [])];

  return {
    execute: vi.fn(async () => ({ rows: executeQueue.shift() ?? [] })),
    select: vi.fn((fields?: Record<string, unknown>) => {
      if (fields && "entity_id" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              groupBy: vi.fn(() => Promise.resolve(plan.likeStatsRows ?? [])),
            })),
          })),
        };
      }

      throw new Error(`Unhandled select fields: ${Object.keys(fields ?? {}).join(",")}`);
    }),
  };
}

function createCaller(plan: DbPlan = {}, userId = VIEWER_ID) {
  const db = createDbMock(plan);
  const caller = feedRouter.createCaller({
    db: db as any,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, db };
}

describe("feedRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analysisMocks.buildActivityDerivedSummaryMap.mockResolvedValue(new Map());
    analysisMocks.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
  });

  it("getFeed maps likes, comments, derived summaries, and pagination metadata", async () => {
    const firstStartedAt = new Date("2026-04-03T10:00:00.000Z");
    const secondStartedAt = new Date("2026-04-02T10:00:00.000Z");
    const thirdStartedAt = new Date("2026-04-01T10:00:00.000Z");

    analysisMocks.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([
        [
          ACTIVITY_ID,
          { tss: 82, intensity_factor: 0.91, computed_as_of: "2026-04-03T11:00:00.000Z" },
        ],
      ]),
    );

    const activityRows = [
      {
        id: ACTIVITY_ID,
        profile_id: OWNER_ID,
        name: "Morning Ride",
        category_composition: ["bike"],
        started_at: firstStartedAt,
        finished_at: new Date("2026-04-03T11:00:00.000Z"),
        distance_meters: 32000,
        elapsed_ms: 3_600_000,
        active_ms: 3_600_000,
        moving_ms: 3_500_000,
        timing_coverage: "complete",
        avg_heart_rate: 150,
        max_heart_rate: 178,
        avg_power: 220,
        avg_cadence: 88,
        elevation_gain_meters: "450.25",
        calories: 900,
        polyline: null,
        is_private: false,
        content_visibility: "public",
        created_at: new Date("2026-04-03T11:05:00.000Z"),
        profile_username: "owner",
        profile_avatar_url: "https://example.com/owner.png",
      },
      {
        id: ACTIVITY_ID_2,
        profile_id: VIEWER_ID,
        name: "Lunch Run",
        category_composition: ["run"],
        started_at: secondStartedAt,
        finished_at: new Date("2026-04-02T10:30:00.000Z"),
        distance_meters: 5000,
        elapsed_ms: 1_800_000,
        active_ms: 1_800_000,
        moving_ms: 1_750_000,
        timing_coverage: "complete",
        avg_heart_rate: 145,
        max_heart_rate: 170,
        avg_power: null,
        avg_cadence: 84,
        elevation_gain_meters: 55,
        calories: 420,
        polyline: null,
        is_private: false,
        content_visibility: "public",
        created_at: new Date("2026-04-02T10:35:00.000Z"),
        profile_username: "viewer",
        profile_avatar_url: null,
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        profile_id: OWNER_ID,
        name: "Older Swim",
        category_composition: ["swim"],
        started_at: thirdStartedAt,
        finished_at: new Date("2026-04-01T10:20:00.000Z"),
        distance_meters: 1000,
        elapsed_ms: 1_200_000,
        active_ms: 1_200_000,
        moving_ms: 1_100_000,
        timing_coverage: "complete",
        avg_heart_rate: null,
        max_heart_rate: null,
        avg_power: null,
        avg_cadence: null,
        elevation_gain_meters: null,
        calories: 200,
        polyline: null,
        is_private: false,
        content_visibility: "public",
        created_at: new Date("2026-04-01T10:25:00.000Z"),
        profile_username: "owner",
        profile_avatar_url: "https://example.com/owner.png",
      },
    ];

    const { caller, db } = createCaller({
      execute: [activityRows, [{ entity_id: ACTIVITY_ID, comments_count: 2 }]],
      likeStatsRows: [{ entity_id: ACTIVITY_ID, likes_count: 4, has_liked: true }],
    });

    const result = await caller.getFeed({ limit: 2 });

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(`${secondStartedAt.toISOString()}|${ACTIVITY_ID_2}`);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      name: "Morning Ride",
      type: "bike",
      activity_kind: "single",
      activity_categories: ["bike"],
      started_at: firstStartedAt.toISOString(),
      finished_at: "2026-04-03T11:00:00.000Z",
      distance_meters: 32000,
      elapsed_seconds: 3600,
      duration_seconds: 3600,
      moving_seconds: 3500,
      avg_heart_rate: 150,
      max_heart_rate: 178,
      avg_power: 220,
      avg_cadence: 88,
      elevation_gain_meters: 450.25,
      calories: 900,
      polyline: null,
      likes_count: 4,
      comments_count: 2,
      is_private: false,
      content_visibility: "public",
      created_at: "2026-04-03T11:05:00.000Z",
      profile: {
        id: OWNER_ID,
        username: "owner",
        avatar_url: "https://example.com/owner.png",
      },
      has_liked: true,
      derived: null,
      ingestion: null,
    });
    expect(analysisMocks.buildActivityDerivedSummaryMap).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: VIEWER_ID,
        activities: [
          expect.objectContaining({
            id: ACTIVITY_ID_2,
            profile_id: VIEWER_ID,
          }),
        ],
      }),
    );
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("getFeed uses a stable composite cursor for activities with matching timestamps", async () => {
    const sharedStartedAt = new Date("2026-04-03T10:00:00.000Z");
    const activityRows = [
      {
        id: ACTIVITY_ID_2,
        profile_id: VIEWER_ID,
        name: "Lunch Run",
        category_composition: ["run"],
        started_at: sharedStartedAt,
        finished_at: new Date("2026-04-03T10:30:00.000Z"),
        distance_meters: 5000,
        elapsed_ms: 1_800_000,
        active_ms: 1_800_000,
        moving_ms: 1_750_000,
        timing_coverage: "complete",
        avg_heart_rate: 145,
        max_heart_rate: 170,
        avg_power: null,
        avg_cadence: 84,
        elevation_gain_meters: 55,
        calories: 420,
        polyline: null,
        is_private: false,
        content_visibility: "public",
        created_at: new Date("2026-04-03T10:35:00.000Z"),
        profile_username: "viewer",
        profile_avatar_url: null,
      },
      {
        id: ACTIVITY_ID,
        profile_id: OWNER_ID,
        name: "Morning Ride",
        category_composition: ["bike"],
        started_at: sharedStartedAt,
        finished_at: new Date("2026-04-03T11:00:00.000Z"),
        distance_meters: 32000,
        elapsed_ms: 3_600_000,
        active_ms: 3_600_000,
        moving_ms: 3_500_000,
        timing_coverage: "complete",
        avg_heart_rate: 150,
        max_heart_rate: 178,
        avg_power: 220,
        avg_cadence: 88,
        elevation_gain_meters: 450,
        calories: 900,
        polyline: null,
        is_private: false,
        content_visibility: "public",
        created_at: new Date("2026-04-03T11:05:00.000Z"),
        profile_username: "owner",
        profile_avatar_url: "https://example.com/owner.png",
      },
    ];

    const { caller } = createCaller({ execute: [activityRows, []] });

    const result = await caller.getFeed({ limit: 1 });

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(`${sharedStartedAt.toISOString()}|${ACTIVITY_ID_2}`);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(ACTIVITY_ID_2);
  });

  it("getFeed rejects malformed SQL activity rows", async () => {
    const { caller } = createCaller({
      execute: [
        [
          {
            id: "not-a-uuid",
            profile_id: OWNER_ID,
            name: "Broken Ride",
            category_composition: ["bike"],
            started_at: new Date("2026-04-03T10:00:00.000Z"),
            finished_at: new Date("2026-04-03T11:00:00.000Z"),
            distance_meters: 32000,
            elapsed_ms: 3_600_000,
            active_ms: 3_600_000,
            moving_ms: 3_500_000,
            timing_coverage: "complete",
            avg_heart_rate: 150,
            max_heart_rate: 178,
            avg_power: 220,
            avg_cadence: 88,
            elevation_gain_meters: "450.25",
            calories: 900,
            polyline: null,
            is_private: false,
            content_visibility: "public",
            created_at: new Date("2026-04-03T11:05:00.000Z"),
            profile_username: "owner",
            profile_avatar_url: "https://example.com/owner.png",
          },
        ],
      ],
    });

    await expect(caller.getFeed({ limit: 1 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch feed",
    });
  });

  it("getFeed rejects malformed derived summaries at the DTO boundary", async () => {
    analysisMocks.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([[ACTIVITY_ID, { tss: 82, intensity_factor: 0.91, computed_as_of: 123 }]]),
    );

    const { caller } = createCaller({
      execute: [
        [
          {
            id: ACTIVITY_ID,
            profile_id: VIEWER_ID,
            name: "Morning Ride",
            category_composition: ["bike"],
            started_at: new Date("2026-04-03T10:00:00.000Z"),
            finished_at: new Date("2026-04-03T11:00:00.000Z"),
            distance_meters: 32000,
            elapsed_ms: 3_600_000,
            active_ms: 3_600_000,
            moving_ms: 3_500_000,
            timing_coverage: "complete",
            avg_heart_rate: 150,
            max_heart_rate: 178,
            avg_power: 220,
            avg_cadence: 88,
            elevation_gain_meters: 450,
            calories: 900,
            polyline: null,
            is_private: false,
            content_visibility: "public",
            created_at: new Date("2026-04-03T11:05:00.000Z"),
            profile_username: "viewer",
            profile_avatar_url: "https://example.com/owner.png",
          },
        ],
        [],
      ],
      likeStatsRows: [{ entity_id: ACTIVITY_ID, likes_count: 4, has_liked: true }],
    });

    await expect(caller.getFeed({ limit: 1 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch feed",
    });
  });
});

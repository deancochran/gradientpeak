import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analysisMocks = vi.hoisted(() => ({
  buildActivityDerivedSummaryMap: vi.fn(),
  createActivityAnalysisStore: vi.fn(() => ({ kind: "activity-analysis-store" })),
}));

vi.mock("../../lib/activity-analysis", () => ({
  buildActivityDerivedSummaryMap: analysisMocks.buildActivityDerivedSummaryMap,
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
  feedLikeRows?: Array<{ entity_id: string }>;
  activityLikeRows?: Array<{ id: string }>;
};

function createDbMock(plan: DbPlan = {}) {
  const executeQueue = [...(plan.execute ?? [])];

  return {
    execute: vi.fn(async () => ({ rows: executeQueue.shift() ?? [] })),
    select: vi.fn((fields?: Record<string, unknown>) => {
      if (fields && "entity_id" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(plan.feedLikeRows ?? [])),
          })),
        };
      }

      if (fields && "id" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve(plan.activityLikeRows ?? [])),
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
        type: "ride",
        started_at: firstStartedAt,
        finished_at: new Date("2026-04-03T11:00:00.000Z"),
        distance_meters: 32000,
        duration_seconds: 3600,
        moving_seconds: 3500,
        avg_heart_rate: 150,
        max_heart_rate: 178,
        avg_power: 220,
        avg_cadence: 88,
        elevation_gain_meters: 450,
        calories: 900,
        polyline: null,
        likes_count: 4,
        is_private: false,
        created_at: new Date("2026-04-03T11:05:00.000Z"),
        profile_username: "owner",
        profile_avatar_url: "https://example.com/owner.png",
      },
      {
        id: ACTIVITY_ID_2,
        profile_id: VIEWER_ID,
        name: "Lunch Run",
        type: "run",
        started_at: secondStartedAt,
        finished_at: new Date("2026-04-02T10:30:00.000Z"),
        distance_meters: 5000,
        duration_seconds: 1800,
        moving_seconds: 1750,
        avg_heart_rate: 145,
        max_heart_rate: 170,
        avg_power: null,
        avg_cadence: 84,
        elevation_gain_meters: 55,
        calories: 420,
        polyline: null,
        likes_count: 1,
        is_private: false,
        created_at: new Date("2026-04-02T10:35:00.000Z"),
        profile_username: "viewer",
        profile_avatar_url: null,
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        profile_id: OWNER_ID,
        name: "Older Swim",
        type: "swim",
        started_at: thirdStartedAt,
        finished_at: new Date("2026-04-01T10:20:00.000Z"),
        distance_meters: 1000,
        duration_seconds: 1200,
        moving_seconds: 1100,
        avg_heart_rate: null,
        max_heart_rate: null,
        avg_power: null,
        avg_cadence: null,
        elevation_gain_meters: null,
        calories: 200,
        polyline: null,
        likes_count: 0,
        is_private: false,
        created_at: new Date("2026-04-01T10:25:00.000Z"),
        profile_username: "owner",
        profile_avatar_url: "https://example.com/owner.png",
      },
    ];

    const { caller } = createCaller({
      execute: [activityRows, [{ entity_id: ACTIVITY_ID, comments_count: 2 }]],
      feedLikeRows: [{ entity_id: ACTIVITY_ID }],
    });

    const result = await caller.getFeed({ limit: 2 });

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(secondStartedAt.toISOString());
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      name: "Morning Ride",
      type: "ride",
      started_at: firstStartedAt.toISOString(),
      finished_at: "2026-04-03T11:00:00.000Z",
      distance_meters: 32000,
      duration_seconds: 3600,
      moving_seconds: 3500,
      avg_heart_rate: 150,
      max_heart_rate: 178,
      avg_power: 220,
      avg_cadence: 88,
      elevation_gain_meters: 450,
      calories: 900,
      polyline: null,
      likes_count: 4,
      comments_count: 2,
      is_private: false,
      created_at: "2026-04-03T11:05:00.000Z",
      profile: {
        id: OWNER_ID,
        username: "owner",
        avatar_url: "https://example.com/owner.png",
      },
      has_liked: true,
      derived: {
        tss: 82,
        intensity_factor: 0.91,
        computed_as_of: "2026-04-03T11:00:00.000Z",
      },
    });
    expect(analysisMocks.buildActivityDerivedSummaryMap).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: VIEWER_ID,
        activities: activityRows,
      }),
    );
  });

  it("getActivity returns detail data including likes and ordered comments", async () => {
    const startedAt = new Date("2026-04-03T10:00:00.000Z");

    const { caller } = createCaller({
      execute: [
        [
          {
            id: ACTIVITY_ID,
            profile_id: OWNER_ID,
            name: "Morning Ride",
            type: "ride",
            notes: "Strong effort",
            started_at: startedAt,
            finished_at: new Date("2026-04-03T11:00:00.000Z"),
            distance_meters: 32000,
            duration_seconds: 3600,
            moving_seconds: 3500,
            avg_heart_rate: 150,
            max_heart_rate: 178,
            avg_power: 220,
            max_power: 510,
            avg_cadence: 88,
            max_cadence: 105,
            normalized_power: 240,
            elevation_gain_meters: 450,
            elevation_loss_meters: 445,
            calories: 900,
            polyline: null,
            map_bounds: null,
            likes_count: 4,
            is_private: false,
            created_at: new Date("2026-04-03T11:05:00.000Z"),
            profile_username: "owner",
            profile_avatar_url: "https://example.com/owner.png",
            viewer_follows_owner: false,
          },
        ],
        [
          {
            id: "66666666-6666-4666-8666-666666666666",
            content: "Nice work!",
            created_at: new Date("2026-04-03T12:00:00.000Z"),
            profile_id: VIEWER_ID,
            profile_username: "viewer",
            profile_avatar_url: null,
          },
        ],
      ],
      activityLikeRows: [{ id: "77777777-7777-4777-8777-777777777777" }],
    });

    const result = await caller.getActivity({ activityId: ACTIVITY_ID });

    expect(result).toEqual({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      name: "Morning Ride",
      type: "ride",
      notes: "Strong effort",
      started_at: startedAt.toISOString(),
      finished_at: "2026-04-03T11:00:00.000Z",
      distance_meters: 32000,
      duration_seconds: 3600,
      moving_seconds: 3500,
      avg_heart_rate: 150,
      max_heart_rate: 178,
      avg_power: 220,
      max_power: 510,
      avg_cadence: 88,
      max_cadence: 105,
      normalized_power: 240,
      elevation_gain_meters: 450,
      elevation_loss_meters: 445,
      calories: 900,
      polyline: null,
      map_bounds: null,
      likes_count: 4,
      is_private: false,
      created_at: "2026-04-03T11:05:00.000Z",
      profile: {
        id: OWNER_ID,
        username: "owner",
        avatar_url: "https://example.com/owner.png",
      },
      has_liked: true,
      comments_count: 1,
      comments: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          content: "Nice work!",
          created_at: "2026-04-03T12:00:00.000Z",
          profile: {
            id: VIEWER_ID,
            username: "viewer",
            avatar_url: null,
          },
        },
      ],
    });
  });

  it("getActivity rejects private activities for non-followers", async () => {
    const { caller } = createCaller({
      execute: [
        [
          {
            id: ACTIVITY_ID,
            profile_id: OWNER_ID,
            name: "Private Ride",
            type: "ride",
            notes: null,
            started_at: new Date("2026-04-03T10:00:00.000Z"),
            finished_at: new Date("2026-04-03T11:00:00.000Z"),
            distance_meters: 32000,
            duration_seconds: 3600,
            moving_seconds: 3500,
            avg_heart_rate: null,
            max_heart_rate: null,
            avg_power: null,
            max_power: null,
            avg_cadence: null,
            max_cadence: null,
            normalized_power: null,
            elevation_gain_meters: null,
            elevation_loss_meters: null,
            calories: null,
            polyline: null,
            map_bounds: null,
            likes_count: 0,
            is_private: true,
            created_at: new Date("2026-04-03T11:05:00.000Z"),
            profile_username: "owner",
            profile_avatar_url: null,
            viewer_follows_owner: false,
          },
        ],
      ],
    });

    await expect(caller.getActivity({ activityId: ACTIVITY_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You don't have permission to view this activity",
    });
  });
});

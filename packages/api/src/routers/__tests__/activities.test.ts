import { beforeEach, describe, expect, it, vi } from "vitest";

const mockActivityAnalysis = vi.hoisted(() => ({
  analyzeActivityDerivedMetrics: vi.fn(),
  buildActivityDerivedSummaryMap: vi.fn(),
  createActivityAnalysisStore: vi.fn(() => ({ kind: "activity-analysis-store" })),
  mapActivityToDerivedResponse: vi.fn(({ activity, has_liked, derived }) => ({
    activity,
    has_liked,
    derived,
  })),
  mapActivityToListDerivedResponse: vi.fn(({ activity, has_liked, derived }) => ({
    ...activity,
    has_liked,
    derived,
  })),
  resolveActivityContextAsOf: vi.fn(),
}));

vi.mock("@repo/core", async () => {
  const actual = await vi.importActual<typeof import("@repo/core")>("@repo/core");

  return {
    ...actual,
    analyzeActivityDerivedMetrics: mockActivityAnalysis.analyzeActivityDerivedMetrics,
  };
});

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: mockActivityAnalysis.createActivityAnalysisStore,
}));

vi.mock("../../lib/activity-analysis", () => ({
  buildActivityDerivedSummaryMap: mockActivityAnalysis.buildActivityDerivedSummaryMap,
  mapActivityToDerivedResponse: mockActivityAnalysis.mapActivityToDerivedResponse,
  mapActivityToListDerivedResponse: mockActivityAnalysis.mapActivityToListDerivedResponse,
  resolveActivityContextAsOf: mockActivityAnalysis.resolveActivityContextAsOf,
}));

import { activitiesRouter } from "../activities";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVITY_ID = "33333333-3333-4333-8333-333333333333";
const ACTIVITY_ID_2 = "44444444-4444-4444-8444-444444444444";
const ACTIVITY_ID_3 = "55555555-5555-4555-8555-555555555555";
const EVENT_ID = "66666666-6666-4666-8666-666666666666";
const PLAN_ID = "77777777-7777-4777-8777-777777777777";

function createCaller(db: any, userId = OWNER_ID) {
  return activitiesRouter.createCaller({
    db,
    session: {
      user: {
        id: userId,
      },
    },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

function createSequencedFn(values: unknown[]) {
  const fn = vi.fn();

  for (const value of values) {
    fn.mockResolvedValueOnce(value);
  }

  return fn;
}

function createDbMock(options: {
  activityRows?: any[];
  likeRows?: Array<{ entity_id: string }>;
  totalRows?: Array<{ total: number }>;
  joinedRows?: any[];
  queryActivitiesFindFirst?: any[];
  queryEventsFindFirst?: any[];
  queryLikesFindFirst?: any[];
  executeRows?: Array<{ id: string }>;
  updatedRows?: any[];
}) {
  const deleteWhere = vi.fn(() => Promise.resolve());

  return {
    select: vi.fn((fields?: Record<string, unknown>) => {
      if (fields && "total" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(options.totalRows ?? [{ total: 0 }])),
          })),
        };
      }

      if (fields && "entity_id" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(options.likeRows ?? [])),
          })),
        };
      }

      if (fields && "activity" in fields) {
        return {
          from: vi.fn(() => ({
            leftJoin: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve(options.joinedRows ?? [])),
              })),
            })),
          })),
        };
      }

      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => Promise.resolve(options.activityRows ?? [])),
          })),
        })),
      };
    }),
    execute: vi.fn(async () => ({ rows: options.executeRows ?? [] })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(options.updatedRows ?? [])),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: deleteWhere,
    })),
    query: {
      activities: {
        findFirst: createSequencedFn(options.queryActivitiesFindFirst ?? []),
      },
      events: {
        findFirst: createSequencedFn(options.queryEventsFindFirst ?? []),
      },
      likes: {
        findFirst: createSequencedFn(options.queryLikesFindFirst ?? []),
      },
    },
    __spies: {
      deleteWhere,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockActivityAnalysis.buildActivityDerivedSummaryMap.mockResolvedValue(new Map());
  mockActivityAnalysis.resolveActivityContextAsOf.mockResolvedValue({});
  mockActivityAnalysis.analyzeActivityDerivedMetrics.mockReturnValue({
    tss: 50,
    intensity_factor: 0.8,
  });
});

describe("activitiesRouter", () => {
  it("lists owned activities with like and derived summaries", async () => {
    const startedAt = new Date("2026-01-10T08:00:00.000Z");
    const finishedAt = new Date("2026-01-10T08:45:00.000Z");
    const rows = [
      {
        id: ACTIVITY_ID,
        profile_id: OWNER_ID,
        name: "Morning Run",
        type: "run",
        started_at: startedAt,
        finished_at: finishedAt,
      },
    ];
    const derived = { tss: 72 };
    const db = createDbMock({
      activityRows: rows,
      likeRows: [{ entity_id: ACTIVITY_ID }],
    });

    mockActivityAnalysis.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([[ACTIVITY_ID, derived]]),
    );

    const caller = createCaller(db);
    const result = await caller.list({
      date_from: "2026-01-01T00:00:00.000Z",
      date_to: "2026-01-31T23:59:59.999Z",
    });

    expect(result).toEqual([
      {
        ...rows[0],
        has_liked: true,
        derived,
      },
    ]);
    expect(mockActivityAnalysis.buildActivityDerivedSummaryMap).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: OWNER_ID,
        activities: rows,
      }),
    );
  });

  it("sorts paginated results by derived tss before slicing", async () => {
    const rows = [
      {
        id: ACTIVITY_ID,
        profile_id: OWNER_ID,
        name: "Easy Run",
        type: "run",
        started_at: new Date("2026-01-12T08:00:00.000Z"),
        finished_at: new Date("2026-01-12T08:30:00.000Z"),
      },
      {
        id: ACTIVITY_ID_2,
        profile_id: OWNER_ID,
        name: "Big Ride",
        type: "bike",
        started_at: new Date("2026-01-11T08:00:00.000Z"),
        finished_at: new Date("2026-01-11T10:00:00.000Z"),
      },
      {
        id: ACTIVITY_ID_3,
        profile_id: OWNER_ID,
        name: "Tempo Run",
        type: "run",
        started_at: new Date("2026-01-10T08:00:00.000Z"),
        finished_at: new Date("2026-01-10T08:50:00.000Z"),
      },
    ];
    const db = createDbMock({
      activityRows: rows,
      totalRows: [{ total: 3 }],
    });

    mockActivityAnalysis.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([
        [ACTIVITY_ID, { tss: 20 }],
        [ACTIVITY_ID_2, { tss: 95 }],
        [ACTIVITY_ID_3, { tss: 60 }],
      ]),
    );

    const caller = createCaller(db);
    const result = await caller.listPaginated({
      limit: 2,
      offset: 1,
      sort_by: "tss",
      sort_order: "desc",
    });

    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(false);
    expect(result.items.map((item: any) => item.id)).toEqual([ACTIVITY_ID_3, ACTIVITY_ID]);
  });

  it("creates an activity linked to a planned-activity event", async () => {
    const createdActivity = {
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      activity_plan_id: PLAN_ID,
      name: "Long Ride",
    };
    const db = createDbMock({
      queryEventsFindFirst: [{ activity_plan_id: PLAN_ID }],
      executeRows: [{ id: ACTIVITY_ID }],
      queryActivitiesFindFirst: [createdActivity],
    });

    const caller = createCaller(db);
    const result = await caller.create({
      profile_id: OWNER_ID,
      eventId: EVENT_ID,
      name: "Long Ride",
      notes: "Outdoor endurance",
      type: "bike",
      startedAt: "2026-01-15T09:00:00.000Z",
      finishedAt: "2026-01-15T11:00:00.000Z",
      durationSeconds: 7200,
      movingSeconds: 7100,
      distanceMeters: 50000,
      metrics: {},
    });

    expect(result).toEqual(createdActivity);
    expect(db.query.events.findFirst).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("returns a derived activity response for an accessible activity", async () => {
    const finishedAt = new Date("2026-01-09T08:45:00.000Z");
    const startedAt = new Date("2026-01-09T08:00:00.000Z");
    const activity = {
      id: ACTIVITY_ID,
      profile_id: OTHER_ID,
      activity_plan_id: PLAN_ID,
      name: "Shared Run",
      type: "run",
      started_at: startedAt,
      finished_at: finishedAt,
      duration_seconds: 2700,
      moving_seconds: 2650,
      distance_meters: 9000,
      avg_heart_rate: 150,
      max_heart_rate: 175,
      avg_power: null,
      max_power: null,
      avg_speed_mps: 3.3,
      max_speed_mps: 4.8,
      normalized_power: null,
      normalized_speed_mps: null,
      normalized_graded_speed_mps: null,
    };
    const activityPlan = {
      id: PLAN_ID,
      idx: null,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-02T00:00:00.000Z"),
      name: "Planned Run",
    };
    const derived = { tss: 88, intensity_factor: 0.91 };
    const db = createDbMock({
      queryActivitiesFindFirst: [
        {
          profile_id: OTHER_ID,
          is_private: false,
        },
      ],
      joinedRows: [{ activity, activityPlan }],
      queryLikesFindFirst: [{ id: "like-1" }],
    });

    mockActivityAnalysis.resolveActivityContextAsOf.mockResolvedValue({ baseline: "context" });
    mockActivityAnalysis.analyzeActivityDerivedMetrics.mockReturnValue(derived);

    const caller = createCaller(db, OWNER_ID);
    const result = await caller.getById({ id: ACTIVITY_ID });

    expect(result).toEqual({
      activity: {
        ...activity,
        activity_plans: {
          ...activityPlan,
          idx: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
      },
      has_liked: true,
      derived,
    });
    expect(mockActivityAnalysis.resolveActivityContextAsOf).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: OTHER_ID,
        activityTimestamp: finishedAt,
      }),
    );
  });

  it("updates an owned activity", async () => {
    const updated = {
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      name: "Renamed Run",
      notes: "Felt strong",
      is_private: true,
    };
    const db = createDbMock({
      updatedRows: [updated],
    });

    const caller = createCaller(db);
    const result = await caller.update({
      id: ACTIVITY_ID,
      name: "Renamed Run",
      notes: "Felt strong",
      is_private: true,
    });

    expect(result).toEqual(updated);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("deletes an owned activity", async () => {
    const db = createDbMock({
      queryActivitiesFindFirst: [
        {
          id: ACTIVITY_ID,
          profile_id: OWNER_ID,
        },
      ],
    });

    const caller = createCaller(db);
    const result = await caller.delete({ id: ACTIVITY_ID });

    expect(result).toEqual({ success: true, deletedActivityId: ACTIVITY_ID });
    expect(db.__spies.deleteWhere).toHaveBeenCalledTimes(1);
  });
});

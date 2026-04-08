import { activities, activityEfforts, profileMetrics, profiles } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

const analysisMocks = vi.hoisted(() => ({
  buildActivityDerivedSummaryMap: vi.fn(),
  createActivityAnalysisStore: vi.fn(),
}));

vi.mock("../../lib/activity-analysis", () => ({
  buildActivityDerivedSummaryMap: analysisMocks.buildActivityDerivedSummaryMap,
}));

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: analysisMocks.createActivityAnalysisStore,
}));

import { profilesRouter } from "../profiles";

type TableName = "activities" | "activityEfforts" | "profileMetrics" | "profiles";

type SelectPlan = Partial<Record<TableName, Array<unknown[]>>>;

type DbPlan = {
  select?: SelectPlan;
  execute?: Array<Array<Record<string, unknown>>>;
};

const SESSION_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

function getTableName(table: unknown): TableName {
  if (table === profiles) return "profiles";
  if (table === profileMetrics) return "profileMetrics";
  if (table === activityEfforts) return "activityEfforts";
  if (table === activities) return "activities";
  throw new Error(`Unhandled table: ${String(table)}`);
}

function createProfileRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SESSION_USER_ID,
    idx: 1,
    created_at: new Date("2026-04-01T10:00:00.000Z"),
    updated_at: new Date("2026-04-02T12:00:00.000Z"),
    email: "athlete@example.com",
    full_name: "Athlete Example",
    avatar_url: "https://example.com/avatar.png",
    bio: "Climber",
    dob: new Date("1990-01-01T00:00:00.000Z"),
    gender: "male",
    onboarded: true,
    is_public: true,
    username: "athlete",
    preferred_units: "metric",
    language: "en",
    ...overrides,
  };
}

function createDbMock(plan: DbPlan = {}) {
  const selectQueues = {
    profiles: [...(plan.select?.profiles ?? [])],
    profileMetrics: [...(plan.select?.profileMetrics ?? [])],
    activityEfforts: [...(plan.select?.activityEfforts ?? [])],
    activities: [...(plan.select?.activities ?? [])],
  } satisfies Record<TableName, Array<unknown[]>>;
  const executeQueue = [...(plan.execute ?? [])];

  const calls = {
    selects: [] as Array<{ table: TableName; limitArgs: unknown[]; offsetArgs: unknown[] }>,
    updates: [] as Array<{ table: TableName; values: Record<string, unknown> }>,
    inserts: [] as Array<{ table: TableName; values: Record<string, unknown> }>,
    deletes: [] as TableName[],
    executes: [] as unknown[],
  };

  return {
    calls,
    db: {
      select: () => {
        let tableName: TableName | null = null;
        const limitArgs: unknown[] = [];
        const offsetArgs: unknown[] = [];

        const builder: any = {
          from: (table: unknown) => {
            tableName = getTableName(table);
            return builder;
          },
          where: () => builder,
          orderBy: () => builder,
          limit: (...args: unknown[]) => {
            limitArgs.push(...args);
            return builder;
          },
          offset: (...args: unknown[]) => {
            offsetArgs.push(...args);
            return builder;
          },
          then: (onFulfilled: (value: unknown[]) => unknown) => {
            if (!tableName) {
              throw new Error("Select called without table");
            }

            calls.selects.push({
              table: tableName,
              limitArgs: [...limitArgs],
              offsetArgs: [...offsetArgs],
            });
            const rows = selectQueues[tableName].shift() ?? [];
            return Promise.resolve(rows).then(onFulfilled);
          },
        };

        return builder;
      },
      update: (table: unknown) => {
        const tableName = getTableName(table);
        return {
          set: (values: Record<string, unknown>) => ({
            where: () => {
              calls.updates.push({ table: tableName, values });
              return Promise.resolve();
            },
          }),
        };
      },
      insert: (table: unknown) => {
        const tableName = getTableName(table);
        return {
          values: (values: Record<string, unknown>) => {
            calls.inserts.push({ table: tableName, values });
            return Promise.resolve();
          },
        };
      },
      delete: (table: unknown) => {
        const tableName = getTableName(table);
        return {
          where: () => {
            calls.deletes.push(tableName);
            return Promise.resolve();
          },
        };
      },
      execute: async (query: unknown) => {
        calls.executes.push(query);
        return { rows: executeQueue.shift() ?? [] };
      },
    },
  };
}

function createCaller(plan: DbPlan = {}) {
  const { db, calls } = createDbMock(plan);
  const caller = profilesRouter.createCaller({
    db: db as any,
    session: { user: { id: SESSION_USER_ID } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, calls };
}

describe("profilesRouter", () => {
  it("get returns the signed-in profile including email/full_name and derived performance", async () => {
    const { caller } = createCaller({
      select: {
        profiles: [[createProfileRow()]],
        profileMetrics: [[{ value: "70.4" }], [{ value: "176" }]],
        activityEfforts: [[{ value: 300 }], []],
      },
    });

    const result = await caller.get();

    expect(result.email).toBe("athlete@example.com");
    expect(result.full_name).toBe("Athlete Example");
    expect(result.weight_kg).toBe(70.4);
    expect(result.threshold_hr).toBe(176);
    expect(result.ftp).toBe(285);
    expect(result.created_at).toBe("2026-04-01T10:00:00.000Z");
  });

  it("getPublicById hides private fields for non-followers while keeping follow metadata", async () => {
    const { caller } = createCaller({
      select: {
        profiles: [[createProfileRow({ id: OTHER_USER_ID, bio: "Private bio", is_public: false })]],
      },
      execute: [[{ status: "pending" }], [{ value: 7 }], [{ value: 3 }]],
    });

    const result = await caller.getPublicById({ id: OTHER_USER_ID });

    expect(result.id).toBe(OTHER_USER_ID);
    expect(result.follow_status).toBe("pending");
    expect(result.followers_count).toBe(7);
    expect(result.following_count).toBe(3);
    expect(result.bio).toBeNull();
    expect(result.preferred_units).toBeNull();
    expect(result.language).toBeNull();
  });

  it("getPublicById rejects unexpected input keys", async () => {
    const { caller } = createCaller();

    await expect(caller.getPublicById({ id: OTHER_USER_ID, extra: true } as any)).rejects.toMatchObject(
      { code: "BAD_REQUEST" },
    );
  });

  it("update persists profile fields plus legacy fields and returns the refreshed profile", async () => {
    const { caller, calls } = createCaller({
      select: {
        profiles: [[createProfileRow({ bio: "Updated bio", username: "updated_athlete" })]],
        profileMetrics: [[{ value: "68.2" }], [{ value: "182" }]],
        activityEfforts: [[{ value: 320 }], []],
      },
    });

    const result = await caller.update({
      bio: "Updated bio",
      avatar_url: null,
      is_public: false,
      dob: "1991-02-03T00:00:00.000Z",
      username: "updated_athlete",
      language: "fr",
      preferred_units: "imperial",
      weight_kg: 68.2,
      threshold_hr: 182,
      ftp: 304,
    });

    expect(result.username).toBe("updated_athlete");
    expect(result.bio).toBe("Updated bio");
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0]).toMatchObject({
      table: "profiles",
      values: {
        avatar_url: null,
        bio: "Updated bio",
        is_public: false,
      },
    });
    expect(calls.updates[0]?.values.dob).toBeInstanceOf(Date);
    expect(calls.inserts.map((entry) => entry.table)).toEqual([
      "profileMetrics",
      "profileMetrics",
      "activityEfforts",
    ]);
    expect(calls.executes).toHaveLength(1);
  });

  it("list returns serialized rows and respects limit/offset", async () => {
    const { caller, calls } = createCaller({
      select: {
        profiles: [[createProfileRow({ id: OTHER_USER_ID, username: "other-athlete", dob: null })]],
      },
    });

    const result = await caller.list({ username: "other", limit: 5, offset: 10 });

    expect(result).toEqual([
      expect.objectContaining({
        id: OTHER_USER_ID,
        username: "other-athlete",
        dob: null,
        email: "athlete@example.com",
      }),
    ]);
    expect(calls.selects).toContainEqual({ table: "profiles", limitArgs: [5], offsetArgs: [10] });
  });

  it("getStats aggregates totals and derived TSS for the requested period", async () => {
    analysisMocks.createActivityAnalysisStore.mockReturnValue({ kind: "store" });
    analysisMocks.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([
        ["activity-1", { tss: 45 }],
        ["activity-2", { tss: 55 }],
      ]),
    );

    const { caller } = createCaller({
      select: {
        activities: [
          [
            { id: "activity-1", duration_seconds: 3600, distance_meters: 12000 },
            { id: "activity-2", duration_seconds: 1800, distance_meters: 8000 },
          ],
        ],
      },
    });

    const result = await caller.getStats({ period: 14 });

    expect(result).toEqual({
      totalActivities: 2,
      totalDuration: 5400,
      totalDistance: 20000,
      totalTSS: 100,
      avgDuration: 2700,
      period: 14,
    });
    expect(analysisMocks.buildActivityDerivedSummaryMap).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: SESSION_USER_ID, activities: expect.any(Array) }),
    );
  });

  it("getZones calculates heart-rate, power, and pace thresholds from current metrics", async () => {
    const { caller } = createCaller({
      select: {
        profileMetrics: [[{ value: "71" }], [{ value: "170" }]],
        activityEfforts: [[{ value: 310 }], [], [{ value: 4.5 }]],
      },
    });

    const result = await caller.getZones();

    expect(result.profile).toEqual({
      threshold_hr: 170,
      ftp: 295,
      weight_kg: 71,
      threshold_pace: 247,
    });
    expect(result.heartRateZones?.zone2).toEqual({ min: 128, max: 148 });
    expect(result.powerZones?.zone4).toEqual({ min: 266, max: 310 });
  });

  it("updateZones replaces threshold values and returns the refreshed profile", async () => {
    const { caller, calls } = createCaller({
      select: {
        profiles: [[createProfileRow()]],
        profileMetrics: [[{ value: "69.5" }], [{ value: "178" }]],
        activityEfforts: [[{ value: 315.79 }], []],
      },
    });

    const result = await caller.updateZones({ threshold_hr: 178, ftp: 300 });

    expect(result.threshold_hr).toBe(178);
    expect(result.ftp).toBe(300);
    expect(calls.deletes).toEqual(["activityEfforts"]);
    expect(calls.inserts.map((entry) => entry.table)).toEqual([
      "profileMetrics",
      "activityEfforts",
    ]);
  });

  it("get maps a missing profile to NOT_FOUND", async () => {
    const { caller } = createCaller({
      select: {
        profiles: [[]],
        profileMetrics: [[], []],
        activityEfforts: [[], []],
      },
    });

    await expect(caller.get()).rejects.toMatchObject({ code: "NOT_FOUND" } as Partial<TRPCError>);
  });
});

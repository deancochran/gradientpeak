import { activities, activityEfforts, profileMetrics, profiles } from "@repo/db";
import { describe, expect, it, vi } from "vitest";

const analysisMocks = vi.hoisted(() => ({
  buildActivitySegmentDerivedSummaries: vi.fn(),
  createActivityAnalysisStore: vi.fn(),
  loadActivitySegmentsByActivityId: vi.fn(),
}));

vi.mock("../../lib/activity-analysis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/activity-analysis")>();
  return {
    ...actual,
    buildActivitySegmentDerivedSummaries: analysisMocks.buildActivitySegmentDerivedSummaries,
    loadActivitySegmentsByActivityId: analysisMocks.loadActivitySegmentsByActivityId,
  };
});

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: analysisMocks.createActivityAnalysisStore,
}));

import { profilesRouter } from "../profiles";

type TableName = "activities" | "activityEfforts" | "profileMetrics" | "profiles";

type SelectPlan = Partial<Record<TableName, Array<unknown[]>>>;

type DbPlan = {
  select?: SelectPlan;
  execute?: Array<Array<Record<string, unknown>>>;
  transactionError?: unknown;
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
    created_at: new Date("2026-04-01T10:00:00.000Z"),
    updated_at: new Date("2026-04-02T12:00:00.000Z"),
    email: "athlete@example.com",
    full_name: "Athlete Example",
    avatar_url: "https://example.com/avatar.png",
    cover_url: "https://example.com/cover.png",
    bio: "Climber",
    dob: new Date("1990-01-01T00:00:00.000Z"),
    gender: "male",
    onboarded: true,
    is_public: true,
    username: "athlete",
    preferred_units: "metric",
    planning_timezone: "America/Los_Angeles",
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
    transactions: 0,
  };

  const db = {
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
            return {
              returning: () => Promise.resolve([{ id: SESSION_USER_ID }]),
            };
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
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      calls.transactions += 1;
      if (plan.transactionError) throw plan.transactionError;
      return callback(db);
    },
  };

  return {
    calls,
    db,
  };
}

function createCaller(plan: DbPlan = {}) {
  const { db, calls } = createDbMock(plan);
  const caller = profilesRouter.createCaller({
    db: db as any,
    session: { user: { id: SESSION_USER_ID, email: "athlete@example.com" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, calls };
}

describe("profilesRouter", () => {
  it("get returns identity fields without exposing legacy manual thresholds", async () => {
    const { caller } = createCaller({
      select: {
        profiles: [[createProfileRow()], [createProfileRow()]],
        profileMetrics: [[{ value: "70.4" }], [{ value: "176" }], []],
        activityEfforts: [[{ value: 300, recorded_at: new Date() }], []],
      },
    });

    const result = await caller.get();

    expect(result.email).toBe("athlete@example.com");
    expect(result.full_name).toBe("Athlete Example");
    expect(result.weight_kg).toBe(70.4);
    expect(result.threshold_hr).toBeNull();
    expect(result.ftp).toBeNull();
    expect(result.created_at).toBe("2026-04-01T10:00:00.000Z");
    expect(result.planning_timezone).toBe("America/Los_Angeles");
  });

  it("does not expose direct profile metrics as canonical FTP", async () => {
    const now = new Date();
    const { caller } = createCaller({
      select: {
        profiles: [[createProfileRow()], [createProfileRow()]],
        profileMetrics: [
          [{ value: "70.4" }],
          [{ value: "176" }],
          [
            { value: 250, recorded_at: new Date(now.getTime() - 60_000), source: "provider" },
            { value: 320, recorded_at: now, source: "derived" },
          ],
        ],
        activityEfforts: [[], []],
      },
    });

    const result = await caller.get();

    expect(result.ftp).toBeNull();
  });

  it("get provisions a default profile when the auth user exists without a profile row", async () => {
    const { caller, calls } = createCaller({
      select: {
        profiles: [
          [],
          [createProfileRow({ onboarded: false, username: null, full_name: null })],
          [createProfileRow({ onboarded: false, username: null, full_name: null })],
        ],
        profileMetrics: [[], []],
        activityEfforts: [[], []],
      },
    });

    const result = await caller.get();

    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0]).toMatchObject({
      table: "profiles",
      values: {
        id: SESSION_USER_ID,
        email: "athlete@example.com",
        onboarded: false,
        is_public: true,
      },
    });
    expect(result.id).toBe(SESSION_USER_ID);
    expect(result.email).toBe("athlete@example.com");
    expect(result.onboarded).toBe(false);
  });

  it("getPublicById hides private fields and counts for non-followers", async () => {
    const { caller } = createCaller({
      select: {
        profiles: [[createProfileRow({ id: OTHER_USER_ID, bio: "Private bio", is_public: false })]],
      },
      execute: [[{ status: "pending" }], [{ value: 7 }], [{ value: 3 }]],
    });

    const result = await caller.getPublicById({ id: OTHER_USER_ID });

    expect(result.id).toBe(OTHER_USER_ID);
    expect(result.follow_status).toBe("pending");
    expect(result.followers_count).toBeNull();
    expect(result.following_count).toBeNull();
    expect(result.bio).toBeNull();
    expect(result.gender).toBeNull();
    expect(result.preferred_units).toBeNull();
    expect(result.language).toBeNull();
  });

  it("getPublicById rejects unexpected input keys", async () => {
    const { caller } = createCaller();

    await expect(
      caller.getPublicById({ id: OTHER_USER_ID, extra: true } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("update atomically persists all typed profile fields and returns the refreshed profile", async () => {
    const { caller, calls } = createCaller({
      select: {
        profiles: [
          [
            createProfileRow({
              bio: "Updated bio",
              full_name: "Updated Athlete",
              username: "updated_athlete",
            }),
          ],
        ],
        profileMetrics: [[], [{ value: "68.2" }], [{ value: "182" }], []],
        activityEfforts: [[], [{ value: 320, recorded_at: new Date() }], []],
      },
    });

    const result = await caller.update({
      bio: "Updated bio",
      avatar_url: null,
      cover_url: "https://example.com/updated-cover.png",
      is_public: false,
      dob: "1991-02-03",
      full_name: "Updated Athlete",
      username: "updated_athlete",
      language: "fr",
      planning_timezone: "Pacific/Auckland",
      preferred_units: "imperial",
      weight_kg: 68.2,
    });

    expect(result.username).toBe("updated_athlete");
    expect(result.full_name).toBe("Updated Athlete");
    expect(result.bio).toBe("Updated bio");
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0]).toMatchObject({
      table: "profiles",
      values: {
        avatar_url: null,
        cover_url: "https://example.com/updated-cover.png",
        bio: "Updated bio",
        full_name: "Updated Athlete",
        is_public: false,
        username: "updated_athlete",
        language: "fr",
        planning_timezone: "Pacific/Auckland",
        preferred_units: "imperial",
      },
    });
    expect(calls.updates[0]?.values.dob).toEqual(new Date("1991-02-03T00:00:00.000Z"));
    expect(calls.inserts.map((entry) => entry.table)).toEqual(["profileMetrics"]);
    expect(calls.transactions).toBe(1);
    expect(calls.executes).toHaveLength(0);
  });

  it("rejects threshold fields in the generic profile patch", async () => {
    const { caller, calls } = createCaller();

    await expect(caller.update({ ftp: 300 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.update({ threshold_hr: 175 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(calls.updates).toHaveLength(0);
  });

  it("rejects unsupported preferred-unit values before persistence", async () => {
    const { caller, calls } = createCaller();

    await expect(caller.update({ preferred_units: "customary" } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(calls.updates).toHaveLength(0);
  });

  it("rejects invalid planning timezones before persistence", async () => {
    const { caller, calls } = createCaller();

    await expect(caller.update({ planning_timezone: "PST" } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(calls.updates).toHaveLength(0);
  });

  it("rejects unknown profile patch keys before persistence", async () => {
    const { caller, calls } = createCaller();

    await expect(caller.update({ unexpected: true } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(calls.updates).toHaveLength(0);
  });

  it("returns a stable conflict error when the typed username update violates uniqueness", async () => {
    const { caller } = createCaller({
      transactionError: {
        cause: { code: "23505", constraint: "profiles_username_unique_idx" },
      },
    });

    await expect(caller.update({ username: "existing_athlete" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That username is already taken",
    });
  });

  it("list returns public-safe rows and respects limit/cursor", async () => {
    const { caller, calls } = createCaller({
      select: {
        profiles: [[createProfileRow({ id: OTHER_USER_ID, username: "other-athlete", dob: null })]],
      },
    });

    const result = await caller.list({ username: "other", limit: 5, cursor: "index:10" });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: OTHER_USER_ID,
        username: "other-athlete",
        dob: null,
        email: null,
        ftp: null,
        full_name: null,
        threshold_hr: null,
        weight_kg: null,
      }),
    ]);
    expect(calls.selects).toContainEqual({ table: "profiles", limitArgs: [5], offsetArgs: [10] });
  });

  it("getStats aggregates totals and derived TSS for the requested period", async () => {
    analysisMocks.createActivityAnalysisStore.mockReturnValue({ kind: "store" });
    analysisMocks.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    analysisMocks.buildActivitySegmentDerivedSummaries.mockResolvedValue([
      { activity_id: "activity-1", tss: 45 },
      { activity_id: "activity-2", tss: 55 },
    ]);

    const { caller } = createCaller({
      select: {
        activities: [
          [
            {
              id: "activity-1",
              elapsed_ms: 3_600_000,
              active_ms: 3_600_000,
              moving_ms: 3_500_000,
              timing_coverage: "complete",
              distance_meters: 12000,
            },
            {
              id: "activity-2",
              elapsed_ms: 1_800_000,
              active_ms: 1_800_000,
              moving_ms: 1_750_000,
              timing_coverage: "complete",
              distance_meters: 8000,
            },
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
    expect(analysisMocks.buildActivitySegmentDerivedSummaries).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: SESSION_USER_ID, activities: expect.any(Array) }),
    );
  });

  it("getZones calculates heart-rate, power, and pace thresholds from current metrics", async () => {
    const { caller } = createCaller({
      select: {
        profileMetrics: [[{ value: "71" }], [{ value: "170" }], []],
        activityEfforts: [
          [{ value: 310, recorded_at: new Date() }],
          [{ value: 4.5, recorded_at: new Date() }],
          [
            {
              activity_category: "bike",
              activity_id: "bike-activity",
              segment_id: "33333333-3333-4333-8333-333333333333",
              duration_seconds: 1200,
              effort_type: "power",
              recorded_at: new Date(),
              unit: "watts",
              value: 310,
              source: "imported",
              method: "activity_file_best_effort",
              provenance: {
                activity_id: "bike-activity",
                derived_from: "activity_file_stream",
              },
            },
            {
              activity_category: "run",
              activity_id: "run-activity",
              segment_id: "44444444-4444-4444-8444-444444444444",
              duration_seconds: 1200,
              effort_type: "speed",
              recorded_at: new Date(),
              unit: "meters_per_second",
              value: 4.5,
              source: "imported",
              method: "activity_file_best_effort",
              provenance: {
                activity_id: "run-activity",
                derived_from: "activity_file_stream",
              },
            },
          ],
        ],
      },
    });

    const result = await caller.getZones();

    expect(result.profile).toEqual({
      threshold_hr: undefined,
      ftp: undefined,
      weight_kg: 71,
      threshold_pace: undefined,
    });
    expect(result.heartRateZones).toBeNull();
    expect(result.powerZones).toBeNull();
  });

  it("rejects manual threshold updates", async () => {
    const { caller, calls } = createCaller({
      select: {
        profiles: [[createProfileRow()]],
        profileMetrics: [[], [{ value: "69.5" }], [{ value: "178" }], []],
        activityEfforts: [[], [{ value: 315.79, recorded_at: new Date() }], []],
      },
    });

    await expect(caller.updateZones({ threshold_hr: 178, ftp: 300 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(calls.deletes).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it("get provisions a missing profile instead of returning NOT_FOUND", async () => {
    const { caller, calls } = createCaller({
      select: {
        profiles: [
          [],
          [createProfileRow({ onboarded: false })],
          [createProfileRow({ onboarded: false })],
        ],
        profileMetrics: [[], []],
        activityEfforts: [[], []],
      },
    });

    await expect(caller.get()).resolves.toMatchObject({
      id: SESSION_USER_ID,
      email: "athlete@example.com",
      onboarded: false,
    });
    expect(calls.inserts[0]).toMatchObject({
      table: "profiles",
      values: { id: SESSION_USER_ID, email: "athlete@example.com" },
    });
  });
});

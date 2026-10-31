import { activities, activityEfforts, follows, profileMetrics, profiles } from "@repo/db";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
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

type TableName = "activities" | "activityEfforts" | "follows" | "profileMetrics" | "profiles";

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
  if (table === follows) return "follows";
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
    onboarding_status: "completed",
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
    follows: [...(plan.select?.follows ?? [])],
    profileMetrics: [...(plan.select?.profileMetrics ?? [])],
    activityEfforts: [...(plan.select?.activityEfforts ?? [])],
    activities: [...(plan.select?.activities ?? [])],
  } satisfies Record<TableName, Array<unknown[]>>;
  const executeQueue = [...(plan.execute ?? [])];

  const calls = {
    selects: [] as Array<{ table: TableName; limitArgs: unknown[]; offsetArgs: unknown[] }>,
    updates: [] as Array<{ table: TableName; values: Record<string, unknown> }>,
    updatePredicates: [] as SQL[],
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

      const builder = Object.assign(
        Promise.resolve().then(() => {
          if (!tableName) {
            throw new Error("Select called without table");
          }

          calls.selects.push({
            table: tableName,
            limitArgs: [...limitArgs],
            offsetArgs: [...offsetArgs],
          });
          return selectQueues[tableName].shift() ?? [];
        }),
        {
          from: (table: unknown) => {
            tableName = getTableName(table);
            return builder;
          },
          innerJoin: () => builder,
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
        },
      );

      return builder;
    },
    update: (table: unknown) => {
      const tableName = getTableName(table);
      return {
        set: (values: Record<string, unknown>) => ({
          where: (predicate: SQL) => {
            calls.updates.push({ table: tableName, values });
            calls.updatePredicates.push(predicate);
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

function createCaller(
  plan: DbPlan = {},
  session: { user: { id: string; email: string } } | null = {
    user: { id: SESSION_USER_ID, email: "athlete@example.com" },
  },
) {
  const { db, calls } = createDbMock(plan);
  const caller = profilesRouter.createCaller({
    db,
    session,
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never);

  return { caller, calls };
}

describe("profilesRouter", () => {
  it("initializes only an owned missing timezone and returns the saved winner", async () => {
    const { caller, calls } = createCaller({
      select: { profiles: [[createProfileRow({ planning_timezone: "Pacific/Auckland" })]] },
    });
    const result = await caller.initializePlanningTimezone({ timezone: "America/New_York" });
    expect(result.planning_timezone).toBe("Pacific/Auckland");
    expect(calls.updates[0]?.values.planning_timezone).toBe("America/New_York");
    const updatePredicate = calls.updatePredicates[0];
    if (!updatePredicate) throw new Error("Expected an owner-scoped initialization predicate");
    const predicate = new PgDialect().sqlToQuery(updatePredicate);
    expect(predicate.sql).toContain('"profiles"."id" = $1');
    expect(predicate.sql).toContain('"profiles"."planning_timezone" is null');
    expect(predicate.params).toEqual([SESSION_USER_ID]);
  });

  it("rejects invalid timezone defaults and unauthenticated initialization before writing", async () => {
    const { caller, calls } = createCaller();
    await expect(caller.initializePlanningTimezone({ timezone: "PST" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(calls.updates).toHaveLength(0);
    const anonymous = createCaller({}, null);
    await expect(
      anonymous.caller.initializePlanningTimezone({ timezone: "UTC" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(anonymous.calls.updates).toHaveLength(0);
  });
  it("rejects new relative profile media values", async () => {
    const { caller } = createCaller();

    await expect(
      caller.compareAndSwapMedia({
        field: "avatar_url",
        expected: null,
        next: `${SESSION_USER_ID}/avatar.jpg`,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("get returns identity fields without exposing legacy manual thresholds", async () => {
    const { caller } = createCaller({
      select: {
        profiles: [[createProfileRow()], [createProfileRow()]],
        profileMetrics: [
          [{ value: 70.4, unit: "kg", method: null, provenance: null }],
          [],
          [],
          [],
          [],
          [],
        ],
        activityEfforts: [[], []],
      },
    });

    const result = await caller.get();

    expect(result.email).toBe("athlete@example.com");
    expect(result.full_name).toBe("Athlete Example");
    expect(result.weight_kg).toBe(70.4);
    expect("threshold_hr" in result).toBe(false);
    expect("ftp" in result).toBe(false);
    expect(result.created_at).toBe("2026-04-01T10:00:00.000Z");
    expect(result.planning_timezone).toBe("America/Los_Angeles");
  });

  it("does not expose direct profile metrics through obsolete threshold aliases", async () => {
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

    expect("ftp" in result).toBe(false);
    expect("threshold_hr" in result).toBe(false);
  });

  it("get provisions a default profile when the auth user exists without a profile row", async () => {
    const { caller, calls } = createCaller({
      select: {
        profiles: [
          [],
          [
            createProfileRow({
              onboarding_status: "provider_selection",
              username: null,
              full_name: null,
            }),
          ],
          [
            createProfileRow({
              onboarding_status: "provider_selection",
              username: null,
              full_name: null,
            }),
          ],
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
        onboarding_status: "provider_selection",
        is_public: true,
      },
    });
    expect(result.id).toBe(SESSION_USER_ID);
    expect(result.email).toBe("athlete@example.com");
    expect(result.onboarding_status).toBe("provider_selection");
  });

  it("getPublicById hides private fields and counts for non-followers", async () => {
    const { caller } = createCaller({
      select: {
        profiles: [[createProfileRow({ id: OTHER_USER_ID, bio: "Private bio", is_public: false })]],
        follows: [[{ status: "pending" }], [{ value: 7 }], [{ value: 3 }]],
      },
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
      caller.getPublicById({ id: OTHER_USER_ID, extra: true } as never),
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

    await expect(caller.update({ ftp: 300 } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(caller.update({ threshold_hr: 175 } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
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

  it("never includes calibration aliases on get", async () => {
    const { caller } = createCaller({
      select: {
        profiles: [[createProfileRow()], [createProfileRow()]],
        profileMetrics: [[], []],
        activityEfforts: [[], []],
      },
    });

    const result = await caller.get();

    expect("ftp" in result).toBe(false);
    expect("threshold_hr" in result).toBe(false);
  });

  it("get provisions a missing profile instead of returning NOT_FOUND", async () => {
    const { caller, calls } = createCaller({
      select: {
        profiles: [
          [],
          [createProfileRow({ onboarding_status: "provider_selection" })],
          [createProfileRow({ onboarding_status: "provider_selection" })],
        ],
        profileMetrics: [[], []],
        activityEfforts: [[], []],
      },
    });

    await expect(caller.get()).resolves.toMatchObject({
      id: SESSION_USER_ID,
      email: "athlete@example.com",
      onboarding_status: "provider_selection",
    });
    expect(calls.inserts[0]).toMatchObject({
      table: "profiles",
      values: { id: SESSION_USER_ID, email: "athlete@example.com" },
    });
  });
});

import { activityPlans, contentAccessGrants, events, groupEvents, likes, profiles } from "@repo/db";
import type { TRPCError } from "@trpc/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { estimationState, plannedActivitySyncState } = vi.hoisted(() => ({
  estimationState: {
    estimateActivityPlan: vi.fn(async (plan: any) => ({
      ...plan,
      prescriptionQuantification: { summary: { commonLoad: { status: "available", load: 88 } } },
    })),
    estimateActivityPlans: vi.fn(async (plans: any[]) =>
      plans.map((plan) => ({
        ...plan,
        prescriptionQuantification: { summary: { commonLoad: { status: "available", load: 88 } } },
      })),
    ),
  },
  plannedActivitySyncState: {
    enqueueWahooPlannedActivityJobs: vi.fn(),
  },
}));

vi.mock("../../application/events", () => ({
  enqueueWahooPlannedActivityJobs: plannedActivitySyncState.enqueueWahooPlannedActivityJobs,
}));

vi.mock("../../application/activity-plans/estimate-activity-plans", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../application/activity-plans/estimate-activity-plans")
    >();

  return {
    ...actual,
    estimateActivityPlan: estimationState.estimateActivityPlan,
    estimateActivityPlans: estimationState.estimateActivityPlans,
  };
});

import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
import { activityPlansRouter } from "../activity-plans";

type MockTableName =
  | "activity_plans"
  | "content_access_grants"
  | "events"
  | "group_events"
  | "likes"
  | "profiles";
type MockOperation = "select" | "insert" | "update" | "delete";

type MockRows = unknown[];
type MockResult = MockRows | ((payload?: unknown) => MockRows);
type MockDbState = Partial<Record<`${MockOperation}:${MockTableName}`, MockResult[]>>;

type DbCall = {
  conflict?: unknown;
  operation: MockOperation;
  table: MockTableName;
  payload?: unknown;
  where?: unknown;
};

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const pgDialect = new PgDialect();

const sampleStructure: any = {
  version: 3,
  activity_category: "bike",
  segments: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      role: "activity",
      name: "Bike",
      intervals: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Main Interval",
          repetitions: 1,
          steps: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              name: "Ride",
              duration: { type: "time", seconds: 1800 },
              targets: [{ type: "%FTP", intensity: 75 }],
            },
          ],
        },
      ],
    },
  ],
};

function createCompositionStructure(activity_category: "bike" | "run", segmentCount = 1) {
  return {
    version: 3,
    activity_category,
    segments: Array.from({ length: segmentCount }, (_, index) => {
      const segment = structuredClone(sampleStructure.segments[0]);
      const suffix = (index + 1).toString().padStart(12, "0");
      segment.id = `10000000-0000-4000-8000-${suffix}`;
      segment.name = activity_category === "bike" ? "Bike" : "Run";
      segment.intervals[0].id = `20000000-0000-4000-8000-${suffix}`;
      segment.intervals[0].steps[0].id = `30000000-0000-4000-8000-${suffix}`;
      segment.intervals[0].steps[0].targets =
        activity_category === "bike"
          ? [{ type: "%FTP", intensity: 75 }]
          : [{ type: "%MaxHR", intensity: 70 }];
      return segment;
    }),
  };
}

function createActivityPlanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    created_at: new Date("2026-03-01T10:00:00.000Z"),
    updated_at: new Date("2026-03-01T10:00:00.000Z"),
    profile_id: USER_ID,
    name: "Tempo Builder",
    description: "Structured activity",
    notes: "Bring bottles",
    structure: sampleStructure,
    structure_hash: activityPlanStructureHash(sampleStructure),
    gps_recording_enabled: true,
    content_visibility: "private",
    is_system_template: false,
    system_content_key: null,
    system_content_version: null,
    system_content_hash: null,
    ...overrides,
  };
}

function resolveTableName(table: unknown): MockTableName {
  if (table === activityPlans) {
    return "activity_plans";
  }

  if (table === likes) {
    return "likes";
  }

  if (table === events) {
    return "events";
  }

  if (table === groupEvents) {
    return "group_events";
  }

  if (table === contentAccessGrants) {
    return "content_access_grants";
  }

  if (table === profiles) {
    return "profiles";
  }

  throw new Error(`Unsupported table in activity-plans test mock: ${String(table)}`);
}

function createDbMock(state: MockDbState = {}) {
  const callLog: DbCall[] = [];
  const counters = new Map<string, number>();

  const nextRows = (operation: MockOperation, table: MockTableName, payload?: unknown) => {
    const key = `${operation}:${table}` as const;
    const entries = state[key] ?? [];
    const index = counters.get(key) ?? 0;
    counters.set(key, index + 1);
    const result = entries[index] ?? entries[entries.length - 1] ?? [];
    return typeof result === "function" ? result(payload) : result;
  };

  const createSelectBuilder = (table: MockTableName, call: DbCall) => {
    const builder: any = {
      where: (condition: unknown) => {
        call.where = condition;
        return builder;
      },
      groupBy: async () => nextRows("select", table),
      orderBy: () => builder,
      limit: () => builder,
      for: () => builder,
      offset: async () => nextRows("select", table),
      then: (onFulfilled: (value: unknown[]) => unknown) =>
        Promise.resolve(nextRows("select", table)).then(onFulfilled),
    };

    return builder;
  };

  const db: any = {
    select: () => ({
      from: (table: unknown) => {
        const tableName = resolveTableName(table);
        const call: DbCall = { operation: "select", table: tableName };
        callLog.push(call);
        return createSelectBuilder(tableName, call);
      },
    }),
    insert: (table: unknown) => {
      const tableName = resolveTableName(table);
      return {
        values: (payload: unknown) => {
          const call: DbCall = { operation: "insert", table: tableName, payload };
          callLog.push(call);
          type InsertBuilder = {
            onConflictDoUpdate: (conflict: unknown) => InsertBuilder;
            returning: () => Promise<MockRows>;
          };
          const builder: InsertBuilder = {
            onConflictDoUpdate: (conflict: unknown) => {
              call.conflict = conflict;
              return builder;
            },
            returning: async () => nextRows("insert", tableName, payload),
          };
          return builder;
        },
      };
    },
    update: (table: unknown) => {
      const tableName = resolveTableName(table);
      return {
        set: (payload: unknown) => {
          callLog.push({ operation: "update", table: tableName, payload });
          return {
            where: () => ({
              returning: async () => nextRows("update", tableName),
            }),
          };
        },
      };
    },
    delete: (table: unknown) => {
      const tableName = resolveTableName(table);
      return {
        where: () => {
          callLog.push({ operation: "delete", table: tableName });
          return {
            returning: async () => nextRows("delete", tableName),
          };
        },
      };
    },
  };
  db.transaction = async (callback: (tx: typeof db) => Promise<unknown>) => callback(db);

  return {
    db,
    callLog,
  };
}

function getActivityPlanListQuery(callLog: DbCall[]) {
  const call = callLog.find(
    (entry) => entry.operation === "select" && entry.table === "activity_plans",
  );
  if (!call?.where) {
    throw new Error("Expected activity-plan list query to include a where condition");
  }
  return pgDialect.sqlToQuery(call.where as never);
}

function createCaller(params?: { state?: MockDbState; userId?: string }) {
  const { state, userId = USER_ID } = params ?? {};
  const { db, callLog } = createDbMock(state);

  const caller = activityPlansRouter.createCaller({
    db: db as any,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, callLog };
}

function createProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    username: "Owner",
    avatar_url: "https://example.com/avatar.png",
    ...overrides,
  };
}

describe("activityPlansRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    plannedActivitySyncState.enqueueWahooPlannedActivityJobs.mockResolvedValue(null);
  });

  it("list returns estimated items, liked state, and a next cursor", async () => {
    const firstPlan = createActivityPlanRow({
      id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      created_at: new Date("2026-03-02T10:00:00.000Z"),
      name: "Newest",
    });
    const secondPlan = createActivityPlanRow({
      id: "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      created_at: new Date("2026-03-01T10:00:00.000Z"),
      name: "Older",
    });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[firstPlan, secondPlan]],
        "select:likes": [[{ entity_id: firstPlan.id, likes_count: 4, has_liked: true }]],
        "select:profiles": [[createProfileRow()]],
      },
    });

    const result = await caller.list({ ownerScope: "own", limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      contractVersion: "activity-plan-summary-v1",
      id: firstPlan.id,
      engagement: { viewerHasLiked: true, likes: 4 },
      owner: {
        id: USER_ID,
        username: "Owner",
        avatarUrl: "https://example.com/avatar.png",
      },
      activityCategory: "bike",
      visibility: "private",
      capabilities: { canEdit: true, canDelete: true },
    });
    expect(result.items[0]?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "elapsed_duration",
          status: "available",
          value: 1800,
        }),
      ]),
    );
    expect(result.items[0]).not.toHaveProperty("common_load");
    expect(result.items[0]).not.toHaveProperty("duration_estimate");
    expect(result.items[0]).not.toHaveProperty("confidence");
    expect(result.items[0]).not.toHaveProperty("estimation_warnings");
    expect(result.nextCursor).toBe(`${firstPlan.created_at.toISOString()}_${firstPlan.id}`);
  });

  it("list accepts discoverable owner scope for public and system picker surfaces", async () => {
    const publicPlan = createActivityPlanRow({
      id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      profile_id: OTHER_USER_ID,
      content_visibility: "public",
    });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[publicPlan]],
        "select:likes": [[]],
        "select:profiles": [[createProfileRow({ id: OTHER_USER_ID, username: "Other" })]],
      },
    });

    const result = await caller.list({ ownerScope: "discoverable", limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: publicPlan.id,
      visibility: "public",
    });
  });

  it("list omits malformed persisted plans without truncating pagination", async () => {
    const invalidStructure = structuredClone(sampleStructure);
    invalidStructure.segments[0].intervals = [];
    const invalidPlan = createActivityPlanRow({
      id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      structure: invalidStructure,
    });
    const validPlan = createActivityPlanRow({
      id: "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    const laterPlan = createActivityPlanRow({
      id: "33333333-cccc-4ccc-8ccc-cccccccccccc",
      created_at: new Date("2026-02-28T10:00:00.000Z"),
    });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[invalidPlan, validPlan], [laterPlan], [laterPlan]],
        "select:likes": [[], []],
        "select:profiles": [[createProfileRow()], [createProfileRow()]],
      },
    });

    const result = await caller.list({ ownerScope: "own", limit: 1 });

    expect(result.items.map((plan) => plan.id)).toEqual([validPlan.id]);
    expect(result.nextCursor).toBe(`${validPlan.created_at.toISOString()}_${validPlan.id}`);

    const nextPage = await caller.list({
      ownerScope: "own",
      limit: 1,
      cursor: result.nextCursor,
    });
    expect(nextPage.items.map((plan) => plan.id)).toEqual([laterPlan.id]);
  });

  it("uses an index cursor when discovery requests persisted oldest-first sorting", async () => {
    const firstPlan = createActivityPlanRow({
      id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      created_at: new Date("2026-03-01T10:00:00.000Z"),
    });
    const secondPlan = createActivityPlanRow({
      id: "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      created_at: new Date("2026-03-02T10:00:00.000Z"),
    });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[firstPlan, secondPlan]],
        "select:likes": [[]],
        "select:profiles": [[createProfileRow()]],
      },
    });

    const result = await caller.list({ ownerScope: "discoverable", sort_by: "oldest", limit: 1 });

    expect(result.items[0]?.id).toBe(firstPlan.id);
    expect(result.nextCursor).toBe("index:1");
  });

  it("filters by the root activity_category instead of a storage alias", async () => {
    const runStructure = structuredClone(sampleStructure);
    runStructure.activity_category = "run";
    runStructure.segments[0].intervals[0].steps[0].targets = [{ type: "%MaxHR", intensity: 70 }];
    const runPlan = createActivityPlanRow({
      id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      structure: runStructure,
      structure_hash: activityPlanStructureHash(runStructure),
    });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[runPlan]],
        "select:likes": [[]],
        "select:profiles": [[createProfileRow()]],
      },
    });

    const result = await caller.list({ ownerScope: "own", activityCategories: ["run"], limit: 20 });

    expect(result.items.map((item) => item.id)).toEqual([runPlan.id]);
    expect(result.items[0]).toMatchObject({ activityCategory: "run" });
    expect(result.items[0]).not.toHaveProperty("sport");
  });

  it("applies activity_category containment in one bounded database query", async () => {
    const row = (index: number, activity_category: "bike" | "run") => {
      const structure = structuredClone(sampleStructure);
      structure.activity_category = activity_category;
      structure.segments[0].intervals[0].steps[0].targets =
        activity_category === "run"
          ? [{ type: "%MaxHR", intensity: 70 }]
          : [{ type: "%FTP", intensity: 75 }];
      return createActivityPlanRow({
        id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
        created_at: new Date(2026, 2, 1, 0, 0, 200 - index),
        structure,
      });
    };
    const databaseFilteredPage = Array.from({ length: 21 }, (_, index) => row(index + 1, "run"));
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [databaseFilteredPage],
        "select:likes": [[]],
        "select:profiles": [[createProfileRow()]],
      },
    });

    const result = await caller.list({ ownerScope: "own", activityCategories: ["run"], limit: 20 });

    expect(result.items).toHaveLength(20);
    expect(result.items.every((item) => item.activityCategory === "run")).toBe(true);
    expect(result.nextCursor).toBeDefined();
    expect(
      callLog.filter((call) => call.operation === "select" && call.table === "activity_plans"),
    ).toHaveLength(1);
  });

  it("rejects metadata updates to legacy segment-category plans", async () => {
    const structure = {
      version: 3,
      segments: createCompositionStructure("run", 2).segments.map((segment, index) => ({
        ...segment,
        activity_category: index === 0 ? "run" : "bike",
      })),
    };
    const structureHash = activityPlanStructureHash(structure);
    const legacyPlan = createActivityPlanRow({ structure, structure_hash: structureHash });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[legacyPlan]],
      },
    });

    await expect(
      caller.update({
        id: legacyPlan.id,
        expectedStructureHash: structureHash,
        name: "Updated details",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });

  it("treats repeated activity segments under one root category as executable", async () => {
    const structure = createCompositionStructure("bike", 2);
    const plan = createActivityPlanRow({ structure });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[plan]],
        "select:likes": [[]],
        "select:profiles": [[createProfileRow()]],
      },
    });

    const result = await caller.list({ ownerScope: "own", limit: 20 });

    expect(result.items[0]).toMatchObject({
      activityCategory: "bike",
    });
  });

  it("omits legacy segment-category rows and fails closed on direct detail", async () => {
    const structure = {
      version: 3,
      segments: createCompositionStructure("run", 3).segments.map((segment, index) => ({
        ...segment,
        activity_category: index === 1 ? "bike" : "run",
      })),
    };
    const plan = createActivityPlanRow({ structure });
    const state: MockDbState = {
      "select:activity_plans": [[plan]],
      "select:likes": [[]],
      "select:profiles": [[createProfileRow()]],
    };
    const { caller: listCaller } = createCaller({ state });
    const { caller: detailCaller } = createCaller({ state });
    const listResult = await listCaller.list({ ownerScope: "own", limit: 20 });

    expect(listResult.items).toEqual([]);
    await expect(detailCaller.getById({ id: plan.id })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("uses root activity_category containment SQL", async () => {
    const plan = createActivityPlanRow();
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[plan]],
        "select:likes": [[]],
        "select:profiles": [[createProfileRow()]],
      },
    });

    await caller.list({ ownerScope: "own", activityCategories: ["run"], limit: 20 });

    const query = getActivityPlanListQuery(callLog);
    expect(query.sql).toContain("@>");
    expect(query.params).toContain(JSON.stringify({ activity_category: "run" }));
  });

  it("getById rejects a private plan owned by another user", async () => {
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [
          [
            createActivityPlanRow({
              id: "99999999-9999-4999-8999-999999999999",
              profile_id: OTHER_USER_ID,
              content_visibility: "private",
              is_system_template: false,
            }),
          ],
          [
            createActivityPlanRow({
              id: "99999999-9999-4999-8999-999999999999",
              profile_id: OTHER_USER_ID,
              content_visibility: "private",
              is_system_template: false,
            }),
          ],
        ],
        "select:content_access_grants": [[]],
      },
    });

    await expect(
      caller.getById({ id: "99999999-9999-4999-8999-999999999999" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" } as Partial<TRPCError>);
  });

  it("getById rejects unexpected input fields", async () => {
    const { caller } = createCaller();

    await expect(
      caller.getById({
        id: "99999999-9999-4999-8999-999999999999",
        extra: true,
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
  });

  it("getById rejects stored non-current JSON without a read fallback", async () => {
    const oldRow = createActivityPlanRow({ structure: { version: 2, intervals: [] } });
    const { caller } = createCaller({
      state: { "select:activity_plans": [[oldRow]] },
    });

    await expect(caller.getById({ id: oldRow.id })).rejects.toThrow();
  });

  it("getManyByIds preserves input order for accessible plans", async () => {
    const ownPlan = createActivityPlanRow({ id: "11111111-1111-4111-8111-111111111111" });
    const publicPlan = createActivityPlanRow({
      id: "22222222-2222-4222-8222-222222222222",
      profile_id: OTHER_USER_ID,
      gps_recording_enabled: true,
      structure_hash: activityPlanStructureHash(sampleStructure),
      content_visibility: "public",
    });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[publicPlan, ownPlan]],
        "select:likes": [[{ entity_id: ownPlan.id, likes_count: 2, has_liked: true }]],
        "select:profiles": [
          [
            createProfileRow(),
            createProfileRow({ id: OTHER_USER_ID, username: "Other", avatar_url: null }),
          ],
        ],
      },
    });

    const result = await caller.getManyByIds({
      ids: [ownPlan.id, "33333333-3333-4333-8333-333333333333", publicPlan.id],
    });

    expect(result.items.map((item) => item.id)).toEqual([ownPlan.id, publicPlan.id]);
    expect(result.items[0]?.engagement.viewerHasLiked).toBe(true);
    expect(result.items[0]?.engagement.likes).toBe(2);
    expect(result.items[1]?.engagement.viewerHasLiked).toBe(false);
    expect(result.items[1]?.engagement.likes).toBe(0);
    expect(result.items[0]?.owner?.id).toBe(USER_ID);
    expect(result.items[1]?.owner?.id).toBe(OTHER_USER_ID);
  });

  it("getManyByIds includes contextually granted private plans and omits denied private plans", async () => {
    const ownPlan = createActivityPlanRow({ id: "11111111-1111-4111-8111-111111111111" });
    const grantedPlan = createActivityPlanRow({
      id: "22222222-2222-4222-8222-222222222222",
      profile_id: OTHER_USER_ID,
      content_visibility: "private",
    });
    const deniedPlan = createActivityPlanRow({
      id: "33333333-3333-4333-8333-333333333333",
      profile_id: OTHER_USER_ID,
      content_visibility: "private",
    });
    const systemPlan = createActivityPlanRow({
      id: "44444444-4444-4444-8444-444444444444",
      profile_id: null,
      is_system_template: true,
    });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[grantedPlan, systemPlan, ownPlan]],
        "select:likes": [[]],
        "select:profiles": [
          [
            createProfileRow(),
            createProfileRow({ id: OTHER_USER_ID, username: "Other", avatar_url: null }),
          ],
        ],
      },
    });

    const result = await caller.getManyByIds({
      ids: [deniedPlan.id, ownPlan.id, grantedPlan.id, systemPlan.id],
    });

    expect(result.items.map((item) => item.id)).toEqual([
      ownPlan.id,
      grantedPlan.id,
      systemPlan.id,
    ]);
    expect(result.items.map((item) => item.id)).not.toContain(deniedPlan.id);
  });

  it("getManyByIds uses one canonical accessible-plan query at every input size", async () => {
    for (const count of [1, 10, 100]) {
      const followerPlans = Array.from({ length: count }, (_, index) =>
        createActivityPlanRow({
          id: `30000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
          profile_id: `40000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
          content_visibility: "followers",
        }),
      );
      const deniedPlans = Array.from({ length: count }, (_, index) =>
        createActivityPlanRow({
          id: `50000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
          profile_id: `60000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
          content_visibility: "private",
        }),
      );
      const { caller, callLog } = createCaller({
        state: {
          "select:activity_plans": [[]],
          "select:likes": [[]],
          "select:profiles": [[]],
        },
      });

      const result = await caller.getManyByIds({
        ids: [...followerPlans, ...deniedPlans].map((plan) => plan.id),
      });

      expect(result.items).toEqual([]);
      expect(callLog[0]).toMatchObject({ operation: "select", table: "activity_plans" });
      expect(
        callLog.filter((call) => call.operation === "select" && call.table === "activity_plans"),
      ).toHaveLength(1);
      const query = getActivityPlanListQuery(callLog);
      const requestedIds = [...followerPlans, ...deniedPlans].map((plan) => plan.id);
      expect(query.params).toEqual(expect.arrayContaining(requestedIds));
      expect(query.sql).toContain('"activity_plans"."id" in');
      expect(query.sql).toContain('"activity_plans"."profile_id" = $');
      expect(query.sql).toContain('"activity_plans"."is_system_template" = $');
      expect(query.sql).toContain('"activity_plans"."content_visibility" = $');
      expect(query.sql).toContain("from follows f");
      expect(query.sql).toContain("f.status = 'accepted'");
      expect(query.sql).toContain("from content_access_grants cag");
      expect(query.sql).toContain("cag.access_level = 'read'");
      expect(query.sql).toContain("cag.revoked_at is null");
      expect(query.sql).toContain("cag.expires_at is null or cag.expires_at > now()");
    }
  });

  it("getManyByIds retains its unique input order contract", async () => {
    const firstPlan = createActivityPlanRow({ id: "11111111-1111-4111-8111-111111111111" });
    const secondPlan = createActivityPlanRow({ id: "22222222-2222-4222-8222-222222222222" });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[secondPlan, firstPlan]],
        "select:likes": [[]],
        "select:profiles": [[createProfileRow(), createProfileRow({ id: secondPlan.id })]],
      },
    });

    const result = await caller.getManyByIds({ ids: [secondPlan.id, firstPlan.id, secondPlan.id] });

    expect(result.items.map((item) => item.id)).toEqual([secondPlan.id, firstPlan.id]);
  });

  it("create stores computed metrics and allows missing description", async () => {
    const createdRow = createActivityPlanRow({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Created Plan",
      content_visibility: "public",
      structure_hash: activityPlanStructureHash(sampleStructure),
    });
    const { caller, callLog } = createCaller({
      state: {
        "insert:activity_plans": [[createdRow]],
      },
    });

    const result = await caller.create({
      name: "Created Plan",
      notes: "Hydrate",
      structure: sampleStructure,
      content_visibility: "public",
    });

    const insertCall = callLog.find((call) => call.operation === "insert");
    expect(insertCall?.payload).toMatchObject({
      name: "Created Plan",
      description: null,
      profile_id: USER_ID,
      content_visibility: "public",
    });
    expect(result).toMatchObject({
      id: createdRow.id,
      content_type: "activity_plan",
      visibility: "public",
      activity_category: "bike",
    });
    expect(result).not.toHaveProperty("route");
    expect(result).not.toHaveProperty("route_id");
  });

  it("create rejects route linkage and never persists it", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.create({
        name: "Route activity",
        route_id: "99999999-9999-4999-8999-999999999999",
        structure: sampleStructure,
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
    expect(callLog.some((call) => call.operation === "insert")).toBe(false);
  });

  it("create rejects unsupported old activity-plan JSON without conversion", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.create({
        name: "Unsupported old plan",
        structure: { version: 2, intervals: [] },
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
    expect(callLog).toHaveLength(0);
  });

  it("update persists visibility and recomputed metrics for an owned plan", async () => {
    const existingRow = createActivityPlanRow({
      id: "66666666-6666-4666-8666-666666666666",
      name: "Before Update",
    });
    const updatedRow = createActivityPlanRow({
      id: existingRow.id,
      name: "After Update",
      content_visibility: "public",
    });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[existingRow]],
        "update:activity_plans": [[updatedRow]],
      },
    });

    const result = await caller.update({
      id: existingRow.id,
      expectedStructureHash: existingRow.structure_hash,
      name: "After Update",
      content_visibility: "public",
      structure: sampleStructure,
    });

    const updateCall = callLog.find((call) => call.operation === "update");
    expect(updateCall?.payload).toMatchObject({
      name: "After Update",
      content_visibility: "public",
    });
    expect(result).toMatchObject({ id: existingRow.id, visibility: "public" });
  });

  it("update rejects route linkage and never persists it", async () => {
    const existingRow = createActivityPlanRow();
    const { caller, callLog } = createCaller({
      state: { "select:activity_plans": [[existingRow]] },
    });

    await expect(
      caller.update({
        id: existingRow.id,
        expectedStructureHash: existingRow.structure_hash,
        route_id: "99999999-9999-4999-8999-999999999999",
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });

  it("rejects update and deletion by a non-owner before mutating the plan", async () => {
    const ownedByAnotherAthlete = createActivityPlanRow({ profile_id: OTHER_USER_ID });
    const { caller, callLog } = createCaller({
      state: { "select:activity_plans": [[]] },
    });

    await expect(
      caller.update({
        id: ownedByAnotherAthlete.id,
        expectedStructureHash: ownedByAnotherAthlete.structure_hash,
        name: "Attempted non-owner edit",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" } as Partial<TRPCError>);
    await expect(caller.delete({ id: ownedByAnotherAthlete.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    } as Partial<TRPCError>);

    expect(callLog.some((call) => call.operation === "update" || call.operation === "delete")).toBe(
      false,
    );
  });

  it("update republishes every owned future planned event after a material plan change", async () => {
    const existingRow = createActivityPlanRow({ name: "Before Update" });
    const updatedRow = createActivityPlanRow({ name: "After Update" });
    const futureEvents = [{ id: "event-1" }, { id: "event-2" }];
    plannedActivitySyncState.enqueueWahooPlannedActivityJobs.mockResolvedValue({
      affectedCount: 2,
      operation: "publish",
      queued: true,
      success: true,
    });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[existingRow]],
        "select:events": [futureEvents],
        "update:activity_plans": [[updatedRow]],
      },
    });

    const result = await caller.update({
      id: existingRow.id,
      expectedStructureHash: existingRow.structure_hash,
      name: "After Update",
    });

    expect(plannedActivitySyncState.enqueueWahooPlannedActivityJobs).toHaveBeenCalledOnce();
    expect(plannedActivitySyncState.enqueueWahooPlannedActivityJobs).toHaveBeenCalledWith(
      expect.anything(),
      { eventIds: ["event-1", "event-2"], operation: "publish" },
    );
    expect(result.plannedActivitySync).toMatchObject({ operation: "publish", success: true });
  });

  it("update does not republish for a nonmaterial or unchanged material update", async () => {
    const existingRow = createActivityPlanRow();
    const updatedRow = createActivityPlanRow({ notes: "Updated notes" });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[existingRow], [updatedRow]],
        "update:activity_plans": [[updatedRow], [updatedRow]],
      },
    });

    await caller.update({
      id: existingRow.id,
      expectedStructureHash: existingRow.structure_hash,
      notes: "Updated notes",
    });
    await caller.update({
      id: existingRow.id,
      expectedStructureHash: existingRow.structure_hash,
      name: existingRow.name,
    });

    expect(plannedActivitySyncState.enqueueWahooPlannedActivityJobs).not.toHaveBeenCalled();
    expect(callLog.filter((call) => call.table === "events")).toHaveLength(0);
  });

  it("rejects top-level activity_category authority", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.update({
        id: "66666666-6666-4666-8666-666666666666",
        activity_category: "run",
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });

  it("update rejects id-only no-op payloads before hitting the database", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.update({
        id: "66666666-6666-4666-8666-666666666666",
        expectedStructureHash: activityPlanStructureHash(sampleStructure),
      }),
    ).rejects.toThrow("At least one activity plan update field is required");

    expect(callLog).toHaveLength(0);
  });

  it("rejects a stale activity-plan structure hash without writing", async () => {
    const existingRow = createActivityPlanRow();
    const { caller, callLog } = createCaller({
      state: { "select:activity_plans": [[existingRow]] },
    });

    await expect(
      caller.update({
        id: existingRow.id,
        expectedStructureHash: `v1:sha256:${"f".repeat(64)}`,
        name: "Stale write",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "STALE_STRUCTURE_HASH" });
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });

  it("delete returns only the current plannedActivitySync DTO field", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "select:events": [[]],
        "select:group_events": [[]],
        "delete:activity_plans": [[{ id: "77777777-7777-4777-8777-777777777777" }]],
      },
    });

    const result = await caller.delete({ id: "77777777-7777-4777-8777-777777777777" });

    expect(callLog.some((call) => call.operation === "delete")).toBe(true);
    expect(result).toEqual({ success: true, plannedActivitySync: null });
    expect(result).not.toHaveProperty("wahooSync");
  });

  it("delete rejects every linked schedule without relying on a 100-item client page", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    const eventRows = Array.from({ length: 101 }, (_, index) => ({ id: `event-${index + 1}` }));
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "select:events": [eventRows],
      },
    });

    await expect(
      caller.delete({ id: "77777777-7777-4777-8777-777777777777" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Remove all linked scheduled events before deleting this activity plan",
    } as Partial<TRPCError>);
    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(0);
    expect(plannedActivitySyncState.enqueueWahooPlannedActivityJobs).not.toHaveBeenCalled();
  });

  it("delete rejects a cross-owner event reference without filtering by event owner", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "select:events": [[{ id: "event-1", profile_id: OTHER_USER_ID }]],
      },
    });

    await expect(caller.delete({ id: ownedPlan.id })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Remove all linked scheduled events before deleting this activity plan",
    } as Partial<TRPCError>);

    const eventQuery = callLog.find((call) => call.table === "events" && call.where)?.where;
    expect(eventQuery).toBeDefined();
    expect(pgDialect.sqlToQuery(eventQuery as never).sql).not.toContain('"events"."profile_id"');
    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(0);
  });

  it("delete rejects a group-event reference and leaves the plan intact", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "select:events": [[]],
        "select:group_events": [[{ id: "group-event-1" }]],
      },
    });

    await expect(caller.delete({ id: ownedPlan.id })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Remove all linked scheduled events before deleting this activity plan",
    } as Partial<TRPCError>);

    expect(callLog.some((call) => call.table === "group_events")).toBe(true);
    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(0);
  });

  it("delete rejects an unowned plan without querying events or enqueueing unsync", async () => {
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[]],
      },
    });

    await expect(
      caller.delete({ id: "77777777-7777-4777-8777-777777777777" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" } as Partial<TRPCError>);

    expect(callLog.filter((call) => call.table === "events")).toHaveLength(0);
    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(0);
    expect(plannedActivitySyncState.enqueueWahooPlannedActivityJobs).not.toHaveBeenCalled();
  });

  it("delete leaves the plan intact when a linked-schedule conflict is found", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "select:events": [[{ id: "event-1" }]],
      },
    });

    await expect(
      caller.delete({ id: "77777777-7777-4777-8777-777777777777" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Remove all linked scheduled events before deleting this activity plan",
    } as Partial<TRPCError>);

    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(0);
  });

  it("delete surfaces an unexpected transactional failure without reporting success", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "select:events": [[]],
        "delete:activity_plans": [[]],
      },
    });

    await expect(caller.delete({ id: "77777777-7777-4777-8777-777777777777" })).rejects.toThrow(
      "Activity plan changed during deletion",
    );

    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(1);
  });

  it("delete rejects unexpected input fields", async () => {
    const { caller } = createCaller();

    await expect(
      caller.delete({
        id: "77777777-7777-4777-8777-777777777777",
        extra: true,
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
  });

  it("duplicate creates a private copy from an accessible public plan", async () => {
    const originalRow = createActivityPlanRow({
      id: "88888888-8888-4888-8888-888888888888",
      profile_id: OTHER_USER_ID,
      content_visibility: "public",
      name: "Shared Activity",
    });
    const duplicatedRow = createActivityPlanRow({
      id: "99999999-8888-4888-8888-888888888888",
      profile_id: USER_ID,
      name: "Shared Activity (Copy)",
      content_visibility: "private",
    });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[originalRow]],
        "insert:activity_plans": [[duplicatedRow]],
      },
    });

    const result = await caller.duplicate({ id: originalRow.id });

    const insertCall = callLog.find((call) => call.operation === "insert");
    expect(insertCall?.payload).toMatchObject({
      name: "Shared Activity (Copy)",
      profile_id: USER_ID,
      content_visibility: "private",
    });
    expect(result).toMatchObject({ id: duplicatedRow.id, visibility: "private" });
  });

  it("duplicate rejects unexpected input fields", async () => {
    const { caller } = createCaller();

    await expect(
      caller.duplicate({
        id: "88888888-8888-4888-8888-888888888888",
        extra: true,
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
  });
});

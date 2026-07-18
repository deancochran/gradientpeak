import { activityPlans, contentAccessGrants, events, likes, profiles } from "@repo/db";
import type { TRPCError } from "@trpc/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { estimationState, plannedWorkoutSyncState } = vi.hoisted(() => ({
  estimationState: {
    getActivityPlanDerivedMetrics: vi.fn(async (plan: any) => ({
      ...plan,
      authoritative_metrics: {
        estimated_tss: 88,
        estimated_duration: 3600,
        estimated_distance: 12000,
        intensity_factor: 0.82,
      },
      route: null,
      confidence: "moderate",
      confidence_score: 82,
      estimate_source: "cache",
      estimate_computed_at: "2026-03-01T10:00:00.000Z",
      estimator_version: "2026-05-estimated-provenance-v1",
    })),
    getActivityPlansDerivedMetrics: vi.fn(async (plans: any[]) =>
      plans.map((plan) => ({
        ...plan,
        authoritative_metrics: {
          estimated_tss: 88,
          estimated_duration: 3600,
          estimated_distance: 12000,
          intensity_factor: 0.82,
        },
        route: null,
        confidence: "moderate",
        confidence_score: 82,
        estimate_source: "cache",
        estimate_computed_at: "2026-03-01T10:00:00.000Z",
        estimator_version: "2026-05-estimated-provenance-v1",
      })),
    ),
    computePlanMetrics: vi.fn(async () => ({
      estimated_tss: 88,
      estimated_duration_seconds: 3600,
      estimated_distance_meters: 12000,
    })),
    createEventReadRepository: vi.fn(() => ({ kind: "event-read-repository" })),
  },
  plannedWorkoutSyncState: {
    enqueueProviderPlannedActivityJobs: vi.fn(),
  },
}));

vi.mock("../../application/events", () => ({
  enqueueProviderPlannedActivityJobs: plannedWorkoutSyncState.enqueueProviderPlannedActivityJobs,
}));

vi.mock("../../utils/estimation-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/estimation-helpers")>();

  return {
    ...actual,
    computePlanMetrics: estimationState.computePlanMetrics,
  };
});

vi.mock("../../utils/activity-plan-derived-metrics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/activity-plan-derived-metrics")>();

  return {
    ...actual,
    getActivityPlanDerivedMetrics: estimationState.getActivityPlanDerivedMetrics,
    getActivityPlansDerivedMetrics: estimationState.getActivityPlansDerivedMetrics,
  };
});

vi.mock("../../infrastructure/repositories", () => ({
  createEventReadRepository: estimationState.createEventReadRepository,
}));

import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
import { activityPlansRouter } from "../activity-plans";

type MockTableName = "activity_plans" | "content_access_grants" | "events" | "likes" | "profiles";
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
  segments: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      role: "activity",
      category: "bike",
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

function createCompositionStructure(categories: Array<"bike" | "run">) {
  return {
    version: 3,
    segments: categories.map((category, index) => {
      const segment = structuredClone(sampleStructure.segments[0]);
      const suffix = (index + 1).toString().padStart(12, "0");
      segment.id = `10000000-0000-4000-8000-${suffix}`;
      segment.category = category;
      segment.name = category === "bike" ? "Bike" : "Run";
      segment.intervals[0].id = `20000000-0000-4000-8000-${suffix}`;
      segment.intervals[0].steps[0].id = `30000000-0000-4000-8000-${suffix}`;
      segment.intervals[0].steps[0].targets =
        category === "bike"
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
    template_visibility: "private",
    import_provider: null,
    import_external_id: null,
    is_system_template: false,
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
      limit: async () => nextRows("select", table),
      then: (onFulfilled: (value: unknown[]) => unknown) =>
        Promise.resolve(nextRows("select", table)).then(onFulfilled),
    };

    return builder;
  };

  return {
    db: {
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
    },
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
    plannedWorkoutSyncState.enqueueProviderPlannedActivityJobs.mockResolvedValue(null);
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

    const result = await caller.list({ includeOwnOnly: true, limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: firstPlan.id,
      has_liked: true,
      likes_count: 4,
      content_type: "activity_plan",
      owner_profile_id: USER_ID,
      owner: {
        id: USER_ID,
        username: "Owner",
        avatar_url: "https://example.com/avatar.png",
      },
      visibility: "private",
      authoritative_metrics: {
        estimated_tss: 88,
      },
    });
    expect(result.nextCursor).toBe(`${firstPlan.created_at.toISOString()}_${firstPlan.id}`);
  });

  it("list accepts discoverable owner scope for public and system picker surfaces", async () => {
    const publicPlan = createActivityPlanRow({
      id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      profile_id: OTHER_USER_ID,
      template_visibility: "public",
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

  it("filters by categories contained in V3 segments instead of the storage column", async () => {
    const runStructure = structuredClone(sampleStructure);
    runStructure.segments[0].category = "run";
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

    const result = await caller.list({ activityCategories: ["run"], limit: 20 });

    expect(result.items.map((item) => item.id)).toEqual([runPlan.id]);
    expect(result.items[0]).toMatchObject({ categories: ["run"], primary_category: "run" });
    expect(result.items[0]).not.toHaveProperty("activity_category");
  });

  it("applies category containment in one bounded database query", async () => {
    const row = (index: number, category: "bike" | "run") => {
      const structure = structuredClone(sampleStructure);
      structure.segments[0].category = category;
      structure.segments[0].intervals[0].steps[0].targets =
        category === "run"
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

    const result = await caller.list({ activityCategories: ["run"], limit: 20 });

    expect(result.items).toHaveLength(20);
    expect(result.items.every((item) => item.primary_category === "run")).toBe(true);
    expect(result.nextCursor).toBeDefined();
    expect(
      callLog.filter((call) => call.operation === "select" && call.table === "activity_plans"),
    ).toHaveLength(1);
  });

  it("includes multisport plans by default and with the explicit include mode", async () => {
    const structure = createCompositionStructure(["run", "bike"]);
    const plan = createActivityPlanRow({ structure });

    for (const input of [
      { limit: 20 },
      { compositionMode: "include_multisport" as const, limit: 20 },
    ]) {
      const { caller, callLog } = createCaller({
        state: {
          "select:activity_plans": [[plan]],
          "select:likes": [[]],
          "select:profiles": [[createProfileRow()]],
        },
      });

      const result = await caller.list(input);

      expect(result.items[0]).toMatchObject({
        activity_kind: "multisport",
        activity_segment_count: 2,
        category_composition: ["run", "bike"],
      });
      expect(getActivityPlanListQuery(callLog).sql).not.toContain("jsonb_path_query_array");
    }
  });

  it("applies the single-only activity-segment condition", async () => {
    const plan = createActivityPlanRow();
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[plan]],
        "select:likes": [[]],
        "select:profiles": [[createProfileRow()]],
      },
    });

    await caller.list({ compositionMode: "single_only", limit: 20 });

    expect(getActivityPlanListQuery(callLog).sql).toMatch(
      /jsonb_array_length\(jsonb_path_query_array\(.+\)\) = 1/,
    );
  });

  it("treats repeated categories in separate activity segments as multisport", async () => {
    const structure = createCompositionStructure(["bike", "bike"]);
    const plan = createActivityPlanRow({ structure });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[plan]],
        "select:likes": [[]],
        "select:profiles": [[createProfileRow()]],
      },
    });

    const result = await caller.list({ compositionMode: "multisport_only", limit: 20 });

    expect(result.items[0]).toMatchObject({
      activity_kind: "multisport",
      activity_segment_count: 2,
      categories: ["bike"],
      category_composition: ["bike", "bike"],
      primary_category: "bike",
    });
    expect(getActivityPlanListQuery(callLog).sql).toMatch(
      /jsonb_array_length\(jsonb_path_query_array\(.+\)\) > 1/,
    );
  });

  it("returns ordered composition fields in list and detail DTOs", async () => {
    const structure = createCompositionStructure(["run", "bike", "run"]);
    const plan = createActivityPlanRow({ structure });
    const state: MockDbState = {
      "select:activity_plans": [[plan]],
      "select:likes": [[]],
      "select:profiles": [[createProfileRow()]],
    };
    const { caller: listCaller } = createCaller({ state });
    const { caller: detailCaller } = createCaller({ state });

    const [listResult, detailResult] = await Promise.all([
      listCaller.list({ limit: 20 }),
      detailCaller.getById({ id: plan.id }),
    ]);

    const composition = {
      activity_kind: "multisport",
      activity_segment_count: 3,
      categories: ["run", "bike"],
      category_composition: ["run", "bike", "run"],
      primary_category: "run",
    };
    expect(listResult.items[0]).toMatchObject(composition);
    expect(detailResult).toMatchObject(composition);
  });

  it("uses role-aware category containment SQL", async () => {
    const plan = createActivityPlanRow();
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[plan]],
        "select:likes": [[]],
        "select:profiles": [[createProfileRow()]],
      },
    });

    await caller.list({ activityCategories: ["run"], limit: 20 });

    const query = getActivityPlanListQuery(callLog);
    expect(query.sql).toContain("@>");
    expect(query.params).toContain(
      JSON.stringify({ segments: [{ role: "activity", category: "run" }] }),
    );
  });

  it("getById rejects a private plan owned by another user", async () => {
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [
          [
            createActivityPlanRow({
              id: "99999999-9999-4999-8999-999999999999",
              profile_id: OTHER_USER_ID,
              template_visibility: "private",
              is_system_template: false,
            }),
          ],
          [
            createActivityPlanRow({
              id: "99999999-9999-4999-8999-999999999999",
              profile_id: OTHER_USER_ID,
              template_visibility: "private",
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

  it("getById rejects stored non-V3 JSON without a read fallback", async () => {
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
      template_visibility: "public",
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
    expect(result.items[0]?.has_liked).toBe(true);
    expect(result.items[0]?.likes_count).toBe(2);
    expect(result.items[1]?.has_liked).toBe(false);
    expect(result.items[1]?.likes_count).toBe(0);
    expect(result.items[0]?.owner?.id).toBe(USER_ID);
    expect(result.items[1]?.owner?.id).toBe(OTHER_USER_ID);
  });

  it("getManyByIds includes contextually granted private plans and omits denied private plans", async () => {
    const ownPlan = createActivityPlanRow({ id: "11111111-1111-4111-8111-111111111111" });
    const grantedPlan = createActivityPlanRow({
      id: "22222222-2222-4222-8222-222222222222",
      profile_id: OTHER_USER_ID,
      template_visibility: "private",
    });
    const deniedPlan = createActivityPlanRow({
      id: "33333333-3333-4333-8333-333333333333",
      profile_id: OTHER_USER_ID,
      template_visibility: "private",
    });
    const systemPlan = createActivityPlanRow({
      id: "44444444-4444-4444-8444-444444444444",
      profile_id: null,
      is_system_template: true,
    });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [
          [grantedPlan, deniedPlan, systemPlan, ownPlan],
          [grantedPlan],
          [deniedPlan],
        ],
        "select:content_access_grants": [
          [
            {
              accessLevel: "read",
              sourceType: "event",
              sourceId: "55555555-5555-4555-8555-555555555555",
            },
          ],
          [],
        ],
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

  it("getUserPlansCount coerces the current user's count from the DB", async () => {
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[{ value: "3" }]],
      },
    });

    await expect(caller.getUserPlansCount()).resolves.toBe(3);
  });

  it("create stores computed metrics and allows missing description", async () => {
    const createdRow = createActivityPlanRow({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Created Plan",
      template_visibility: "public",
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
      template_visibility: "public",
    });

    const insertCall = callLog.find((call) => call.operation === "insert");
    expect(insertCall?.payload).toMatchObject({
      name: "Created Plan",
      description: null,
      profile_id: USER_ID,
      template_visibility: "public",
    });
    expect(result).toMatchObject({
      id: createdRow.id,
      content_type: "activity_plan",
      visibility: "public",
      primary_category: "bike",
    });
  });

  it("create rejects provider import provenance", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.create({
        name: "Spoofed import",
        structure: sampleStructure,
        import_provider: "fit",
        import_external_id: "spoofed-fit-id",
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);

    expect(callLog).toHaveLength(0);
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
      template_visibility: "public",
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
      template_visibility: "public",
      structure: sampleStructure,
    });

    const updateCall = callLog.find((call) => call.operation === "update");
    expect(updateCall?.payload).toMatchObject({
      name: "After Update",
      template_visibility: "public",
    });
    expect(result).toMatchObject({ id: existingRow.id, visibility: "public" });
  });

  it("update republishes every owned future planned event after a material plan change", async () => {
    const existingRow = createActivityPlanRow({ name: "Before Update" });
    const updatedRow = createActivityPlanRow({ name: "After Update" });
    const futureEvents = [{ id: "event-1" }, { id: "event-2" }];
    plannedWorkoutSyncState.enqueueProviderPlannedActivityJobs.mockResolvedValue({
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

    expect(plannedWorkoutSyncState.enqueueProviderPlannedActivityJobs).toHaveBeenCalledOnce();
    expect(plannedWorkoutSyncState.enqueueProviderPlannedActivityJobs).toHaveBeenCalledWith(
      expect.anything(),
      { eventIds: ["event-1", "event-2"], operation: "publish" },
    );
    expect(result.plannedWorkoutSync).toMatchObject({ operation: "publish", success: true });
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

    expect(plannedWorkoutSyncState.enqueueProviderPlannedActivityJobs).not.toHaveBeenCalled();
    expect(callLog.filter((call) => call.table === "events")).toHaveLength(0);
  });

  it("rejects top-level category authority", async () => {
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

  it("update rejects provider import provenance", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.update({
        id: "66666666-6666-4666-8666-666666666666",
        import_provider: "zwo",
        import_external_id: "spoofed-zwo-id",
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);

    expect(callLog).toHaveLength(0);
  });

  it("delete removes an owned plan", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "delete:activity_plans": [[{ id: "77777777-7777-4777-8777-777777777777" }]],
      },
    });

    const result = await caller.delete({ id: "77777777-7777-4777-8777-777777777777" });

    expect(callLog.some((call) => call.operation === "delete")).toBe(true);
    expect(result).toEqual({ success: true, plannedWorkoutSync: null, wahooSync: null });
  });

  it("delete enqueues unsync for linked future planned events before allowing FK set-null", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    const eventRows = [{ id: "event-1" }, { id: "event-2" }];
    plannedWorkoutSyncState.enqueueProviderPlannedActivityJobs.mockResolvedValue({
      affectedCount: 2,
      operation: "unsync",
      queued: true,
      success: true,
    });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "select:events": [eventRows],
        "delete:activity_plans": [[{ id: "77777777-7777-4777-8777-777777777777" }]],
      },
    });

    const result = await caller.delete({ id: "77777777-7777-4777-8777-777777777777" });

    expect(plannedWorkoutSyncState.enqueueProviderPlannedActivityJobs).toHaveBeenCalledWith(
      expect.anything(),
      { eventIds: ["event-1", "event-2"], operation: "unsync" },
    );
    expect(callLog.some((call) => call.operation === "delete")).toBe(true);
    expect(result.plannedWorkoutSync).toMatchObject({ operation: "unsync", success: true });
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
    expect(plannedWorkoutSyncState.enqueueProviderPlannedActivityJobs).not.toHaveBeenCalled();
  });

  it("delete keeps the plan when unsync enqueue reports failure", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    plannedWorkoutSyncState.enqueueProviderPlannedActivityJobs.mockResolvedValue({
      affectedCount: 1,
      error: "provider queue unavailable",
      operation: "unsync",
      queued: false,
      success: false,
    });
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
      message: "Activity plan cannot be deleted until linked device workouts can be unsynced",
    } as Partial<TRPCError>);

    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(0);
  });

  it("delete keeps the plan when unsync enqueue throws", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    plannedWorkoutSyncState.enqueueProviderPlannedActivityJobs.mockRejectedValue(
      new Error("provider queue unavailable"),
    );
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
      message: "Activity plan cannot be deleted until linked device workouts can be unsynced",
    } as Partial<TRPCError>);

    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(0);
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
      template_visibility: "public",
      name: "Shared Activity",
    });
    const duplicatedRow = createActivityPlanRow({
      id: "99999999-8888-4888-8888-888888888888",
      profile_id: USER_ID,
      name: "Shared Activity (Copy)",
      template_visibility: "private",
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
      template_visibility: "private",
      import_provider: null,
      import_external_id: null,
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

  it("importFromFitTemplate updates an existing imported plan", async () => {
    const existingRow = createActivityPlanRow({
      id: "12121212-1212-4212-8212-121212121212",
      import_provider: "fit",
      import_external_id: "fit-template-1",
    });
    const updatedRow = createActivityPlanRow({
      id: existingRow.id,
      name: "Updated FIT",
      import_provider: "fit",
      import_external_id: "fit-template-1",
    });
    const { caller, callLog } = createCaller({
      state: {
        "insert:activity_plans": [[updatedRow]],
      },
    });

    const result = await caller.importFromFitTemplate({
      external_id: "fit-template-1",
      name: "Updated FIT",
      structure: sampleStructure,
    });

    const upsertCall = callLog.find((call) => call.operation === "insert");
    expect(upsertCall?.payload).toMatchObject({
      name: "Updated FIT",
      import_provider: "fit",
      import_external_id: "fit-template-1",
      template_visibility: "private",
    });
    expect(upsertCall?.conflict).toMatchObject({
      target: [
        activityPlans.profile_id,
        activityPlans.import_provider,
        activityPlans.import_external_id,
      ],
      targetWhere: expect.anything(),
      set: {
        name: "Updated FIT",
        import_provider: "fit",
        import_external_id: "fit-template-1",
      },
    });
    expect(callLog.filter((call) => call.operation === "select")).toHaveLength(0);
    expect(callLog.filter((call) => call.operation === "update")).toHaveLength(0);
    expect(result).toMatchObject({
      action: "updated",
      item: { id: existingRow.id, content_type: "activity_plan" },
    });
  });

  it("importFromZwoTemplate creates a new imported plan when none exists", async () => {
    const { caller, callLog } = createCaller({
      state: {
        "insert:activity_plans": [
          (payload) => [
            createActivityPlanRow({
              ...(payload as Record<string, unknown>),
              name: "Created ZWO",
              import_provider: "zwo",
              import_external_id: "zwo-template-1",
            }),
          ],
        ],
      },
    });

    const result = await caller.importFromZwoTemplate({
      external_id: "zwo-template-1",
      name: "Created ZWO",
      structure: sampleStructure,
    });

    const insertCall = callLog.find((call) => call.operation === "insert");
    expect(insertCall?.payload).toMatchObject({
      name: "Created ZWO",
      import_provider: "zwo",
      import_external_id: "zwo-template-1",
      template_visibility: "private",
      profile_id: USER_ID,
    });
    expect(result).toMatchObject({
      action: "created",
      item: { content_type: "activity_plan" },
    });
  });
});

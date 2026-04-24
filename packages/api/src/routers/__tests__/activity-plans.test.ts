import { activityPlans, likes, profiles } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { estimationState } = vi.hoisted(() => ({
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
      estimator_version: "2026-04-derived-metrics-v1",
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
        estimator_version: "2026-04-derived-metrics-v1",
      })),
    ),
    computePlanMetrics: vi.fn(async () => ({
      estimated_tss: 88,
      estimated_duration_seconds: 3600,
      estimated_distance_meters: 12000,
    })),
    createEventReadRepository: vi.fn(() => ({ kind: "event-read-repository" })),
  },
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

import { activityPlansRouter } from "../activity-plans";

type MockTableName = "activity_plans" | "likes" | "profiles";
type MockOperation = "select" | "insert" | "update" | "delete";

type MockDbState = Partial<Record<`${MockOperation}:${MockTableName}`, unknown[][]>>;

type DbCall = {
  operation: MockOperation;
  table: MockTableName;
  payload?: unknown;
};

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

const sampleStructure: any = {
  version: 2,
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
};

function createActivityPlanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    idx: 0,
    created_at: new Date("2026-03-01T10:00:00.000Z"),
    updated_at: new Date("2026-03-01T10:00:00.000Z"),
    profile_id: USER_ID,
    route_id: null,
    name: "Tempo Builder",
    description: "Structured workout",
    notes: "Bring bottles",
    activity_category: "bike",
    structure: sampleStructure,
    version: "1.0",
    template_visibility: "private",
    import_provider: null,
    import_external_id: null,
    is_system_template: false,
    likes_count: null,
    is_public: false,
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

  if (table === profiles) {
    return "profiles";
  }

  throw new Error(`Unsupported table in activity-plans test mock: ${String(table)}`);
}

function createDbMock(state: MockDbState = {}) {
  const callLog: DbCall[] = [];
  const counters = new Map<string, number>();

  const nextRows = (operation: MockOperation, table: MockTableName) => {
    const key = `${operation}:${table}` as const;
    const entries = state[key] ?? [];
    const index = counters.get(key) ?? 0;
    counters.set(key, index + 1);
    return entries[index] ?? entries[entries.length - 1] ?? [];
  };

  const createSelectBuilder = (table: MockTableName) => {
    const builder: any = {
      where: () => builder,
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
          callLog.push({ operation: "select", table: tableName });
          return createSelectBuilder(tableName);
        },
      }),
      insert: (table: unknown) => {
        const tableName = resolveTableName(table);
        return {
          values: (payload: unknown) => {
            callLog.push({ operation: "insert", table: tableName, payload });
            return {
              returning: async () => nextRows("insert", tableName),
            };
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
        "select:likes": [[{ entity_id: firstPlan.id }]],
        "select:profiles": [[createProfileRow()]],
      },
    });

    const result = await caller.list({ includeOwnOnly: true, limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: firstPlan.id,
      has_liked: true,
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
        ],
      },
    });

    await expect(
      caller.getById({ id: "99999999-9999-4999-8999-999999999999" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } as Partial<TRPCError>);
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

  it("getManyByIds preserves input order for accessible plans", async () => {
    const ownPlan = createActivityPlanRow({ id: "11111111-1111-4111-8111-111111111111" });
    const publicPlan = createActivityPlanRow({
      id: "22222222-2222-4222-8222-222222222222",
      profile_id: OTHER_USER_ID,
      template_visibility: "public",
      is_public: true,
    });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[publicPlan, ownPlan]],
        "select:likes": [[{ entity_id: ownPlan.id }]],
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
    expect(result.items[1]?.has_liked).toBe(false);
    expect(result.items[0]?.owner?.id).toBe(USER_ID);
    expect(result.items[1]?.owner?.id).toBe(OTHER_USER_ID);
  });

  it("getUserPlansCount coerces the current user's count from the DB", async () => {
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[{ value: "3" }]],
      },
    });

    await expect(caller.getUserPlansCount()).resolves.toBe(3);
  });

  it("create stores computed metrics and returns identity fields", async () => {
    const createdRow = createActivityPlanRow({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Created Plan",
      template_visibility: "public",
      is_public: true,
    });
    const { caller, callLog } = createCaller({
      state: {
        "insert:activity_plans": [[createdRow]],
      },
    });

    const result = await caller.create({
      name: "Created Plan",
      activity_category: "bike",
      description: "Built from test",
      notes: "Hydrate",
      structure: sampleStructure,
      template_visibility: "public",
    });

    const insertCall = callLog.find((call) => call.operation === "insert");
    expect(insertCall?.payload).toMatchObject({
      name: "Created Plan",
      profile_id: USER_ID,
      template_visibility: "public",
      is_public: true,
    });
    expect(result).toMatchObject({
      id: createdRow.id,
      content_type: "activity_plan",
      visibility: "public",
    });
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
      is_public: true,
    });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[existingRow]],
        "update:activity_plans": [[updatedRow]],
      },
    });

    const result = await caller.update({
      id: existingRow.id,
      name: "After Update",
      template_visibility: "public",
      structure: sampleStructure,
    });

    const updateCall = callLog.find((call) => call.operation === "update");
    expect(updateCall?.payload).toMatchObject({
      name: "After Update",
      template_visibility: "public",
      is_public: true,
    });
    expect(result).toMatchObject({ id: existingRow.id, visibility: "public" });
  });

  it("delete removes an owned plan", async () => {
    const { caller, callLog } = createCaller({
      state: {
        "delete:activity_plans": [[{ id: "77777777-7777-4777-8777-777777777777" }]],
      },
    });

    const result = await caller.delete({ id: "77777777-7777-4777-8777-777777777777" });

    expect(callLog.some((call) => call.operation === "delete")).toBe(true);
    expect(result).toEqual({ success: true });
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
      is_public: true,
      name: "Shared Workout",
    });
    const duplicatedRow = createActivityPlanRow({
      id: "99999999-8888-4888-8888-888888888888",
      profile_id: USER_ID,
      name: "Shared Workout (Copy)",
      template_visibility: "private",
      is_public: false,
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
      name: "Shared Workout (Copy)",
      profile_id: USER_ID,
      template_visibility: "private",
      import_provider: null,
      import_external_id: null,
      is_public: false,
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
        "select:activity_plans": [[existingRow]],
        "update:activity_plans": [[updatedRow]],
      },
    });

    const result = await caller.importFromFitTemplate({
      external_id: "fit-template-1",
      name: "Updated FIT",
      activity_category: "bike",
      structure: sampleStructure,
    });

    const updateCall = callLog.find((call) => call.operation === "update");
    expect(updateCall?.payload).toMatchObject({
      name: "Updated FIT",
      import_provider: "fit",
      import_external_id: "fit-template-1",
      template_visibility: "private",
    });
    expect(result).toMatchObject({
      action: "updated",
      item: { id: existingRow.id, content_type: "activity_plan" },
    });
  });

  it("importFromZwoTemplate creates a new imported plan when none exists", async () => {
    const createdRow = createActivityPlanRow({
      id: "13131313-1313-4313-8313-131313131313",
      name: "Created ZWO",
      import_provider: "zwo",
      import_external_id: "zwo-template-1",
    });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[]],
        "insert:activity_plans": [[createdRow]],
      },
    });

    const result = await caller.importFromZwoTemplate({
      external_id: "zwo-template-1",
      name: "Created ZWO",
      activity_category: "bike",
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
      item: { id: createdRow.id, content_type: "activity_plan" },
    });
  });
});

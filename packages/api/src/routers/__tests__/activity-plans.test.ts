import {
  activityPlanAuthoringIssueCodes,
  activityPlanStructureSchema,
} from "@repo/core/activity-plan";
import {
  activityPlans,
  comments,
  contentAccessGrants,
  events,
  follows,
  groupEvents,
  likes,
  plannedSessions,
  profiles,
} from "@repo/db";
import type { TRPCError } from "@trpc/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { estimationState, plannedActivitySyncState } = vi.hoisted(() => ({
  estimationState: {
    estimateActivityPlan: vi.fn(async (plan: Record<string, unknown>) => ({
      ...plan,
      prescriptionQuantification: null,
    })),
    estimateActivityPlans: vi.fn(async (plans: Array<Record<string, unknown>>) =>
      plans.map((plan) => ({
        ...plan,
        prescriptionQuantification: null,
      })),
    ),
  },
  plannedActivitySyncState: {
    enqueueGarminActivityPlanRefreshAfterMutation: vi.fn(),
    enqueueWahooActivityPlanRefreshAfterMutation: vi.fn(),
    enqueueWahooPlannedActivityJobs: vi.fn(),
  },
}));
vi.mock("../../application/events", () => ({
  enqueueWahooPlannedActivityJobs: plannedActivitySyncState.enqueueWahooPlannedActivityJobs,
}));
vi.mock("../../lib/provider-sync/planned-activities", () => ({
  enqueueWahooActivityPlanRefreshAfterMutation:
    plannedActivitySyncState.enqueueWahooActivityPlanRefreshAfterMutation,
}));
vi.mock("../../infrastructure/repositories/drizzle-garmin-training-sync-repository", () => ({
  enqueueGarminActivityPlanRefreshAfterMutation:
    plannedActivitySyncState.enqueueGarminActivityPlanRefreshAfterMutation,
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
import { createRouterCaller } from "../../test/router";
import { activityPlansRouter } from "../activity-plans";

type MockTableName =
  | "activity_plans"
  | "comments"
  | "content_access_grants"
  | "events"
  | "follows"
  | "group_events"
  | "likes"
  | "planned_sessions"
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
type SampleStructure = {
  version: 5;
  activity_category: "bike" | "run";
  items: [SampleStep, ...SampleStep[]];
};
type SampleStep = {
  type: "step";
  id: string;
  name?: string;
  duration:
    | {
        type: "time";
        seconds: number;
      }
    | {
        type: "distance";
        meters: number;
      }
    | {
        type: "repetitions";
        count: number;
      }
    | {
        type: "untilFinished";
      };
  targets: Array<{
    type: "%FTP" | "%MaxHR" | "RPE" | "cadence" | "speed";
    intensity: number;
  }>;
  purpose?: string;
  description?: string;
};
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const pgDialect = new PgDialect();
const sampleStructure: SampleStructure = {
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "44444444-4444-4444-8444-444444444444",
      name: "Ride",
      duration: { type: "time", seconds: 1800 },
      targets: [{ type: "%FTP", intensity: 75 }],
    },
  ],
};
const purposeFreeSampleStructure = activityPlanStructureSchema.parse(sampleStructure);
const sampleAdaptation = {
  controls: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      key: "repeat_count",
      label: "Repeat count",
      kind: "interval_repetitions" as const,
      range: { minimum: 1, default: 1, maximum: 2, increment: 1 },
      targets: [
        {
          type: "interval_repetitions" as const,
          activitySegmentId: sampleStructure.items[0].id,
          intervalId: sampleStructure.items[0].id,
        },
      ],
    },
  ],
};
function createCompositionStructure(activity_category: "bike" | "run", segmentCount = 1) {
  return {
    version: 5,
    activity_category,
    items: Array.from({ length: segmentCount }, (_, index) => {
      const step = structuredClone(sampleStructure.items[0]);
      const suffix = (index + 1).toString().padStart(12, "0");
      step.id = `30000000-0000-4000-8000-${suffix}`;
      step.targets =
        activity_category === "bike"
          ? [{ type: "%FTP", intensity: 75 }]
          : [{ type: "%MaxHR", intensity: 70 }];
      return step;
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
    training_intent: "general_maintenance",
    structure: sampleStructure,
    structure_hash: activityPlanStructureHash(sampleStructure),
    semantic_hash: `v2:sha256:${"a".repeat(64)}`,
    revision: 1,
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
  if (table === comments) {
    return "comments";
  }
  if (table === likes) {
    return "likes";
  }
  if (table === events) {
    return "events";
  }
  if (table === follows) {
    return "follows";
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
  if (table === plannedSessions) {
    return "planned_sessions";
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
  type SelectBuilder = Promise<MockRows> & {
    where: (condition: unknown) => SelectBuilder;
    groupBy: () => Promise<MockRows>;
    orderBy: () => SelectBuilder;
    limit: () => SelectBuilder;
    for: () => SelectBuilder;
    offset: () => Promise<MockRows>;
  };
  const createSelectBuilder = (table: MockTableName, call: DbCall): SelectBuilder => {
    let builder: SelectBuilder;
    const result = new Promise<MockRows>((resolve) => {
      queueMicrotask(() => resolve(nextRows("select", table)));
    });
    builder = Object.assign(result, {
      where: (condition: unknown) => {
        call.where = condition;
        return builder;
      },
      groupBy: async () => nextRows("select", table),
      orderBy: () => builder,
      limit: () => builder,
      for: () => builder,
      offset: async () => nextRows("select", table),
    });
    return builder;
  };
  type DbMock = {
    select: () => {
      from: (table: unknown) => SelectBuilder;
    };
    insert: (table: unknown) => {
      values: (payload: unknown) => {
        onConflictDoUpdate: (conflict: unknown) => unknown;
        returning: () => Promise<MockRows>;
      };
    };
    update: (table: unknown) => {
      set: (payload: unknown) => {
        where: (condition: unknown) => {
          returning: () => Promise<MockRows>;
        };
      };
    };
    delete: (table: unknown) => {
      where: () => {
        returning: () => Promise<MockRows>;
      };
    };
    transaction: (callback: (tx: DbMock) => Promise<unknown>) => Promise<unknown>;
  };
  const db: DbMock = {
    transaction: async () => undefined,
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
          const call: DbCall = { operation: "update", table: tableName, payload };
          callLog.push(call);
          return {
            where: (condition: unknown) => {
              call.where = condition;
              return { returning: async () => nextRows("update", tableName) };
            },
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
  db.transaction = async (callback) => callback(db);
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
  const caller = createRouterCaller(activityPlansRouter, { db, userId });
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
  it("rejects stale revisions after a training-intent-only edit with the same structure hash", async () => {
    const row = createActivityPlanRow({ revision: 8 });
    const { caller, callLog } = createCaller({ state: { "select:activity_plans": [[row]] } });
    await expect(
      caller.update({
        id: row.id,
        expectedStructureHash: row.structure_hash,
        expectedRevision: 7,
        training_intent: "aerobic_base" as const,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "STALE_ACTIVITY_PLAN_REVISION" });
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });
  it("requires the client revision before reading or writing", async () => {
    const { caller, callLog } = createCaller();
    await expect(
      caller.update({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expectedStructureHash: activityPlanStructureHash(sampleStructure),
        name: "Missing revision",
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(callLog).toEqual([]);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    plannedActivitySyncState.enqueueWahooActivityPlanRefreshAfterMutation.mockResolvedValue(null);
  });
  const invalidSteps = [
    {
      label: "open ended",
      change: { duration: { type: "untilFinished" } },
      code: activityPlanAuthoringIssueCodes.durationNotPermitted,
    },
    {
      label: "bike repetitions",
      change: {
        duration: { type: "repetitions", count: 5 },
        targets: [{ type: "RPE", intensity: 5 }],
      },
      code: activityPlanAuthoringIssueCodes.durationNotPermitted,
    },
    {
      label: "cadence alone",
      change: { targets: [{ type: "cadence", intensity: 90 }] },
      code: activityPlanAuthoringIssueCodes.missingIntensity,
    },
    {
      label: "RPE quarter point",
      change: { targets: [{ type: "RPE", intensity: 5.25 }] },
      code: activityPlanAuthoringIssueCodes.invalidRpe,
    },
    {
      label: "over max HR",
      change: { targets: [{ type: "%MaxHR", intensity: 101 }] },
      code: activityPlanAuthoringIssueCodes.maxHrExceeded,
    },
    {
      label: "zero distance speed",
      change: {
        duration: { type: "distance", meters: 100 },
        targets: [{ type: "speed", intensity: 0 }],
      },
      code: activityPlanAuthoringIssueCodes.distanceSpeedNotPositive,
    },
  ];
  for (const operation of ["create", "update", "duplicate"] as const) {
    it.each(
      invalidSteps,
    )(`${operation} rejects $label with field diagnostics and no write`, async ({
      change,
      code,
    }) => {
      const structure = structuredClone(sampleStructure);
      Object.assign(structure.items[0], change);
      if (structure.items[0].purpose === undefined) delete structure.items[0].purpose;
      if (code === activityPlanAuthoringIssueCodes.distanceSpeedNotPositive)
        structure.activity_category = "run";
      expect(activityPlanStructureSchema.safeParse(structure).success).toBe(true);
      const row = createActivityPlanRow({
        structure,
        structure_hash: activityPlanStructureHash(structure),
      });
      const { caller, callLog } = createCaller({ state: { "select:activity_plans": [[row]] } });
      const call =
        operation === "create"
          ? caller.create({ name: "Invalid new plan", structure })
          : operation === "update"
            ? caller.update({
                id: row.id,
                expectedStructureHash: row.structure_hash,
                expectedRevision: row.revision,
                name: "Metadata-only save",
              })
            : caller.duplicate({ id: row.id });
      await expect(call).rejects.toMatchObject({
        code: "BAD_REQUEST",
        cause: {
          issues: expect.arrayContaining([
            expect.objectContaining({
              path: expect.arrayContaining(["structure", "items"]),
              params: expect.objectContaining({ activityPlanIssueCode: code }),
            }),
          ]),
        },
      });
      expect(
        callLog.some((entry) => entry.operation === "insert" || entry.operation === "update"),
      ).toBe(false);
    });
  }
  it("retains historical reads of plans that cannot be newly authored or cloned", async () => {
    const structure = structuredClone(sampleStructure);
    delete structure.items[0].purpose;
    structure.items[0].duration = { type: "untilFinished" };
    const row = createActivityPlanRow({
      structure,
      structure_hash: activityPlanStructureHash(structure),
    });
    const { caller } = createCaller({ state: { "select:activity_plans": [[row]] } });
    const result = await caller.getById({ id: row.id });
    expect(result.edit?.structure).toEqual(structure);
  });
  it("normalizes only explicitly submitted speed structures before persistence", async () => {
    const structure = structuredClone(sampleStructure);
    structure.activity_category = "run";
    structure.items[0].targets = [
      { type: "speed", intensity: 13.333333333333334 },
      { type: "cadence", intensity: 90 },
    ];
    const created = createActivityPlanRow({ structure });
    const { caller, callLog } = createCaller({
      state: {
        "select:profiles": [[createProfileRow()]],
        "insert:activity_plans": [[created]],
      },
    });
    await caller.create({ name: "Pace conversion", structure });
    expect(callLog.find((call) => call.operation === "insert")?.payload).toMatchObject({
      structure: expect.objectContaining({
        items: [
          expect.objectContaining({
            targets: [
              { type: "speed", intensity: 13.33 },
              { type: "cadence", intensity: 90 },
            ],
          }),
        ],
      }),
    });
  });
  it("normalizes an explicitly updated speed structure before hashing and persistence", async () => {
    const existing = createActivityPlanRow();
    const structure = structuredClone(sampleStructure);
    structure.activity_category = "run";
    structure.items[0].targets = [{ type: "speed", intensity: 13.333333333333334 }];
    const updated = createActivityPlanRow({ structure });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[existing]],
        "update:activity_plans": [[updated]],
      },
    });
    await caller.update({
      id: existing.id,
      expectedStructureHash: existing.structure_hash,
      expectedRevision: existing.revision,
      structure,
    });
    const payload = callLog.find((call) => call.operation === "update")?.payload;
    expect(payload).toMatchObject({
      structure: expect.objectContaining({
        items: [expect.objectContaining({ targets: [{ type: "speed", intensity: 13.33 }] })],
      }),
    });
    const structureHash = (
      payload as
        | {
            structure_hash?: unknown;
          }
        | undefined
    )?.structure_hash;
    expect(structureHash).not.toBe(activityPlanStructureHash(structure));
  });
  it("rejects a speed that would round to zero on update without writing", async () => {
    const existing = createActivityPlanRow();
    const structure = structuredClone(sampleStructure);
    structure.activity_category = "run";
    structure.items[0].targets = [{ type: "speed", intensity: 0.001 }];
    const { caller, callLog } = createCaller({
      state: { "select:activity_plans": [[existing]] },
    });
    await expect(
      caller.update({
        id: existing.id,
        expectedStructureHash: existing.structure_hash,
        expectedRevision: existing.revision,
        structure,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Speed must be at least 0.01 km/h.",
    });
    expect(callLog.some((entry) => entry.operation === "update")).toBe(false);
  });
  it.each([
    "create",
    "update",
  ] as const)("%s rejects removed adaptation input", async (operation) => {
    const row = createActivityPlanRow();
    const { caller, callLog } = createCaller({ state: { "select:activity_plans": [[row]] } });
    const call =
      operation === "create"
        ? caller.create({
            name: "No adaptation",
            structure: sampleStructure,
            adaptation: sampleAdaptation,
          } as never)
        : caller.update({
            id: row.id,
            expectedStructureHash: row.structure_hash,
            expectedRevision: row.revision,
            adaptation: sampleAdaptation,
          } as never);
    await expect(call).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      callLog.some((entry) => entry.operation === "insert" || entry.operation === "update"),
    ).toBe(false);
  });
  it("allows a complete repair of a historical document on update", async () => {
    const historical = structuredClone(sampleStructure);
    delete historical.items[0].purpose;
    const row = createActivityPlanRow({
      structure: historical,
      structure_hash: activityPlanStructureHash(historical),
    });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[row]],
        "update:activity_plans": [[createActivityPlanRow()]],
      },
    });
    await caller.update({
      id: row.id,
      expectedStructureHash: row.structure_hash,
      expectedRevision: row.revision,
      structure: purposeFreeSampleStructure,
    });
    expect(callLog.find((entry) => entry.operation === "update")?.payload).toMatchObject({
      structure: purposeFreeSampleStructure,
    });
  });
  it("maps intent-only effective-document failures to the API training_intent field", async () => {
    const row = createActivityPlanRow();
    const { caller, callLog } = createCaller({ state: { "select:activity_plans": [[row]] } });
    await expect(
      caller.update({
        id: row.id,
        expectedStructureHash: row.structure_hash,
        expectedRevision: row.revision,
        training_intent: "vo2max",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      cause: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: ["training_intent"],
            params: expect.objectContaining({
              activityPlanIssueCode: activityPlanAuthoringIssueCodes.incompatibleIntent,
            }),
          }),
        ]),
      },
    });
    expect(callLog.some((call) => call.operation === "update")).toBe(false);
  });
  it("fences the validated semantic revision atomically without changing the client's hash token", async () => {
    const row = createActivityPlanRow({ revision: 7 });
    const { caller, callLog } = createCaller({
      state: { "select:activity_plans": [[row]], "update:activity_plans": [[]] },
    });
    await expect(
      caller.update({
        id: row.id,
        expectedStructureHash: row.structure_hash,
        expectedRevision: row.revision,
        training_intent: "aerobic_base",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const update = callLog.find((entry) => entry.operation === "update");
    const query = pgDialect.sqlToQuery(update?.where as never);
    expect(query.sql).toContain('"activity_plans"."revision" =');
    expect(query.params).toContain(7);
    expect(query.params).toContain(row.structure_hash);
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
        expect.objectContaining({
          key: "common_load",
          status: "available",
          provenance: "estimated",
        }),
        expect.objectContaining({
          key: "objective_intensity",
          status: "available",
          value: 0.75,
          provenance: "estimated",
        }),
      ]),
    );
    expect(result.items[0]).not.toHaveProperty("common_load");
    expect(result.items[0]).not.toHaveProperty("duration_estimate");
    expect(result.items[0]).not.toHaveProperty("confidence");
    expect(result.items[0]).not.toHaveProperty("estimation_warnings");
    expect(result.nextCursor).toBe(`${firstPlan.created_at.toISOString()}_${firstPlan.id}`);
  });
  it("list accepts infinite-query direction metadata", async () => {
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[]],
      },
    });
    await expect(
      caller.list({ ownerScope: "all", limit: 25, direction: "forward" }),
    ).resolves.toMatchObject({
      items: [],
      nextCursor: undefined,
    });
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
      capabilities: { canRecord: true, canSchedule: false },
    });
    expect(result.items[0]?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "elapsed_duration",
          value: 1800,
          provenance: "authored",
        }),
        expect.objectContaining({ key: "common_load", provenance: "estimated" }),
      ]),
    );
    expect(result.items[0]?.structure).toEqual(publicPlan.structure);
    expect(result.items[0]).not.toHaveProperty("prescriptionQuantification");
    expect(JSON.stringify(result.items[0])).toMatch(/%FTP|targets|duration/i);
  });
  it("list omits malformed persisted plans without truncating pagination", async () => {
    const invalidStructure = structuredClone(sampleStructure);
    invalidStructure.items = [] as never;
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
    runStructure.items[0].targets = [{ type: "%MaxHR", intensity: 70 }];
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
      structure.items[0].targets =
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
      segments: createCompositionStructure("run", 2).items.map((block, index) => ({
        ...block,
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
        expectedRevision: 1,
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
      segments: createCompositionStructure("run", 3).items.map((block, index) => ({
        ...block,
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
  it("getById returns the authored prescription but omits owner-only fields for a public-plan viewer", async () => {
    const publicPlan = createActivityPlanRow({
      id: "99999999-9999-4999-8999-999999999998",
      profile_id: OTHER_USER_ID,
      content_visibility: "public",
      notes: "Hold RPE 8 for 20 minutes",
    });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[publicPlan]],
        "select:likes": [[]],
        "select:profiles": [
          [createProfileRow({ id: OTHER_USER_ID, username: "Other", avatar_url: null })],
        ],
      },
    });
    const result = await caller.getById({ id: publicPlan.id, personalize: true });
    expect(result.edit).toBeNull();
    expect(result.detail.structure).toEqual(publicPlan.structure);
    expect(result.detail.metrics).toEqual([
      expect.objectContaining({ key: "distance", status: "unavailable", provenance: null }),
      expect.objectContaining({
        key: "elapsed_duration",
        status: "available",
        value: 1800,
        provenance: "authored",
      }),
      expect.objectContaining({
        key: "common_load",
        status: "available",
        provenance: "estimated",
      }),
      expect.objectContaining({
        key: "objective_intensity",
        status: "available",
        value: 0.75,
        provenance: "estimated",
      }),
    ]);
    for (const key of ["prescriptionQuantification", "notes", "gpsRecordingEnabled"]) {
      expect(result.detail).not.toHaveProperty(key);
    }
    expect(JSON.stringify(result.detail)).toMatch(/RPE|targets|duration/i);
    expect(result.detail.capabilities.canRecord).toBe(true);
    expect(result.detail.structureHash).toMatch(/^v1:sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(result.detail.metrics)).not.toMatch(
      /athlete|thresholdEvidence|calibration|privateThresholdContext/i,
    );
    expect(estimationState.estimateActivityPlan).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: publicPlan.id }),
      expect.anything(),
      USER_ID,
      { personalize: false },
    );
  });
  it("roundtrips adaptive controls and training intent through owner edit, create, and update", async () => {
    const existing = createActivityPlanRow({
      training_intent: "aerobic_base",
    });
    const created = createActivityPlanRow({
      id: "55555555-5555-4555-8555-555555555556",
      training_intent: "aerobic_base",
    });
    const updated = createActivityPlanRow({
      id: existing.id,
      name: "Retained adaptive plan",
      training_intent: "aerobic_base",
    });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[existing], [existing]],
        "insert:activity_plans": [[created]],
        "update:activity_plans": [[updated]],
      },
    });
    const detail = await caller.getById({ id: existing.id });
    expect(detail.edit).toMatchObject({
      trainingIntent: "aerobic_base",
    });
    await caller.create({
      name: "Adaptive plan",
      structure: sampleStructure,
      training_intent: "aerobic_base",
    });
    await caller.update({
      id: existing.id,
      expectedStructureHash: existing.structure_hash,
      expectedRevision: existing.revision,
      name: "Retained adaptive plan",
      training_intent: "aerobic_base",
    });
    const insert = callLog.find((call) => call.operation === "insert");
    const update = callLog.find((call) => call.operation === "update");
    expect(insert?.payload).toMatchObject({
      training_intent: "aerobic_base",
    });
    expect(update?.payload).toMatchObject({
      training_intent: "aerobic_base",
    });
  });
  it("passes an explicit default-off personalization choice to detail estimation", async () => {
    const plan = createActivityPlanRow();
    const state: MockDbState = {
      "select:activity_plans": [[plan]],
      "select:likes": [[]],
      "select:profiles": [[createProfileRow()]],
    };
    const { caller: defaultCaller } = createCaller({ state });
    await defaultCaller.getById({ id: plan.id });
    expect(estimationState.estimateActivityPlan).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: plan.id }),
      expect.anything(),
      USER_ID,
      { personalize: false },
    );
    const { caller: personalizedCaller } = createCaller({ state });
    await personalizedCaller.getById({ id: plan.id, personalize: true });
    expect(estimationState.estimateActivityPlan).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: plan.id }),
      expect.anything(),
      USER_ID,
      { personalize: true },
    );
  });
  it("getById rejects unexpected input fields", async () => {
    const { caller } = createCaller();
    await expect(
      caller.getById({
        id: "99999999-9999-4999-8999-999999999999",
        extra: true,
      } as never),
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
    expect(result.items[0]).toHaveProperty("structure");
    expect(result.items[0]).toHaveProperty("prescriptionQuantification");
    expect(result.items[1]?.structure).toEqual(publicPlan.structure);
    expect(result.items[1]).not.toHaveProperty("prescriptionQuantification");
    expect(result.items[1]?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "elapsed_duration",
          value: 1800,
          provenance: "authored",
        }),
        expect.objectContaining({ key: "common_load", provenance: "estimated" }),
      ]),
    );
    expect(JSON.stringify(result.items[1])).toMatch(/%FTP|targets|duration/i);
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
      notes: null,
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
  it("round-trips explicit interval-name overrides through create, clear, and duplicate", async () => {
    const namedStructure = activityPlanStructureSchema.parse({
      ...sampleStructure,
      items: [{ ...sampleStructure.items[0], name: "  Main set  " }],
    });
    const clearedStructure = activityPlanStructureSchema.parse({
      ...namedStructure,
      items: [
        {
          type: "step",
          id: sampleStructure.items[0].id,
          duration: sampleStructure.items[0].duration,
          targets: sampleStructure.items[0].targets,
        },
      ],
    });
    const createdRow = createActivityPlanRow({ structure: namedStructure });
    const clearedRow = createActivityPlanRow({
      revision: 2,
      structure: clearedStructure,
      structure_hash: activityPlanStructureHash(clearedStructure),
    });
    const duplicatedRow = createActivityPlanRow({ structure: namedStructure });
    const { caller, callLog } = createCaller({
      state: {
        "insert:activity_plans": [[createdRow], [duplicatedRow]],
        "select:activity_plans": [[createdRow], [createdRow]],
        "update:activity_plans": [[clearedRow]],
      },
    });
    await caller.create({ name: "Named", structure: namedStructure });
    await caller.update({
      id: createdRow.id,
      expectedStructureHash: createdRow.structure_hash,
      expectedRevision: createdRow.revision,
      structure: clearedStructure,
    });
    await caller.duplicate({ id: createdRow.id });
    const inserts = callLog.filter((call) => call.operation === "insert");
    expect(
      (
        inserts[0]?.payload as {
          structure?: typeof namedStructure;
        }
      ).structure?.items[0],
    ).toMatchObject({ type: "step", name: "  Main set  " });
    expect(
      (
        callLog.find((call) => call.operation === "update")?.payload as {
          structure?: typeof clearedStructure;
        }
      ).structure?.items[0],
    ).not.toHaveProperty("name");
    expect(
      (
        inserts[1]?.payload as {
          structure?: typeof namedStructure;
        }
      ).structure?.items[0],
    ).toMatchObject({ type: "step", name: "  Main set  " });
  });
  it("does not merge removed plan notes into the description", async () => {
    const createdRow = createActivityPlanRow();
    const { caller, callLog } = createCaller({
      state: { "insert:activity_plans": [[createdRow]] },
    });
    const description = "a".repeat(1000);
    const notes = "b".repeat(2000);
    await caller.create({ name: "Legacy text", description, notes, structure: sampleStructure });
    expect(callLog.find((call) => call.operation === "insert")?.payload).toMatchObject({
      description,
      notes: null,
    });
  });
  it("rejects new descriptions beyond the canonical plan limit", async () => {
    const { caller, callLog } = createCaller();
    await expect(
      caller.create({
        name: "Too long",
        description: "a".repeat(3010),
        structure: sampleStructure,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
    expect(callLog).toHaveLength(0);
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
      expectedRevision: existingRow.revision,
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
  it("rejects removed V3 step text fields", () => {
    const structure = structuredClone(sampleStructure);
    structure.items[0].description = "Keep cadence smooth";
    expect(activityPlanStructureSchema.safeParse(structure).success).toBe(false);
  });
  it("increments the plan revision only when the prescription structure changes", async () => {
    const existingRow = createActivityPlanRow({
      revision: 4,
      structure: purposeFreeSampleStructure,
      structure_hash: activityPlanStructureHash(purposeFreeSampleStructure),
    });
    const changedStructure = activityPlanStructureSchema.parse(
      createCompositionStructure("bike", 2),
    );
    const changedRow = createActivityPlanRow({
      revision: 5,
      structure: changedStructure,
      structure_hash: activityPlanStructureHash(changedStructure),
    });
    const metadataRow = createActivityPlanRow({ revision: 4, notes: "Updated notes" });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[existingRow], [existingRow]],
        "update:activity_plans": [[changedRow], [metadataRow]],
      },
    });
    const changed = await caller.update({
      id: existingRow.id,
      expectedStructureHash: existingRow.structure_hash,
      expectedRevision: existingRow.revision,
      structure: changedStructure,
    });
    await caller.update({
      id: existingRow.id,
      expectedStructureHash: existingRow.structure_hash,
      expectedRevision: existingRow.revision,
      notes: "Updated notes",
    });
    const updates = callLog.filter(
      (call) => call.operation === "update" && call.table === "activity_plans",
    );
    expect(updates[0]?.payload).toHaveProperty("revision");
    expect(updates[1]?.payload).not.toHaveProperty("revision");
    expect(changed).toMatchObject({ activityPlanRevision: 5 });
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
        expectedRevision: existingRow.revision,
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
        expectedRevision: ownedByAnotherAthlete.revision,
        name: "Attempted non-owner edit",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" } as Partial<TRPCError>);
    await expect(caller.delete({ id: ownedByAnotherAthlete.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    } as Partial<TRPCError>);
    expect(callLog.some((call) => call.operation === "update" || call.operation === "delete")).toBe(
      false,
    );
    expect(
      plannedActivitySyncState.enqueueWahooActivityPlanRefreshAfterMutation,
    ).not.toHaveBeenCalled();
  });
  it("queues a durable provider refresh for referenced upcoming sessions after an edit", async () => {
    const existingRow = createActivityPlanRow({ name: "Before Update" });
    const updatedRow = createActivityPlanRow({ name: "After Update" });
    plannedActivitySyncState.enqueueWahooActivityPlanRefreshAfterMutation.mockResolvedValue({
      affectedCount: 2,
      operation: "publish",
      queued: true,
      success: true,
    });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[existingRow]],
        "update:activity_plans": [[updatedRow]],
      },
    });
    const result = await caller.update({
      id: existingRow.id,
      expectedStructureHash: existingRow.structure_hash,
      expectedRevision: existingRow.revision,
      name: "After Update",
    });
    expect(
      plannedActivitySyncState.enqueueWahooActivityPlanRefreshAfterMutation,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        activityPlanId: existingRow.id,
        db: expect.anything(),
        profileId: USER_ID,
        transaction: expect.anything(),
        upcomingOnOrAfter: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    expect(result.name).toBe("After Update");
  });
  it("uses the owner's planning-calendar date as the Wahoo refresh cutoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T00:30:00.000Z"));
    try {
      const existingRow = createActivityPlanRow({ name: "Before Update" });
      const updatedRow = createActivityPlanRow({ name: "After Update" });
      const { caller } = createCaller({
        state: {
          "select:activity_plans": [[existingRow]],
          "select:profiles": [[{ planningTimezone: "America/Los_Angeles" }]],
          "update:activity_plans": [[updatedRow]],
        },
      });

      await caller.update({
        id: existingRow.id,
        expectedStructureHash: existingRow.structure_hash,
        expectedRevision: existingRow.revision,
        name: "After Update",
      });

      expect(
        plannedActivitySyncState.enqueueWahooActivityPlanRefreshAfterMutation,
      ).toHaveBeenCalledWith(expect.objectContaining({ upcomingOnOrAfter: "2026-10-22" }));
    } finally {
      vi.useRealTimers();
    }
  });
  it("queues a refresh for every successful edit so provider presentation follows the current plan", async () => {
    const existingRow = createActivityPlanRow();
    const updatedRow = createActivityPlanRow({ notes: "Updated notes" });
    const { caller } = createCaller({
      state: {
        "select:activity_plans": [[existingRow], [updatedRow]],
        "update:activity_plans": [[updatedRow], [updatedRow]],
      },
    });
    await caller.update({
      id: existingRow.id,
      expectedStructureHash: existingRow.structure_hash,
      expectedRevision: existingRow.revision,
      notes: "Updated notes",
    });
    await caller.update({
      id: existingRow.id,
      expectedStructureHash: existingRow.structure_hash,
      expectedRevision: existingRow.revision,
      name: existingRow.name,
    });
    expect(
      plannedActivitySyncState.enqueueWahooActivityPlanRefreshAfterMutation,
    ).toHaveBeenCalledTimes(2);
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
        expectedRevision: 1,
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
        expectedRevision: 1,
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
        "select:group_events": [[]],
        "select:planned_sessions": [[]],
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
    const sessionRows = Array.from({ length: 101 }, (_, index) => ({ id: `session-${index + 1}` }));
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "select:group_events": [[]],
        "select:planned_sessions": [sessionRows],
      },
    });
    await expect(
      caller.delete({ id: "77777777-7777-4777-8777-777777777777" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Activity plans with planned-session history cannot be deleted",
    } as Partial<TRPCError>);
    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(0);
    expect(plannedActivitySyncState.enqueueWahooPlannedActivityJobs).not.toHaveBeenCalled();
  });
  it("delete rejects a cross-owner planned-session reference without filtering by session owner", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "select:group_events": [[]],
        "select:planned_sessions": [[{ id: "session-1", profile_id: OTHER_USER_ID }]],
      },
    });
    await expect(caller.delete({ id: ownedPlan.id })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Activity plans with planned-session history cannot be deleted",
    } as Partial<TRPCError>);
    const sessionQuery = callLog.find(
      (call) => call.table === "planned_sessions" && call.where,
    )?.where;
    expect(sessionQuery).toBeDefined();
    expect(pgDialect.sqlToQuery(sessionQuery as never).sql).not.toContain(
      '"planned_sessions"."profile_id"',
    );
    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(0);
  });
  it("delete rejects a group-event reference and leaves the plan intact", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "select:group_events": [[{ id: "group-event-1" }]],
      },
    });
    await expect(caller.delete({ id: ownedPlan.id })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Activity plans with planned-session history cannot be deleted",
    } as Partial<TRPCError>);
    expect(callLog.some((call) => call.table === "group_events")).toBe(true);
    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(0);
  });
  it("delete rejects a linked planned-session reference before the FK can fail", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "select:group_events": [[]],
        "select:planned_sessions": [[{ id: "planned-session-1" }]],
      },
    });
    await expect(caller.delete({ id: ownedPlan.id })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Activity plans with planned-session history cannot be deleted",
    } as Partial<TRPCError>);
    expect(callLog.some((call) => call.table === "planned_sessions")).toBe(true);
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
        "select:group_events": [[]],
        "select:planned_sessions": [[{ id: "session-1" }]],
      },
    });
    await expect(
      caller.delete({ id: "77777777-7777-4777-8777-777777777777" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Activity plans with planned-session history cannot be deleted",
    } as Partial<TRPCError>);
    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(0);
  });
  it("delete surfaces an unexpected transactional failure without reporting success", async () => {
    const ownedPlan = createActivityPlanRow({ id: "77777777-7777-4777-8777-777777777777" });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[ownedPlan]],
        "select:group_events": [[]],
        "select:planned_sessions": [[]],
        "delete:activity_plans": [[]],
      },
    });
    await expect(caller.delete({ id: "77777777-7777-4777-8777-777777777777" })).rejects.toThrow(
      "Activity plan changed during deletion",
    );
    expect(callLog.filter((call) => call.operation === "delete")).toHaveLength(3);
  });
  it("delete rejects unexpected input fields", async () => {
    const { caller } = createCaller();
    await expect(
      caller.delete({
        id: "77777777-7777-4777-8777-777777777777",
        extra: true,
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
  });
  it("duplicate preserves full private content only for the owner and serializes the persisted row", async () => {
    const originalRow = createActivityPlanRow({
      id: "88888888-8888-4888-8888-888888888888",
      name: "Private Activity",
      description: "Owner-only description",
      notes: "Owner-only notes and targets",
    });
    const duplicatedRow = createActivityPlanRow({
      id: "99999999-8888-4888-8888-888888888888",
      created_at: new Date("2026-08-19T12:00:00.000Z"),
      updated_at: new Date("2026-08-19T12:00:01.000Z"),
      profile_id: USER_ID,
      name: "Private Activity Copy",
      description: originalRow.description,
      notes: originalRow.notes,
      structure: purposeFreeSampleStructure,
      content_visibility: "private",
    });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[originalRow]],
        "insert:activity_plans": [[duplicatedRow]],
      },
    });
    const result = await caller.duplicate({
      id: originalRow.id,
      newName: " Private Activity Copy ",
    });
    const insertCall = callLog.find((call) => call.operation === "insert");
    expect(insertCall?.payload).toMatchObject({
      name: "Private Activity Copy",
      description: "Owner-only description",
      notes: "Owner-only notes and targets",
      structure: purposeFreeSampleStructure,
      profile_id: USER_ID,
      content_visibility: "private",
      is_system_template: false,
    });
    expect(result).toMatchObject({
      id: duplicatedRow.id,
      created_at: "2026-08-19T12:00:00.000Z",
      updated_at: "2026-08-19T12:00:01.000Z",
      description: "Owner-only description",
      notes: "Owner-only notes and targets",
      structure: purposeFreeSampleStructure,
      profile_id: USER_ID,
      content_visibility: "private",
      visibility: "private",
      is_system_template: false,
    });
    expect(JSON.stringify(result)).toMatch(/%FTP|"duration"|"targets"|Owner-only notes/);
  });
  it("duplicate clearly denies a readable public plan without copying private content", async () => {
    const originalRow = createActivityPlanRow({
      id: "88888888-8888-4888-8888-888888888881",
      profile_id: OTHER_USER_ID,
      content_visibility: "public",
      notes: "Private public-plan notes",
    });
    const { caller, callLog } = createCaller({
      state: { "select:activity_plans": [[originalRow]] },
    });
    await expect(caller.duplicate({ id: originalRow.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only the plan owner can duplicate this activity plan",
    } as Partial<TRPCError>);
    expect(callLog.some((call) => call.operation === "insert")).toBe(false);
  });
  it("duplicate clearly denies an accepted follower without copying private content", async () => {
    const originalRow = createActivityPlanRow({
      id: "88888888-8888-4888-8888-888888888882",
      profile_id: OTHER_USER_ID,
      content_visibility: "followers",
      notes: "Private follower-plan notes",
    });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [
          [originalRow],
          [
            {
              id: originalRow.id,
              ownerProfileId: OTHER_USER_ID,
              contentVisibility: "followers",
              isSystem: false,
            },
          ],
        ],
        "select:follows": [[{ followerId: USER_ID }]],
      },
    });
    await expect(caller.duplicate({ id: originalRow.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only the plan owner can duplicate this activity plan",
    } as Partial<TRPCError>);
    expect(callLog.some((call) => call.operation === "insert")).toBe(false);
  });
  it("duplicate hides a follower plan after follow access is revoked", async () => {
    const originalRow = createActivityPlanRow({
      id: "88888888-8888-4888-8888-888888888883",
      profile_id: OTHER_USER_ID,
      content_visibility: "followers",
    });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [
          [originalRow],
          [
            {
              id: originalRow.id,
              ownerProfileId: OTHER_USER_ID,
              contentVisibility: "followers",
              isSystem: false,
            },
          ],
        ],
        "select:follows": [[]],
        "select:content_access_grants": [[]],
      },
    });
    await expect(caller.duplicate({ id: originalRow.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Activity plan not found",
    } as Partial<TRPCError>);
    expect(callLog.some((call) => call.operation === "insert")).toBe(false);
    const followRead = callLog.find(
      (call) => call.operation === "select" && call.table === "follows",
    );
    expect(followRead?.where).toBeDefined();
    expect(pgDialect.sqlToQuery(followRead?.where as never).sql).toContain(
      '"follows"."status" = $',
    );
  });
  it("duplicate hides a private plan with no active access and never inserts", async () => {
    const originalRow = createActivityPlanRow({
      id: "88888888-8888-4888-8888-888888888885",
      profile_id: OTHER_USER_ID,
      content_visibility: "private",
    });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [
          [originalRow],
          [
            {
              id: originalRow.id,
              ownerProfileId: OTHER_USER_ID,
              contentVisibility: "private",
              isSystem: false,
            },
          ],
        ],
        // A revoked grant is absent from this active-only query, just like no grant.
        "select:content_access_grants": [[]],
      },
    });
    await expect(caller.duplicate({ id: originalRow.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Activity plan not found",
    } as Partial<TRPCError>);
    expect(callLog.some((call) => call.operation === "insert")).toBe(false);
    const grantRead = callLog.find(
      (call) => call.operation === "select" && call.table === "content_access_grants",
    );
    expect(grantRead?.where).toBeDefined();
    const grantQuery = pgDialect.sqlToQuery(grantRead?.where as never).sql;
    expect(grantQuery).toContain('"content_access_grants"."revoked_at" is null');
    expect(grantQuery).toContain('"content_access_grants"."expires_at" is null');
  });
  it("duplicate retains full-copy semantics for a public system template", async () => {
    const originalRow = createActivityPlanRow({
      id: "88888888-8888-4888-8888-888888888884",
      profile_id: null,
      content_visibility: "public",
      is_system_template: true,
      name: "System Activity",
      notes: "Curated system instructions",
    });
    const duplicatedRow = createActivityPlanRow({
      id: "99999999-8888-4888-8888-888888888884",
      profile_id: USER_ID,
      name: "System Activity (Copy)",
      notes: originalRow.notes,
      structure: purposeFreeSampleStructure,
      content_visibility: "private",
      is_system_template: false,
    });
    const { caller, callLog } = createCaller({
      state: {
        "select:activity_plans": [[originalRow]],
        "insert:activity_plans": [[duplicatedRow]],
      },
    });
    const result = await caller.duplicate({ id: originalRow.id });
    expect(callLog.find((call) => call.operation === "insert")?.payload).toMatchObject({
      notes: "Curated system instructions",
      structure: purposeFreeSampleStructure,
      profile_id: USER_ID,
      content_visibility: "private",
      is_system_template: false,
    });
    expect(result).toMatchObject({
      id: duplicatedRow.id,
      notes: "Curated system instructions",
      structure: purposeFreeSampleStructure,
      profile_id: USER_ID,
      visibility: "private",
    });
  });
  it("duplicate rejects unexpected input fields", async () => {
    const { caller } = createCaller();
    await expect(
      caller.duplicate({
        id: "88888888-8888-4888-8888-888888888888",
        extra: true,
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
  });
});

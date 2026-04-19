import { activityPlanRefreshQueue, activityPlans } from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  getActivityPlansDerivedMetrics: vi.fn(async (plans: any[]) =>
    plans.map((plan) => ({
      ...plan,
      estimated_tss: 95,
      estimated_duration: 5400,
      estimate_computed_at: "2026-04-20T12:00:00.000Z",
      estimate_last_accessed_at: "2026-04-20T12:00:00.000Z",
      estimate_source: "computed",
      estimator_version: "2026-04-derived-metrics-v1",
    })),
  ),
}));

vi.mock("../activity-plan-derived-metrics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../activity-plan-derived-metrics")>();

  return {
    ...actual,
    getActivityPlansDerivedMetrics: queueMocks.getActivityPlansDerivedMetrics,
  };
});

import {
  drainQueuedActivityPlanRefreshesForProfile,
  enqueueActivityPlanRefreshes,
  enqueueActivityPlanRefreshesForProfile,
} from "../activity-plan-refresh-queue";

function createQueueDbMock(options?: {
  profilePlanRows?: Array<{ id: string }>;
  queuedRows?: Array<{ plan: Record<string, unknown>; queue: Record<string, unknown> }>;
}) {
  const insertCalls: unknown[][] = [];
  const deleteCalls: unknown[] = [];
  const profilePlanRows = options?.profilePlanRows ?? [];
  const queuedRows = options?.queuedRows ?? [];

  return {
    db: {
      insert: () => ({
        values: (rows: unknown | unknown[]) => {
          insertCalls.push(Array.isArray(rows) ? rows : [rows]);
          return {
            onConflictDoUpdate: async () => undefined,
          };
        },
      }),
      select: (selection?: unknown) => ({
        from: (table: unknown) => {
          if (table === activityPlans && (!selection || !("plan" in (selection as object)))) {
            return {
              where: async () => profilePlanRows,
            };
          }

          if (table === activityPlanRefreshQueue) {
            return {
              innerJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: async () => queuedRows,
                  }),
                }),
              }),
            };
          }

          return {
            where: async () => [],
          };
        },
      }),
      delete: () => ({
        where: async (payload: unknown) => {
          deleteCalls.push(payload);
          return undefined;
        },
      }),
    },
    insertCalls,
    deleteCalls,
  };
}

function createQueuedPlan(id: string) {
  return {
    id,
    profile_id: "profile-1",
    name: `Plan ${id}`,
    description: "",
    activity_category: "bike",
    structure: {},
    route_id: null,
    version: "1.0",
    idx: 0,
    created_at: new Date("2026-04-01T10:00:00.000Z"),
    updated_at: new Date("2026-04-01T10:00:00.000Z"),
    notes: null,
    template_visibility: "private",
    import_provider: null,
    import_external_id: null,
    is_system_template: false,
    likes_count: 0,
    is_public: false,
  };
}

describe("activity-plan-refresh-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates enqueue rows by unique plan id before upsert", async () => {
    const { db, insertCalls } = createQueueDbMock();

    const result = await enqueueActivityPlanRefreshes(db as any, {
      profileId: "profile-1",
      planIds: ["plan-1", "plan-1", "plan-2"],
      now: new Date("2026-04-20T12:00:00.000Z"),
    });

    expect(result).toEqual({ queuedCount: 2, planIds: ["plan-1", "plan-2"] });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toHaveLength(2);
  });

  it("enqueues all owned plans for a profile", async () => {
    const { db, insertCalls } = createQueueDbMock({
      profilePlanRows: [{ id: "plan-1" }, { id: "plan-2" }],
    });

    const result = await enqueueActivityPlanRefreshesForProfile(db as any, {
      profileId: "profile-1",
      now: new Date("2026-04-20T12:00:00.000Z"),
    });

    expect(result).toEqual({ queuedCount: 2, planIds: ["plan-1", "plan-2"] });
    expect(insertCalls).toHaveLength(1);
  });

  it("drains queued plans in order and deletes them after refresh", async () => {
    const queuedRows = [
      {
        plan: createQueuedPlan("plan-1"),
        queue: { activity_plan_id: "plan-1" },
      },
      {
        plan: createQueuedPlan("plan-2"),
        queue: { activity_plan_id: "plan-2" },
      },
    ];
    const { db, deleteCalls } = createQueueDbMock({ queuedRows });

    const result = await drainQueuedActivityPlanRefreshesForProfile(
      db as any,
      { kind: "event-read-repository" } as any,
      {
        profileId: "profile-1",
        limit: 10,
        now: new Date("2026-04-20T12:00:00.000Z"),
      },
    );

    expect(queueMocks.getActivityPlansDerivedMetrics).toHaveBeenCalledWith(
      [queuedRows[0]?.plan, queuedRows[1]?.plan],
      db,
      { kind: "event-read-repository" },
      "profile-1",
      {
        forceRefreshPlanIds: ["plan-1", "plan-2"],
        now: new Date("2026-04-20T12:00:00.000Z"),
      },
    );
    expect(result.refreshedCount).toBe(2);
    expect(result.planIds).toEqual(["plan-1", "plan-2"]);
    expect(deleteCalls).toHaveLength(1);
  });
});

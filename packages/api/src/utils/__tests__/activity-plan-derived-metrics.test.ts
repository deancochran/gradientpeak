import { createHash } from "node:crypto";
import { profileEstimationState } from "@repo/db";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/core/estimation", async () => {
  const actual =
    await vi.importActual<typeof import("@repo/core/estimation")>("@repo/core/estimation");

  return {
    ...actual,
    estimateActivity: vi.fn((context: any) => ({
      tss: (context.route?.distanceMeters ?? 0) > 0 ? 95 : 55,
      duration: (context.route?.distanceMeters ?? 0) > 0 ? 5400 : 2700,
      intensityFactor: 0.84,
      confidence: "moderate",
      confidenceScore: 84,
      estimatedPowerZones: [0, 61, 80],
      factors: [],
      warnings: [],
    })),
    estimateMetrics: vi.fn((_estimation: any, context: any) => ({
      calories: 640,
      distance: context.route?.distanceMeters ?? 0,
    })),
  };
});

import * as estimationCore from "@repo/core/estimation";
import {
  ACTIVITY_PLAN_CACHE_HOT_ACCESS_WINDOW_MS,
  ACTIVITY_PLAN_CACHE_STALE_AFTER_MS,
  ESTIMATOR_VERSION,
  getActivityPlanDerivedMetrics,
  getActivityPlansDerivedMetrics,
  listHotStaleActivityPlansForProfile,
  refreshHotStaleActivityPlanDerivedMetricsForProfile,
} from "../activity-plan-derived-metrics";

function createEstimationStore(routeFixtures: Record<string, Record<string, unknown>>) {
  return {
    getEstimationInputs: vi.fn(async ({ routeIds }: { routeIds: string[] }) => ({
      profile: { dob: "1990-01-01" },
      efforts: [
        {
          effort_type: "power" as const,
          activity_category: "bike" as const,
          duration_seconds: 1200,
          value: 250,
          unit: "watts",
        },
      ],
      metrics: [
        { metric_type: "weight_kg", value: 72 },
        { metric_type: "resting_hr", value: 48 },
      ],
      routes: routeIds.map((routeId) => routeFixtures[routeId]).filter(Boolean),
    })),
  };
}

function createDbMock(cachedRows: unknown[] = []) {
  const insertCalls: unknown[][] = [];
  const stateRow = {
    profile_id: "profile-1",
    metrics_revision: 0,
    performance_revision: 0,
    fitness_revision: 0,
    updated_at: new Date("2026-04-19T12:00:00.000Z"),
  };

  return {
    db: {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => (table === profileEstimationState ? [stateRow] : cachedRows),
            then: (onFulfilled: (value: unknown[]) => unknown) =>
              Promise.resolve(table === profileEstimationState ? [stateRow] : cachedRows).then(
                onFulfilled,
              ),
          }),
        }),
      }),
      insert: () => ({
        values: (rows: unknown | unknown[]) => {
          insertCalls.push(Array.isArray(rows) ? rows : [rows]);
          return {
            onConflictDoUpdate: async () => undefined,
          };
        },
      }),
    },
    insertCalls,
  };
}

function createMaintenanceDbMock(plans: unknown[] = []) {
  const insertCalls: unknown[][] = [];
  const stateRow = {
    profile_id: "profile-1",
    metrics_revision: 0,
    performance_revision: 0,
    fitness_revision: 0,
    updated_at: new Date("2026-04-19T12:00:00.000Z"),
  };

  return {
    db: {
      select: (selection?: unknown) => ({
        from: (table: unknown) => {
          if (table === profileEstimationState) {
            return {
              where: () => ({
                limit: async () => [stateRow],
              }),
            };
          }

          return {
            innerJoin: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: async () =>
                    selection && typeof selection === "object" && "plan" in (selection as object)
                      ? plans.map((plan) => ({ plan }))
                      : [],
                }),
              }),
            }),
            where: () => ({
              then: (onFulfilled: (value: unknown[]) => unknown) =>
                Promise.resolve([]).then(onFulfilled),
              limit: async () => [],
            }),
          };
        },
      }),
      insert: () => ({
        values: (rows: unknown | unknown[]) => {
          insertCalls.push(Array.isArray(rows) ? rows : [rows]);
          return {
            onConflictDoUpdate: async () => undefined,
          };
        },
      }),
    },
    insertCalls,
  };
}

function createPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-1",
    profile_id: "profile-1",
    name: "Threshold ride",
    description: "",
    activity_category: "bike" as const,
    structure: {},
    route_id: "route-1",
    version: "1.0",
    updated_at: "2026-04-19T12:00:00.000Z",
    ...overrides,
  };
}

function buildExpectedFingerprint() {
  return createHash("sha256")
    .update(
      JSON.stringify({
        estimator_version: ESTIMATOR_VERSION,
        plan_updated_at: "2026-04-19T12:00:00.000Z",
        plan_version: "1.0",
        route_id: "route-1",
        route_distance_meters: 42000,
        route_total_ascent: 300,
        route_total_descent: 300,
        route_updated_at: "2026-04-19T11:00:00.000Z",
        metrics_revision: 0,
        performance_revision: 0,
        fitness_revision: 0,
      }),
    )
    .digest("hex");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("activity-plan-derived-metrics", () => {
  it("returns cached metrics without recomputing when the fingerprint matches", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T14:00:00.000Z"));

    const estimationStore = createEstimationStore({
      "route-1": {
        id: "route-1",
        distance_meters: 42000,
        total_ascent: 300,
        total_descent: 300,
        updated_at: "2026-04-19T11:00:00.000Z",
      },
    });
    const cachedRow = {
      activity_plan_id: "plan-1",
      profile_id: "profile-1",
      estimator_version: ESTIMATOR_VERSION,
      input_fingerprint: buildExpectedFingerprint(),
      estimated_tss: 77,
      estimated_duration_seconds: 4300,
      intensity_factor: 0.79,
      estimated_calories: 500,
      estimated_distance_meters: 42000,
      estimated_zones: ["Z2", "Z3"],
      confidence: "high",
      confidence_score: 91,
      computed_at: new Date("2026-04-19T12:30:00.000Z"),
      last_accessed_at: new Date("2026-04-19T12:30:00.000Z"),
      created_at: new Date("2026-04-19T12:30:00.000Z"),
      updated_at: new Date("2026-04-19T12:30:00.000Z"),
      id: "projection-1",
    };
    const { db, insertCalls } = createDbMock([cachedRow]);

    const result = await getActivityPlanDerivedMetrics(
      createPlan(),
      db as any,
      estimationStore as any,
      "profile-1",
    );

    expect(result).toMatchObject({
      estimate_source: "cache",
      estimator_version: ESTIMATOR_VERSION,
      authoritative_metrics: {
        estimated_tss: 77,
        estimated_duration: 4300,
        intensity_factor: 0.79,
        estimated_distance: 42000,
      },
      route: {
        distance: 42000,
        ascent: 300,
        descent: 300,
      },
    });
    expect(vi.mocked(estimationCore.estimateActivity)).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.[0]).toMatchObject({
      activity_plan_id: "plan-1",
      last_accessed_at: new Date("2026-04-19T14:00:00.000Z"),
      computed_at: new Date("2026-04-19T12:30:00.000Z"),
    });
  });

  it("recomputes stale cache for recently accessed plans", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));

    const estimationStore = createEstimationStore({
      "route-1": {
        id: "route-1",
        distance_meters: 42000,
        total_ascent: 300,
        total_descent: 300,
        updated_at: "2026-04-19T11:00:00.000Z",
      },
    });
    const staleHotRow = {
      activity_plan_id: "plan-1",
      profile_id: "profile-1",
      estimator_version: ESTIMATOR_VERSION,
      input_fingerprint: buildExpectedFingerprint(),
      estimated_tss: 77,
      estimated_duration_seconds: 4300,
      intensity_factor: 0.79,
      estimated_calories: 500,
      estimated_distance_meters: 42000,
      estimated_zones: ["Z2", "Z3"],
      confidence: "high",
      confidence_score: 91,
      computed_at: new Date(Date.now() - ACTIVITY_PLAN_CACHE_STALE_AFTER_MS - 60_000),
      last_accessed_at: new Date(Date.now() - ACTIVITY_PLAN_CACHE_HOT_ACCESS_WINDOW_MS + 60_000),
      created_at: new Date("2026-04-19T12:30:00.000Z"),
      updated_at: new Date("2026-04-19T12:30:00.000Z"),
      id: "projection-2",
    };
    const { db, insertCalls } = createDbMock([staleHotRow]);

    const result = await getActivityPlanDerivedMetrics(
      createPlan(),
      db as any,
      estimationStore as any,
      "profile-1",
    );

    expect(result).toMatchObject({
      estimate_source: "computed",
      estimate_computed_at: "2026-04-20T12:00:00.000Z",
      estimate_last_accessed_at: "2026-04-20T12:00:00.000Z",
      authoritative_metrics: {
        estimated_tss: 95,
        estimated_duration: 5400,
      },
    });
    expect(vi.mocked(estimationCore.estimateActivity)).toHaveBeenCalledTimes(1);
    expect(insertCalls).toHaveLength(1);
  });

  it("reuses stale cache for cold plans and only touches access time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));

    const estimationStore = createEstimationStore({
      "route-1": {
        id: "route-1",
        distance_meters: 42000,
        total_ascent: 300,
        total_descent: 300,
        updated_at: "2026-04-19T11:00:00.000Z",
      },
    });
    const staleColdRow = {
      activity_plan_id: "plan-1",
      profile_id: "profile-1",
      estimator_version: ESTIMATOR_VERSION,
      input_fingerprint: buildExpectedFingerprint(),
      estimated_tss: 77,
      estimated_duration_seconds: 4300,
      intensity_factor: 0.79,
      estimated_calories: 500,
      estimated_distance_meters: 42000,
      estimated_zones: ["Z2", "Z3"],
      confidence: "high",
      confidence_score: 91,
      computed_at: new Date(Date.now() - ACTIVITY_PLAN_CACHE_STALE_AFTER_MS - 60_000),
      last_accessed_at: new Date(Date.now() - ACTIVITY_PLAN_CACHE_HOT_ACCESS_WINDOW_MS - 60_000),
      created_at: new Date("2026-04-19T12:30:00.000Z"),
      updated_at: new Date("2026-04-19T12:30:00.000Z"),
      id: "projection-3",
    };
    const { db, insertCalls } = createDbMock([staleColdRow]);

    const result = await getActivityPlanDerivedMetrics(
      createPlan(),
      db as any,
      estimationStore as any,
      "profile-1",
    );

    expect(result).toMatchObject({
      estimate_source: "cache",
      estimate_computed_at: staleColdRow.computed_at.toISOString(),
      estimate_last_accessed_at: staleColdRow.last_accessed_at.toISOString(),
      authoritative_metrics: {
        estimated_tss: 77,
        estimated_duration: 4300,
      },
    });
    expect(vi.mocked(estimationCore.estimateActivity)).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.[0]).toMatchObject({
      activity_plan_id: "plan-1",
      last_accessed_at: new Date("2026-04-20T12:00:00.000Z"),
      computed_at: staleColdRow.computed_at,
    });
  });

  it("computes and seeds cache rows on miss", async () => {
    const estimationStore = createEstimationStore({
      "route-1": {
        id: "route-1",
        distance_meters: 42000,
        total_ascent: 300,
        total_descent: 300,
        updated_at: "2026-04-19T11:00:00.000Z",
      },
    });
    const { db, insertCalls } = createDbMock([]);

    const result = await getActivityPlansDerivedMetrics(
      [createPlan()],
      db as any,
      estimationStore as any,
      "profile-1",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      estimated_calories: 640,
      estimated_zones: ["Z2", "Z3"],
      estimate_source: "computed",
      estimator_version: ESTIMATOR_VERSION,
      authoritative_metrics: {
        estimated_tss: 95,
        estimated_duration: 5400,
        intensity_factor: 0.84,
        estimated_distance: 42000,
      },
      route: {
        distance: 42000,
        ascent: 300,
        descent: 300,
      },
    });
    expect(vi.mocked(estimationCore.estimateActivity)).toHaveBeenCalledTimes(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.[0]).toMatchObject({
      activity_plan_id: "plan-1",
      profile_id: "profile-1",
      estimator_version: ESTIMATOR_VERSION,
      estimated_tss: 95,
      estimated_duration_seconds: 5400,
      estimated_calories: 640,
      estimated_distance_meters: 42000,
    });
  });

  it("selects only hot stale plans for background refresh work", async () => {
    const { db } = createMaintenanceDbMock([createPlan(), createPlan({ id: "plan-2" })]);

    const result = await listHotStaleActivityPlansForProfile(db as any, {
      profileId: "profile-1",
      limit: 10,
      now: new Date("2026-04-20T12:00:00.000Z"),
    });

    expect(result).toHaveLength(2);
    expect(result.map((plan) => plan.id)).toEqual(["plan-1", "plan-2"]);
  });

  it("refreshes only the selected hot stale plans in a bounded batch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));

    const estimationStore = createEstimationStore({
      "route-1": {
        id: "route-1",
        distance_meters: 42000,
        total_ascent: 300,
        total_descent: 300,
        updated_at: "2026-04-19T11:00:00.000Z",
      },
    });
    const maintenancePlan = createPlan();
    const { db, insertCalls } = createMaintenanceDbMock([maintenancePlan]);

    const result = await refreshHotStaleActivityPlanDerivedMetricsForProfile(
      db as any,
      estimationStore as any,
      "profile-1",
      {
        limit: 25,
        now: new Date("2026-04-20T12:00:00.000Z"),
      },
    );

    expect(result).toEqual({ refreshedCount: 1, planIds: ["plan-1"] });
    expect(vi.mocked(estimationCore.estimateActivity)).toHaveBeenCalledTimes(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.[0]).toMatchObject({
      activity_plan_id: "plan-1",
      estimated_tss: 95,
      estimated_duration_seconds: 5400,
    });
  });
});

import { describe, expect, it, vi } from "vitest";

const estimateActivity = vi.hoisted(() =>
  vi.fn((context: any) => {
    if (context.structure?.version === 2) {
      throw new Error("Invalid activity-plan V3 structure");
    }
    if (context.structure?.fail) throw new Error("expected failure");
    const duration = context.structure?.duration ?? 1800;
    const routeDistance = context.route?.distanceMeters ?? 0;
    const profileFactor = context.ftp ? context.ftp / 100 : 1;
    return {
      tss: duration / 60 + routeDistance / 1000 + profileFactor,
      duration,
      intensityFactor: 0.8,
      confidence: "medium",
      confidenceScore: 75,
      estimatedPowerZones: [0, 61],
      warnings: context.structure?.warning ? ["fixture warning"] : [],
    };
  }),
);

vi.mock("@repo/core/estimation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/core/estimation")>();
  return {
    ...actual,
    estimateActivity,
    estimateMetrics: vi.fn((estimation: any, context: any) => ({
      calories: estimation.tss * 4,
      distance: context.route?.distanceMeters ?? 0,
    })),
  };
});

import { getActivityPlansDerivedMetrics } from "../activity-plan-derived-metrics";
import { loadEstimationSnapshot } from "../estimation-helpers";

const asOf = new Date("2026-07-12T12:00:00.000Z");

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-1",
    profile_id: "profile-1",
    name: "Plan",
    description: null,
    activity_category: "bike" as const,
    structure: { duration: 1800 },
    version: "1",
    updated_at: asOf,
    ...overrides,
  };
}

function store(overrides: Record<string, unknown> = {}) {
  return {
    getEstimationInputs: vi.fn(async () => ({
      profile: { dob: "1990-07-12" },
      efforts: [],
      metrics: [
        { metric_type: "ftp" as const, unit: "W", value: 250, recorded_at: asOf.toISOString() },
      ],
      routes: [],
      ...overrides,
    })),
  };
}

describe("on-demand activity plan estimation", () => {
  it("exposes frozen route facts through readonly lookups at the request access time", async () => {
    const route = {
      id: "route-1",
      distance_meters: 10_000,
      total_ascent: 100,
      total_descent: 90,
    };
    const snapshot = await loadEstimationSnapshot(
      store({ routes: [route] }) as any,
      "profile-1",
      ["route-1"],
      asOf,
    );

    const routeFact = snapshot.getRoute("route-1");
    const summary = snapshot.getRouteSummary("route-1");
    expect(snapshot.asOf).toEqual(asOf);
    expect(routeFact).toEqual(route);
    expect(summary).toEqual({ distance: 10_000, ascent: 100, descent: 90 });
    expect(Object.isFrozen(routeFact)).toBe(true);
    expect(Object.isFrozen(summary)).toBe(true);
    expect(() => Object.assign(routeFact!, { distance_meters: 1 })).toThrow(TypeError);
    expect(snapshot.getRoute("route-1")?.distance_meters).toBe(10_000);
  });

  it("loads one canonical snapshot, propagates asOf, memoizes duplicate inputs, and performs no writes", async () => {
    estimateActivity.mockClear();
    const inputStore = store();
    const db = new Proxy(
      {},
      {
        get: () => () =>
          Promise.reject(new Error("estimation reads must not use the write client")),
      },
    );
    const result = await getActivityPlansDerivedMetrics(
      [plan(), plan({ id: "plan-2" })],
      db as any,
      inputStore as any,
      "profile-1",
      { asOf },
    );

    expect(inputStore.getEstimationInputs).toHaveBeenCalledOnce();
    expect(inputStore.getEstimationInputs).toHaveBeenCalledWith({
      asOfIso: asOf.toISOString(),
      effortCutoffIso: "2026-04-13T12:00:00.000Z",
      profileId: "profile-1",
      routeIds: [],
    });
    expect(estimateActivity).toHaveBeenCalledOnce();
    expect(result.map((item) => item.estimate_source)).toEqual(["computed", "computed"]);
    expect(result[0]?.estimate_computed_at).toBe(asOf.toISOString());
  });

  it("memoizes a duplicate-heavy batch by normalized plan and route content", async () => {
    estimateActivity.mockClear();
    const duplicates = Array.from({ length: 100 }, (_, index) => plan({ id: `plan-${index}` }));
    const result = await getActivityPlansDerivedMetrics(
      duplicates,
      {} as any,
      store() as any,
      "profile-1",
      { asOf },
    );

    expect(result).toHaveLength(100);
    expect(estimateActivity).toHaveBeenCalledOnce();
  });

  it("changes deterministically with plan and profile facts", async () => {
    const [base] = await getActivityPlansDerivedMetrics(
      [plan()],
      {} as any,
      store() as any,
      "profile-1",
      { asOf },
    );
    const [changedPlan] = await getActivityPlansDerivedMetrics(
      [plan({ structure: { duration: 3600 } })],
      {} as any,
      store() as any,
      "profile-1",
      { asOf },
    );
    const [changedProfile] = await getActivityPlansDerivedMetrics(
      [plan()],
      {} as any,
      store({
        metrics: [{ metric_type: "ftp", unit: "W", value: 300, recorded_at: asOf.toISOString() }],
      }) as any,
      "profile-1",
      { asOf },
    );
    expect(changedPlan?.authoritative_metrics.estimated_tss).not.toBe(
      base?.authoritative_metrics.estimated_tss,
    );
    expect(changedProfile?.authoritative_metrics.estimated_tss).not.toBe(
      base?.authoritative_metrics.estimated_tss,
    );
  });

  it("preserves warnings and excludes failed estimates from aggregation", async () => {
    const result = await getActivityPlansDerivedMetrics(
      [plan({ structure: { warning: true } }), plan({ id: "failed", structure: { fail: true } })],
      {} as any,
      store() as any,
      "profile-1",
      { asOf },
    );

    expect(result[0]).toMatchObject({
      estimation_status: "estimated",
      estimation_warnings: ["fixture warning"],
      counts_toward_aggregation: true,
    });
    expect(result[1]).toMatchObject({
      estimation_status: "failed",
      estimate_source: "failed",
      counts_toward_aggregation: false,
      authoritative_metrics: { estimated_tss: null },
    });
  });

  it("returns failed no-evidence metrics for unsupported old structures", async () => {
    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: { version: 2, intervals: [] } })],
      {} as any,
      store() as any,
      "profile-1",
      { asOf },
    );

    expect(result).toMatchObject({
      estimation_status: "failed",
      estimate_source: "failed",
      counts_toward_aggregation: false,
      authoritative_metrics: {
        estimated_tss: null,
        estimated_duration: null,
        intensity_factor: null,
      },
    });
  });
});

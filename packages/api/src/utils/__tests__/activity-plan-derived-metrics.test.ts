import { describe, expect, it, vi } from "vitest";

const estimateActivity = vi.hoisted(() =>
  vi.fn((context: any) => {
    if (context.structure?.version === 2) {
      throw new Error("Invalid activity-plan structure");
    }
    const duration =
      context.structure?.segments?.[0]?.intervals?.[0]?.steps?.[0]?.duration?.seconds ?? 1800;
    const routeDistance = context.route?.distanceMeters ?? 0;
    const profileFactor = context.ftp ? context.ftp / 100 : 1;
    return {
      tss: duration / 60 + routeDistance / 1000 + profileFactor,
      duration,
      intensityFactor: 0.8,
      categoryDoses: [
        {
          activity_category: "bike",
          timedActiveSeconds: duration,
          distanceMeters: 0,
          repetitionCount: 1,
          openOccurrenceCount: 0,
          tss: 42,
          intensityFactor: 0.8,
          cyclingPowerEvidenceCoverage: 1,
        },
      ],
      confidence: "medium",
      confidenceScore: 75,
      estimatedPowerZones: [0, 61],
      warnings: context.structure?.segments?.[0]?.name === "Warning" ? ["fixture warning"] : [],
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

import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
import { getActivityPlansDerivedMetrics } from "../activity-plan-derived-metrics";
import { loadEstimationSnapshot } from "../estimation-helpers";

const asOf = new Date("2026-07-12T12:00:00.000Z");

function structure(duration = 1800, name = "Bike", percentFtp = 75) {
  return {
    version: 3 as const,
    segments: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        role: "activity" as const,
        activity_category: "bike" as const,
        name,
        intervals: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                name: "Ride",
                duration: { type: "time" as const, seconds: duration },
                targets: [{ type: "%FTP" as const, intensity: percentFtp }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function thresholdHrRunStructure(intensity = 80) {
  return {
    version: 3 as const,
    segments: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        role: "activity" as const,
        activity_category: "run" as const,
        name: "Run",
        intervals: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "77777777-7777-4777-8777-777777777777",
                name: "Threshold HR run",
                duration: { type: "time" as const, seconds: 1800 },
                targets: [{ type: "%ThresholdHR" as const, intensity }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function runLthrMetric(activityCategory: "bike" | "run" | "swim" = "run") {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    metric_type: "lthr" as const,
    unit: "bpm",
    value: 170,
    recorded_at: asOf.toISOString(),
    source: "derived" as const,
    method: "activity_file_lthr_detection",
    calculation_version: "activity-file-lthr-v1",
    reference_activity_id: "99999999-9999-4999-8999-999999999999",
    reference_activity_category: activityCategory,
    provenance: {
      activity_id: "99999999-9999-4999-8999-999999999999",
      derived_from: "activity_file_stream",
    },
  };
}

function plan(overrides: Record<string, unknown> = {}): any {
  const planStructure =
    (overrides.structure as ReturnType<typeof structure> | undefined) ?? structure();
  return {
    id: "plan-1",
    profile_id: "profile-1",
    name: "Plan",
    description: null,
    structure: planStructure,
    structure_hash: activityPlanStructureHash(planStructure),
    gps_recording_enabled: true,
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
    expect(snapshot.thresholds.cycling_ftp).toMatchObject({ value: 250, source: "provider" });
    expect(routeFact).toEqual(route);
    expect(summary).toEqual({ distance: 10_000, ascent: 100, descent: 90 });
    expect(Object.isFrozen(routeFact)).toBe(true);
    expect(Object.isFrozen(summary)).toBe(true);
    expect(() => Object.assign(routeFact!, { distance_meters: 1 })).toThrow(TypeError);
    expect(snapshot.getRoute("route-1")?.distance_meters).toBe(10_000);
  });

  it("does not revive a cleared generic LTHR profile override", async () => {
    const snapshot = await loadEstimationSnapshot(
      store({
        metrics: [
          {
            id: "metric-cleared",
            metric_type: "lthr",
            unit: "bpm",
            value: 0,
            recorded_at: asOf.toISOString(),
            source: "manual",
            method: "profile_update_override",
            reference_activity_id: null,
            reference_activity_category: null,
            provenance: { input: "profile_update", override_state: "cleared" },
          },
          {
            id: "metric-old",
            metric_type: "lthr",
            unit: "bpm",
            value: 165,
            recorded_at: "2026-07-01T12:00:00.000Z",
            source: "manual",
            method: "profile_update_override",
            reference_activity_id: null,
            reference_activity_category: null,
            provenance: { input: "profile_update", override_state: "active" },
          },
        ],
      }) as never,
      "profile-1",
      [],
      asOf,
    );

    expect(snapshot.profile.threshold_hr).toBeNull();
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
    expect(result[0]?.common_load).toMatchObject({
      status: "available",
      method: "power_threshold",
      activity_category: "bike",
      contributingDurationSeconds: 1800,
      intensity: 0.75,
      estimated: true,
    });
    if (result[0]?.common_load.status !== "available") {
      throw new Error("Expected available planned common Load");
    }
    expect(result[0].common_load.load).toBeCloseTo(28.125, 12);
  });

  it.each([
    [75, 0.75],
    [150, 1.5],
  ])("converts authored %%FTP percentage points %i to threshold ratio %f", async (percentFtp, intensity) => {
    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: structure(1800, "Bike", percentFtp) })],
      {} as never,
      store() as never,
      "profile-1",
      { asOf },
    );

    expect(result?.common_load).toMatchObject({ status: "available", intensity });
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
      [plan({ structure: structure(3600) })],
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
      [
        plan({ structure: structure(1800, "Warning") }),
        plan({ id: "failed", structure: { fail: true } }),
      ],
      {} as any,
      store() as any,
      "profile-1",
      { asOf },
    );

    expect(result[0]).toMatchObject({
      estimation_status: "estimated",
      estimation_warnings: ["fixture warning"],
      counts_toward_aggregation: true,
      category_loads: [
        { activity_category: "bike", tss: 42, intensity_factor: 0.8, method: "power_threshold" },
      ],
    });
    expect(result[1]).toMatchObject({
      estimation_status: "failed",
      estimate_source: "failed",
      counts_toward_aggregation: false,
      category_loads: [],
      authoritative_metrics: { estimated_tss: null },
      common_load: { status: "unavailable", reason: "activity_data_missing" },
    });
  });

  it("abstains from planned common Load when threshold provenance is unavailable", async () => {
    const [result] = await getActivityPlansDerivedMetrics(
      [plan()],
      {} as any,
      store({ metrics: [] }) as any,
      "profile-1",
      { asOf },
    );

    expect(result?.common_load).toMatchObject({
      status: "unavailable",
      method: "power_threshold",
      reason: "threshold_missing",
      contributingDurationSeconds: 1800,
    });
  });

  it("calculates planned run Load from a category-specific LTHR target", async () => {
    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: thresholdHrRunStructure() })],
      {} as never,
      store({ metrics: [runLthrMetric()] }) as never,
      "profile-1",
      { asOf },
    );

    expect(result?.common_load).toMatchObject({
      status: "available",
      activity_category: "run",
      method: "heart_rate_zones",
      intensity: 0.8,
      contributingDurationSeconds: 1800,
      thresholdEvidence: { type: "lthr_bpm", value: 170 },
    });
    if (result?.common_load.status !== "available") throw new Error("Expected available Load");
    expect(result.common_load.load).toBeCloseTo(32, 12);
  });

  it("does not use another activity category's LTHR for a run plan", async () => {
    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: thresholdHrRunStructure() })],
      {} as never,
      store({ metrics: [runLthrMetric("bike")] }) as never,
      "profile-1",
      { asOf },
    );

    expect(result?.common_load).toMatchObject({
      status: "unavailable",
      activity_category: "run",
      method: "heart_rate_zones",
      reason: "threshold_missing",
    });
  });

  it("treats category-specific LTHR outside the freshness window as missing", async () => {
    const staleMetric = {
      ...runLthrMetric(),
      recorded_at: "2026-03-01T12:00:00.000Z",
    };
    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: thresholdHrRunStructure() })],
      {} as never,
      store({ metrics: [staleMetric] }) as never,
      "profile-1",
      { asOf },
    );

    expect(result?.common_load).toMatchObject({
      status: "unavailable",
      activity_category: "run",
      method: "heart_rate_zones",
      reason: "threshold_missing",
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

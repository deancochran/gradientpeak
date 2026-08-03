import { estimateActivityPlanForTrainingContext } from "@repo/core/plan";
import type { DrizzleDbClient } from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
import { createTestPerformanceModelRepository } from "../../test-support/performance-model";
import {
  getActivityPlansDerivedMetrics,
  type SupportedActivityPlan,
} from "../activity-plan-derived-metrics";
import { type EstimationReadStore, loadEstimationSnapshot } from "../estimation-helpers";

const asOf = new Date("2026-07-12T12:00:00.000Z");

type EstimationInputs = Awaited<ReturnType<EstimationReadStore["getEstimationInputs"]>>;
type EstimationRoute = EstimationInputs["routes"][number];
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

type TestProfileMetric = {
  id?: string;
  metric_type: "lthr";
  recorded_at?: Date | string;
  unit?: string | null;
  source?: string | null;
  method?: string | null;
  calculation_version?: string | null;
  provenance?: Record<string, unknown> | null;
  quality_score?: number | null;
  reference_activity_id?: string | null;
  reference_activity_category?: string | null;
  value: number;
};

type TestEstimationRoute = Omit<EstimationRoute, "updated_at"> & { updated_at?: string };

type TestStoreOptions = {
  calibrationTruncated?: boolean;
  calibrationUnavailable?: boolean;
  powerEvidenceId?: string;
  powerEvidenceRecordedAt?: Date;
  metrics?: TestProfileMetric[];
  routes?: TestEstimationRoute[];
  runningPlanningThresholdPaceSecondsPerKm?: number;
};

type BikeTarget = { type: "%FTP" | "watts"; intensity: number };
type BikeDuration = { type: "time"; seconds: number } | { type: "distance"; meters: number };

function bikeSegment(input: {
  duration: BikeDuration;
  id?: string;
  intervalId?: string;
  name: string;
  stepId?: string;
  target: BikeTarget;
}) {
  return {
    id: input.id ?? "22222222-2222-4222-8222-222222222222",
    role: "activity" as const,
    activity_category: "bike" as const,
    name: input.name,
    intervals: [
      {
        id: input.intervalId ?? "33333333-3333-4333-8333-333333333333",
        name: "Main",
        repetitions: 1,
        steps: [
          {
            id: input.stepId ?? "44444444-4444-4444-8444-444444444444",
            name: "Ride",
            duration: input.duration,
            targets: [input.target],
          },
        ],
      },
    ],
  };
}

function structure(duration = 1800, name = "Bike", percentFtp = 75) {
  return {
    version: 3 as const,
    segments: [
      bikeSegment({
        duration: { type: "time", seconds: duration },
        name,
        target: { type: "%FTP", intensity: percentFtp },
      }),
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

function distanceRunStructure() {
  return {
    version: 3 as const,
    segments: [
      {
        id: "12121212-1212-4212-8212-121212121212",
        role: "activity" as const,
        activity_category: "run" as const,
        name: "Distance run",
        intervals: [
          {
            id: "13131313-1313-4313-8313-131313131313",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "14141414-1414-4414-8414-141414141414",
                name: "5K",
                duration: { type: "distance" as const, meters: 5_000 },
                targets: [{ type: "speed" as const, intensity: 14.4 }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function runLthrMetric(activityCategory: "bike" | "run" | "swim" = "run"): TestProfileMetric {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    metric_type: "lthr" as const,
    unit: "bpm",
    value: 170,
    recorded_at: asOf,
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

function structureWithTarget(
  target: { type: "%FTP" | "watts"; intensity: number },
  duration: { type: "time"; seconds: number } | { type: "distance"; meters: number } = {
    type: "time",
    seconds: 3600,
  },
) {
  return {
    version: 3 as const,
    segments: [bikeSegment({ duration, name: "Bike", target })],
  };
}

function twoSegmentStructure(secondTimed: boolean) {
  return {
    version: 3 as const,
    segments: [
      bikeSegment({
        duration: { type: "time", seconds: 1800 },
        name: "First",
        target: { type: "%FTP", intensity: 75 },
      }),
      bikeSegment({
        duration: secondTimed
          ? { type: "time", seconds: 1800 }
          : { type: "distance", meters: 5_000 },
        id: "66666666-6666-4666-8666-666666666666",
        intervalId: "77777777-7777-4777-8777-777777777777",
        name: "Second",
        stepId: "88888888-8888-4888-8888-888888888888",
        target: { type: "%FTP", intensity: 75 },
      }),
    ],
  };
}

function plan(overrides: Partial<SupportedActivityPlan> = {}): SupportedActivityPlan {
  const planStructure = overrides.structure ?? structure();
  return {
    id: "plan-1",
    profile_id: PROFILE_ID,
    name: "Plan",
    description: null,
    structure_hash: overrides.structure_hash ?? activityPlanStructureHash(planStructure),
    gps_recording_enabled: true,
    updated_at: asOf,
    ...overrides,
    structure: planStructure,
  };
}

function store(options: TestStoreOptions = {}) {
  const metrics = options.metrics ?? [];
  const lthrMetrics = metrics.filter((metric) => metric.metric_type === "lthr");
  const lthrBpm = Object.fromEntries(
    lthrMetrics.flatMap((metric) =>
      metric.reference_activity_category === "bike" ||
      metric.reference_activity_category === "run" ||
      metric.reference_activity_category === "swim"
        ? [[metric.reference_activity_category, Number(metric.value)] as const]
        : [],
    ),
  );
  const heartRateObservedAt = lthrMetrics[0]?.recorded_at;
  const parsedHeartRateObservedAt =
    heartRateObservedAt === undefined
      ? undefined
      : heartRateObservedAt instanceof Date
        ? heartRateObservedAt
        : new Date(heartRateObservedAt);
  const powerEvidenceStale =
    options.powerEvidenceRecordedAt !== undefined &&
    asOf.getTime() - options.powerEvidenceRecordedAt.getTime() > 90 * 86_400_000;
  const evidenceIdOffset = [...(options.powerEvidenceId ?? "")].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  const performanceRepository = createTestPerformanceModelRepository({
    cyclingPlanningThresholdPowerWatts:
      options.calibrationUnavailable || powerEvidenceStale ? null : 250,
    ...(options.runningPlanningThresholdPaceSecondsPerKm === undefined
      ? {}
      : {
          runningPlanningThresholdPaceSecondsPerKm:
            options.runningPlanningThresholdPaceSecondsPerKm,
        }),
    ...(options.calibrationTruncated === undefined
      ? {}
      : { effortReadTruncated: options.calibrationTruncated }),
    evidenceIdOffset,
    lthrBpm,
    ...(parsedHeartRateObservedAt === undefined
      ? {}
      : { heartRateObservedAt: parsedHeartRateObservedAt }),
  });
  const getEstimationInputs = vi.fn(
    async (): Promise<EstimationInputs> => ({
      routes: (options.routes ?? []).map((route) => ({
        ...route,
        updated_at: route.updated_at ?? asOf.toISOString(),
      })),
    }),
  );
  const readAthletePerformanceEvidenceSnapshot = vi.fn(
    performanceRepository.readAthletePerformanceEvidenceSnapshot,
  );
  return {
    getEstimationInputs,
    readAthletePerformanceEvidenceSnapshot,
  } satisfies EstimationReadStore;
}

function unusedDrizzleDb(): DrizzleDbClient {
  return vi.fn<() => DrizzleDbClient>()();
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
      store({ routes: [route] }),
      PROFILE_ID,
      ["route-1"],
      asOf,
    );

    const routeFact = snapshot.getRoute("route-1");
    const summary = snapshot.getRouteSummary("route-1");
    expect(snapshot.asOf).toEqual(asOf);
    const planningThresholdPower = snapshot.performanceTargets.cycling.planningThresholdPower;
    expect(planningThresholdPower).toMatchObject({ status: "available" });
    expect(planningThresholdPower.value).toBeCloseTo(250, 10);
    expect(routeFact).toMatchObject(route);
    expect(summary).toEqual({ distance: 10_000, ascent: 100, descent: 90 });
    expect(Object.isFrozen(routeFact)).toBe(true);
    expect(Object.isFrozen(summary)).toBe(true);
    if (!routeFact) throw new Error("Expected the route fixture to be loaded");
    expect(() => Object.assign(routeFact, { distance_meters: 1 })).toThrow(TypeError);
    expect(snapshot.getRoute("route-1")?.distance_meters).toBe(10_000);
  });

  it("loads one canonical snapshot, propagates asOf, and performs no writes", async () => {
    const inputStore = store();
    const db = unusedDrizzleDb();
    const result = await getActivityPlansDerivedMetrics(
      [plan(), plan({ id: "plan-2" })],
      db,
      inputStore,
      PROFILE_ID,
      { asOf },
    );

    expect(inputStore.getEstimationInputs).toHaveBeenCalledOnce();
    expect(inputStore.readAthletePerformanceEvidenceSnapshot).toHaveBeenCalledOnce();
    expect(inputStore.readAthletePerformanceEvidenceSnapshot).toHaveBeenCalledWith({
      athleteId: PROFILE_ID,
      asOf,
    });
    expect(inputStore.getEstimationInputs).toHaveBeenCalledWith({
      asOfIso: asOf.toISOString(),
      profileId: PROFILE_ID,
      routeIds: [],
    });
    expect(result.map((item) => item.estimate_source)).toEqual(["computed", "computed"]);
    expect(result[0]?.estimate_computed_at).toBe(asOf.toISOString());
    expect(result[0]?.duration_estimate).toEqual({
      valueSeconds: 1800,
      status: "exact",
      basis: "compiled_time",
      confidence: "high",
    });
    expect(result[0]?.common_load).toMatchObject({
      status: "complete",
      load: 28.125,
      contributingDurationSeconds: 1800,
    });
    const memberLoad = result[0]?.prescriptionQuantification.members[0]?.commonLoad;
    expect(memberLoad).toMatchObject({
      status: "available",
      method: "power_threshold",
      activity_category: "bike",
      contributingDurationSeconds: 1800,
      intensity: 0.75,
      estimated: true,
    });
    if (memberLoad?.status !== "available") {
      throw new Error("Expected available planned common Load");
    }
    expect(memberLoad.load).toBeCloseTo(28.125, 12);
  });

  it.each([
    [75, 0.75],
    [150, 1.5],
  ])("converts authored %%FTP percentage points %i to threshold ratio %f", async (percentFtp, intensity) => {
    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: structure(1800, "Bike", percentFtp) })],
      unusedDrizzleDb(),
      store(),
      PROFILE_ID,
      { asOf },
    );

    expect(result?.prescriptionQuantification.members[0]?.commonLoad).toMatchObject({
      status: "available",
      intensity,
    });
  });

  it("keeps one hour at 100 percent FTP equal to 100 canonical Load", async () => {
    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: structure(3600, "Threshold", 100) })],
      unusedDrizzleDb(),
      store(),
      PROFILE_ID,
      { asOf },
    );

    expect(result?.common_load).toMatchObject({ status: "complete", load: 100, intensity: 1 });
    expect(result?.prescriptionQuantification.summary.duration.elapsed).toMatchObject({
      status: "complete",
      value: 3600,
    });
  });

  it.each([
    ["missing", { calibrationUnavailable: true }],
    ["stale", { powerEvidenceRecordedAt: new Date("2026-04-01T00:00:00.000Z") }],
    ["truncated", { calibrationTruncated: true }],
  ])("fails %s calibration closed without losing authored duration", async (_name, overrides) => {
    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: structure(3600, "Threshold", 100) })],
      unusedDrizzleDb(),
      store(overrides),
      PROFILE_ID,
      { asOf },
    );

    expect(result?.common_load).toMatchObject({ status: "unavailable" });
    expect(result?.duration_estimate).toMatchObject({
      status: "exact",
      basis: "compiled_time",
    });
    expect(result).not.toHaveProperty("counts_toward_aggregation");
  });

  it("does not revive the removed Critical Power fallback when canonical targets are unavailable", async () => {
    const noTargetStore = store({ calibrationUnavailable: true });
    const [watts, percent] = await Promise.all([
      getActivityPlansDerivedMetrics(
        [plan({ structure: structureWithTarget({ type: "watts", intensity: 250 }) })],
        unusedDrizzleDb(),
        noTargetStore,
        PROFILE_ID,
        { asOf },
      ),
      getActivityPlansDerivedMetrics(
        [plan({ structure: structureWithTarget({ type: "%FTP", intensity: 100 }) })],
        unusedDrizzleDb(),
        noTargetStore,
        PROFILE_ID,
        { asOf },
      ),
    ]);

    expect(watts[0]?.prescriptionQuantification.members[0]?.commonLoad).toMatchObject({
      status: "unavailable",
      method: "power_threshold",
    });
    expect(percent[0]?.prescriptionQuantification.members[0]?.commonLoad).toMatchObject({
      status: "unavailable",
      method: "power_threshold",
    });
  });

  it("changes planned Load identity when only canonical evidence identity changes", async () => {
    const [first] = await getActivityPlansDerivedMetrics(
      [plan()],
      unusedDrizzleDb(),
      store({ powerEvidenceId: "power-evidence-a" }),
      PROFILE_ID,
      { asOf },
    );
    const [second] = await getActivityPlansDerivedMetrics(
      [plan()],
      unusedDrizzleDb(),
      store({ powerEvidenceId: "power-evidence-b" }),
      PROFILE_ID,
      { asOf },
    );

    const firstLoad = first?.prescriptionQuantification.members[0]?.commonLoad;
    const secondLoad = second?.prescriptionQuantification.members[0]?.commonLoad;
    expect(firstLoad).toMatchObject({ status: "available" });
    expect(secondLoad).toMatchObject({ status: "available" });
    if (firstLoad?.status !== "available" || secondLoad?.status !== "available") {
      throw new Error("Expected available Common Load results");
    }
    expect(firstLoad.thresholdEvidence?.sourceFingerprint).not.toBe(
      secondLoad.thresholdEvidence?.sourceFingerprint,
    );
    expect(firstLoad.evidenceFingerprint).not.toBe(secondLoad.evidenceFingerprint);
  });

  it("keeps API metric reconstruction in identity parity with Core planning", async () => {
    const planStructure = distanceRunStructure();
    const inputStore = store({
      runningPlanningThresholdPaceSecondsPerKm: 250,
    }) satisfies EstimationReadStore;
    const snapshot = await loadEstimationSnapshot(inputStore, PROFILE_ID, [], asOf);
    const unusedDb = vi.fn<() => DrizzleDbClient>()();
    const [derived] = await getActivityPlansDerivedMetrics(
      [plan({ structure: planStructure })],
      unusedDb,
      inputStore,
      PROFILE_ID,
      { asOf },
    );
    const planning = estimateActivityPlanForTrainingContext({
      structure: planStructure,
      performanceTargets: snapshot.performanceTargets,
      asOf: asOf.toISOString(),
      planId: "plan-1",
    });
    expect(derived?.duration_estimate).toEqual(planning.durationEstimate);
    expect(derived?.prescriptionQuantification).toEqual(planning.prescriptionQuantification);
    expect(derived?.common_load).toEqual(planning.prescriptionQuantification.summary.commonLoad);
    expect(derived?.prescriptionQuantification.members).toHaveLength(1);
    expect(derived?.duration_estimate).toEqual({
      valueSeconds: 1250,
      status: "estimated",
      basis: "distance_and_pace",
      confidence: "medium",
    });
    expect(derived?.prescriptionQuantification.summary.duration.elapsed).toMatchObject({
      status: "complete",
      value: 1250,
    });
    expect(derived?.prescriptionQuantification.members[0]?.commonLoad).toMatchObject({
      status: "available",
      method: "run_pace_threshold",
      computedAsOf: asOf.toISOString(),
    });
    const runLoad = derived?.prescriptionQuantification.members[0]?.commonLoad;
    expect(runLoad && "intensity" in runLoad ? runLoad.intensity : null).toBeCloseTo(1, 10);
  });

  it("preserves an authored distance when calibration is unavailable", async () => {
    const [result] = await getActivityPlansDerivedMetrics(
      [
        plan({
          structure: structureWithTarget(
            { type: "%FTP", intensity: 100 },
            { type: "distance", meters: 10_000 },
          ),
        }),
      ],
      unusedDrizzleDb(),
      store({ calibrationUnavailable: true }),
      PROFILE_ID,
      { asOf },
    );

    expect(result?.prescriptionQuantification.summary.distance).toMatchObject({
      status: "complete",
      value: 10_000,
    });
    expect(result?.duration_estimate.status).toBe("unavailable");
  });

  it("uses a complete multi-dose aggregate and rejects a partial aggregate as compatibility Load", async () => {
    const [complete] = await getActivityPlansDerivedMetrics(
      [plan({ structure: twoSegmentStructure(true) })],
      unusedDrizzleDb(),
      store(),
      PROFILE_ID,
      { asOf },
    );
    const [partial] = await getActivityPlansDerivedMetrics(
      [plan({ structure: twoSegmentStructure(false) })],
      unusedDrizzleDb(),
      store(),
      PROFILE_ID,
      { asOf },
    );

    expect(complete?.common_load).toMatchObject({ status: "complete", load: 56.25 });
    expect(complete?.duration_estimate).toMatchObject({
      status: "exact",
      valueSeconds: 3600,
    });
    expect(partial?.common_load).toMatchObject({ status: "partial" });
    expect(partial?.duration_estimate.status).toBe("unavailable");
    expect(partial?.prescriptionQuantification.summary.distance).toMatchObject({
      status: "partial",
      value: 5_000,
    });
  });

  it("returns a duplicate-heavy batch from one canonical snapshot", async () => {
    const duplicates = Array.from({ length: 100 }, (_, index) => plan({ id: `plan-${index}` }));
    const result = await getActivityPlansDerivedMetrics(
      duplicates,
      unusedDrizzleDb(),
      store(),
      PROFILE_ID,
      { asOf },
    );

    expect(result).toHaveLength(100);
    expect(result.every((item) => item.duration_estimate.basis === "compiled_time")).toBe(true);
  });

  it("changes deterministically with plan and profile facts", async () => {
    const [base] = await getActivityPlansDerivedMetrics(
      [plan()],
      unusedDrizzleDb(),
      store(),
      PROFILE_ID,
      { asOf },
    );
    const [changedPlan] = await getActivityPlansDerivedMetrics(
      [plan({ structure: structure(3600) })],
      unusedDrizzleDb(),
      store(),
      PROFILE_ID,
      { asOf },
    );
    const [changedProfile] = await getActivityPlansDerivedMetrics(
      [plan()],
      unusedDrizzleDb(),
      store({ powerEvidenceId: "power-evidence-change" }),
      PROFILE_ID,
      { asOf },
    );
    expect(changedPlan?.duration_estimate.valueSeconds).not.toBe(
      base?.duration_estimate.valueSeconds,
    );
    expect(changedProfile?.duration_estimate).toEqual(base?.duration_estimate);
    const changedProfileLoad = changedProfile?.prescriptionQuantification.members[0]?.commonLoad;
    const baseLoad = base?.prescriptionQuantification.members[0]?.commonLoad;
    expect(changedProfileLoad).toMatchObject({ status: "available" });
    expect(baseLoad).toMatchObject({ status: "available" });
    if (changedProfileLoad?.status !== "available" || baseLoad?.status !== "available") {
      throw new Error("Expected available Common Load results");
    }
    expect(changedProfileLoad.evidenceFingerprint).not.toBe(baseLoad.evidenceFingerprint);
  });

  it("returns canonical unavailable quantification for a failed structure", async () => {
    const result = await getActivityPlansDerivedMetrics(
      [
        plan({ structure: structure(1800, "Warning") }),
        plan({
          id: "failed",
          structure: { fail: true },
        }),
      ],
      unusedDrizzleDb(),
      store(),
      PROFILE_ID,
      { asOf },
    );

    expect(result[0]).toMatchObject({
      estimation_status: "estimated",
      estimation_warnings: [],
      duration_estimate: { status: "exact", basis: "compiled_time" },
      common_load: { status: "complete" },
    });
    expect(result[1]).toMatchObject({
      estimation_status: "failed",
      estimate_source: "failed",
      duration_estimate: {
        valueSeconds: null,
        status: "unavailable",
        basis: null,
        confidence: null,
      },
      common_load: { status: "unavailable", reason: "no_load_data" },
    });
    expect(result[1]?.prescriptionQuantification.summary.duration.elapsed).toMatchObject({
      status: "unavailable",
      value: null,
    });
    expect(result[1]?.prescriptionQuantification.summary.distance).toMatchObject({
      status: "unavailable",
      value: null,
    });
  });

  it("returns canonical unavailable quantification when the shared estimation snapshot fails", async () => {
    const inputStore: EstimationReadStore = {
      getEstimationInputs: vi.fn(async () => {
        throw new Error("read failed");
      }),
      readAthletePerformanceEvidenceSnapshot: vi.fn(async () => {
        throw new Error("read failed");
      }),
    };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unusedDb = vi.fn<() => DrizzleDbClient>()();

    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: { invalid: true } })],
      unusedDb,
      inputStore,
      PROFILE_ID,
      { asOf },
    );

    expect(result).toMatchObject({
      estimation_status: "failed",
      estimate_source: "failed",
      duration_estimate: {
        valueSeconds: null,
        status: "unavailable",
        basis: null,
      },
      common_load: { status: "unavailable" },
      prescriptionQuantification: {
        summary: {
          duration: { elapsed: { status: "unavailable", value: null } },
          distance: { status: "unavailable", value: null },
        },
      },
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to load activity-plan derived-metric inputs.",
    );
  });

  it("abstains from planned common Load when threshold provenance is unavailable", async () => {
    const [result] = await getActivityPlansDerivedMetrics(
      [plan()],
      unusedDrizzleDb(),
      store({ metrics: [], calibrationUnavailable: true }),
      PROFILE_ID,
      { asOf },
    );

    expect(result?.prescriptionQuantification.members[0]?.commonLoad).toMatchObject({
      status: "unavailable",
      method: "power_threshold",
      reason: "threshold_missing",
      contributingDurationSeconds: 1800,
    });
    expect(result?.prescriptionQuantification.summary.duration.elapsed).toMatchObject({
      status: "complete",
      value: 1800,
    });
  });

  it("uses category-specific LTHR for a threshold-HR prescription", async () => {
    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: thresholdHrRunStructure() })],
      unusedDrizzleDb(),
      store({ metrics: [runLthrMetric()] }),
      PROFILE_ID,
      { asOf },
    );

    expect(result?.prescriptionQuantification.members[0]?.commonLoad).toMatchObject({
      status: "available",
      activity_category: "run",
      method: "heart_rate_zones",
      contributingDurationSeconds: 1800,
      intensity: 0.8,
      thresholdEvidence: { type: "lthr_bpm", value: 170 },
    });
  });

  it("does not use another activity category's LTHR for a run plan", async () => {
    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: thresholdHrRunStructure() })],
      unusedDrizzleDb(),
      store({ metrics: [runLthrMetric("bike")] }),
      PROFILE_ID,
      { asOf },
    );

    expect(result?.prescriptionQuantification.members[0]?.commonLoad).toMatchObject({
      status: "unavailable",
      activity_category: "run",
      method: "heart_rate_zones",
      reason: "threshold_missing",
    });
  });

  it("treats category-specific LTHR outside the freshness window as missing", async () => {
    const staleMetric = {
      ...runLthrMetric(),
      recorded_at: new Date("2026-03-01T12:00:00.000Z"),
    };
    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: thresholdHrRunStructure() })],
      unusedDrizzleDb(),
      store({ metrics: [staleMetric] }),
      PROFILE_ID,
      { asOf },
    );

    expect(result?.prescriptionQuantification.members[0]?.commonLoad).toMatchObject({
      status: "unavailable",
      activity_category: "run",
      method: null,
      reason: "stale_threshold",
    });
  });

  it("returns failed no-evidence metrics for unsupported old structures", async () => {
    const [result] = await getActivityPlansDerivedMetrics(
      [plan({ structure: { version: 2, intervals: [] } })],
      unusedDrizzleDb(),
      store(),
      PROFILE_ID,
      { asOf },
    );

    expect(result).toMatchObject({
      estimation_status: "failed",
      estimate_source: "failed",
      duration_estimate: { status: "unavailable", valueSeconds: null },
      common_load: { status: "unavailable" },
      prescriptionQuantification: {
        summary: {
          duration: { elapsed: { status: "unavailable", value: null } },
        },
      },
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestPerformanceModelRepository } from "../../test-support/performance-model";
import {
  addEstimationToPlan,
  addEstimationToPlans,
  computePlanMetrics,
  type EstimationReadStore,
  estimatePlannedActivity,
  toEstimationActivityPlan,
} from "../estimation-helpers";

type EstimationInputs = Awaited<ReturnType<EstimationReadStore["getEstimationInputs"]>>;
type EstimationRoute = EstimationInputs["routes"][number];
type TestEstimationRoute = Omit<EstimationRoute, "updated_at"> & { updated_at?: string };
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

function activityPlanStructure(
  activity_category: "bike" | "run" = "bike",
  metadata: Record<string, unknown> = {},
) {
  const targetType =
    typeof metadata.targetType === "string"
      ? metadata.targetType
      : activity_category === "bike"
        ? "%FTP"
        : "%MaxHR";
  const targetIntensity =
    typeof metadata.targetIntensity === "number"
      ? metadata.targetIntensity
      : activity_category === "bike"
        ? 75
        : 70;
  return {
    version: 3,
    segments: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        role: "activity",
        activity_category,
        name: metadata.partial ? "Partial" : activity_category === "bike" ? "Bike" : "Run",
        intervals: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                name: "Step",
                duration: metadata.open
                  ? { type: "untilFinished" }
                  : { type: "time", seconds: 1800 },
                targets: [{ type: targetType, intensity: targetIntensity }],
              },
            ],
          },
        ],
      },
    ],
    ...(metadata.shouldThrow ? { shouldThrow: true } : {}),
  };
}

function createStoreReader(routeFixtures: Record<string, TestEstimationRoute>) {
  const getEstimationInputs = vi.fn(
    async ({
      routeIds,
    }: Parameters<EstimationReadStore["getEstimationInputs"]>[0]): Promise<EstimationInputs> => ({
      routes: routeIds.flatMap((routeId) => {
        const route = routeFixtures[routeId];
        return route
          ? [{ ...route, updated_at: route.updated_at ?? "2026-07-01T00:00:00.000Z" }]
          : [];
      }),
    }),
  );
  const performanceRepository = createTestPerformanceModelRepository({
    cyclingPlanningThresholdPowerWatts: 238,
  });
  const readAthletePerformanceEvidenceSnapshot = vi.fn(
    performanceRepository.readAthletePerformanceEvidenceSnapshot,
  );
  return {
    getEstimationInputs,
    readAthletePerformanceEvidenceSnapshot,
  } satisfies EstimationReadStore;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("estimation-helpers", () => {
  it("derives estimation activity_category from authoritative V3 segments", () => {
    expect(toEstimationActivityPlan({ structure: activityPlanStructure("run") })).toMatchObject({
      activity_category: "run",
    });
  });

  it("adds estimation for a single plan from the store-backed reader without plan route lookup", async () => {
    const estimationReader = createStoreReader({
      "route-1": {
        id: "route-1",
        distance_meters: 42000,
        total_ascent: 350,
        total_descent: 350,
      },
    });

    const result = await addEstimationToPlan(
      {
        id: "plan-1",
        profile_id: PROFILE_ID,
        name: "Long ride",
        description: "",
        structure: activityPlanStructure(),
      },
      estimationReader,
      PROFILE_ID,
    );

    expect(estimationReader.getEstimationInputs).toHaveBeenCalledTimes(1);
    expect(estimationReader.getEstimationInputs).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: PROFILE_ID, routeIds: [] }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        duration_estimate: {
          valueSeconds: 1800,
          status: "exact",
          basis: "compiled_time",
          confidence: "high",
        },
        common_load: expect.objectContaining({
          status: "complete",
          load: 28.125,
          intensity: 0.75,
        }),
        estimated_zones: [],
        confidence: "high",
        confidence_score: 100,
        prescriptionQuantification: expect.objectContaining({
          summary: expect.objectContaining({
            duration: expect.objectContaining({
              elapsed: expect.objectContaining({ status: "complete", value: 1800 }),
            }),
          }),
        }),
        route: null,
      }),
    );
  });

  it("skips null plans and falls back per failing plan without plan route lookups", async () => {
    const estimationReader = createStoreReader({
      "route-1": {
        id: "route-1",
        distance_meters: 10000,
        total_ascent: 50,
        total_descent: 50,
      },
      "route-2": {
        id: "route-2",
        distance_meters: 20000,
        total_ascent: 100,
        total_descent: 100,
      },
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await addEstimationToPlans(
      [
        null,
        {
          id: "plan-1",
          profile_id: PROFILE_ID,
          name: "Route one",
          description: "",
          structure: activityPlanStructure(),
        },
        undefined,
        {
          id: "plan-2",
          profile_id: PROFILE_ID,
          name: "Route one again",
          description: "",
          structure: activityPlanStructure(),
        },
        {
          id: "plan-3",
          profile_id: PROFILE_ID,
          name: "Broken plan",
          description: "",
          structure: activityPlanStructure("bike", { shouldThrow: true }),
        },
      ],
      estimationReader,
      PROFILE_ID,
    );

    expect(result).toHaveLength(3);
    expect(estimationReader.getEstimationInputs).toHaveBeenCalledTimes(1);
    expect(estimationReader.getEstimationInputs).toHaveBeenCalledWith(
      expect.objectContaining({ routeIds: [] }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "plan-1",
        duration_estimate: expect.objectContaining({ status: "exact", valueSeconds: 1800 }),
        prescriptionQuantification: expect.objectContaining({
          summary: expect.objectContaining({ lifecycle: "prescription" }),
        }),
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        id: "plan-2",
        duration_estimate: expect.objectContaining({ status: "exact", valueSeconds: 1800 }),
        prescriptionQuantification: expect.objectContaining({
          summary: expect.objectContaining({ lifecycle: "prescription" }),
        }),
      }),
    );
    expect(result[2]).toEqual(
      expect.objectContaining({
        id: "plan-3",
        estimated_zones: [],
        confidence: "low",
        confidence_score: 0,
        estimation_status: "failed",
        duration_estimate: expect.objectContaining({
          status: "unavailable",
          basis: null,
          valueSeconds: null,
        }),
        common_load: expect.objectContaining({ status: "unavailable" }),
        prescriptionQuantification: expect.objectContaining({
          summary: expect.objectContaining({ lifecycle: "prescription" }),
        }),
      }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("computes metrics without requiring a plan route id", async () => {
    const estimationReader = createStoreReader({
      "route-1": {
        id: "route-1",
        distance_meters: 32000,
        total_ascent: 300,
        total_descent: 300,
      },
    });

    const result = await computePlanMetrics(
      {
        structure: activityPlanStructure(),
      },
      estimationReader,
      PROFILE_ID,
    );

    expect(result).toMatchObject({
      common_load: { status: "complete", load: 28.125, intensity: 0.75 },
      duration_estimate: {
        valueSeconds: 1800,
        status: "exact",
        basis: "compiled_time",
        confidence: "high",
      },
      estimated_duration_seconds: 1800,
      estimated_distance_meters: null,
    });
    expect(result).not.toHaveProperty("estimated_tss");
    expect(result).not.toHaveProperty("intensity_factor");
  });

  it("rejects an out-of-range canonical intensity across every production estimation API", async () => {
    const structure = activityPlanStructure("bike", { targetIntensity: 160 });
    const reader = createStoreReader({});
    const plannedStore = {
      ...reader,
      getActivityPlanById: vi.fn(async () => ({ structure })),
      getLatestFitnessSnapshot: vi.fn(async () => null),
    };

    const [computed, [batched], planned] = await Promise.all([
      computePlanMetrics({ structure }, reader, PROFILE_ID),
      addEstimationToPlans(
        [
          {
            id: "plan-out-of-range",
            profile_id: PROFILE_ID,
            name: "Out of range",
            description: null,
            structure,
          },
        ],
        reader,
        PROFILE_ID,
      ),
      estimatePlannedActivity(
        "plan-out-of-range",
        new Date("2026-07-21T08:00:00.000Z"),
        plannedStore,
        PROFILE_ID,
      ),
    ]);

    expect(computed.prescriptionQuantification.members[0]?.commonLoad).toMatchObject({
      status: "unavailable",
      reason: "intensity_out_of_range",
    });
    expect(batched?.prescriptionQuantification.members[0]?.commonLoad).toMatchObject({
      status: "unavailable",
      reason: "intensity_out_of_range",
    });
    expect(planned.prescriptionQuantification.members[0]?.commonLoad).toMatchObject({
      status: "unavailable",
      reason: "intensity_out_of_range",
    });
    expect(planned.prescriptionQuantification).toMatchObject({
      members: [
        {
          kind: "prescription",
          stage: "scheduled",
          duration: {
            elapsed: { status: "available" },
            active: { status: "available" },
          },
          distance: { status: "unavailable" },
          intensity: { prescribed: { status: "available" } },
          commonLoad: { status: "unavailable", reason: "intensity_out_of_range" },
        },
      ],
      summary: {
        commonLoad: { status: "unavailable" },
      },
    });
    expect(computed.duration_estimate.status).toBe("exact");
  });

  it("uses the canonical planning threshold for explicit watts and percent targets", async () => {
    const wattsStructure = activityPlanStructure("bike", {
      targetType: "watts",
      targetIntensity: 250,
    });
    const percentStructure = activityPlanStructure("bike", {
      targetType: "%FTP",
      targetIntensity: 100,
    });
    const reader = createStoreReader({});
    const plannedStore = {
      ...reader,
      getActivityPlanById: vi.fn(async () => ({ structure: wattsStructure })),
      getLatestFitnessSnapshot: vi.fn(async () => null),
    };

    const [computed, [batched], planned, percent] = await Promise.all([
      computePlanMetrics({ structure: wattsStructure }, reader, PROFILE_ID),
      addEstimationToPlans(
        [
          {
            id: "plan-cp",
            profile_id: PROFILE_ID,
            name: "CP watts",
            description: null,
            structure: wattsStructure,
          },
        ],
        reader,
        PROFILE_ID,
      ),
      estimatePlannedActivity(
        "plan-cp",
        new Date("2026-07-21T08:00:00.000Z"),
        plannedStore,
        PROFILE_ID,
      ),
      computePlanMetrics({ structure: percentStructure }, reader, PROFILE_ID),
    ]);

    expect(computed.common_load).toMatchObject({ status: "complete" });
    expect(batched?.duration_estimate).toMatchObject({
      basis: "compiled_time",
      valueSeconds: 1800,
    });
    expect(planned.common_load).toMatchObject({ status: "complete" });
    expect(percent.common_load).toMatchObject({ status: "complete", load: 50 });
  });

  it("does not treat route distance as authoritative when structure is present", async () => {
    const estimationReader = createStoreReader({
      "route-1": {
        id: "route-1",
        distance_meters: 32000,
        total_ascent: 300,
        total_descent: 300,
      },
    });

    const result = await computePlanMetrics(
      {
        structure: activityPlanStructure(),
      },
      estimationReader,
      PROFILE_ID,
    );

    expect(result).toMatchObject({
      common_load: { status: "complete", load: 28.125 },
      duration_estimate: { status: "exact", basis: "compiled_time", valueSeconds: 1800 },
      estimated_duration_seconds: 1800,
      estimated_distance_meters: null,
    });
    expect(result).not.toHaveProperty("route");
  });
});

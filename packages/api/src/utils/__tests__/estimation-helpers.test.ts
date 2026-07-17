import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/core/estimation", async () => {
  const actual =
    await vi.importActual<typeof import("@repo/core/estimation")>("@repo/core/estimation");

  return {
    ...actual,
    estimateActivity: vi.fn((context: any) => {
      if (context.structure?.shouldThrow) {
        throw new Error("estimation failed");
      }
      if (context.structure?.segments?.[0]?.name === "Partial") {
        return {
          tss: null,
          duration: null,
          intensityFactor: null,
          estimatedDistance: 5000,
          confidence: "low",
          confidenceScore: 40,
          factors: ["partial"],
          warnings: ["Partial evidence"],
        };
      }

      const distanceMeters = context.route?.distanceMeters ?? 0;

      return {
        tss: distanceMeters > 0 ? Math.round(distanceMeters / 1000) : 42,
        duration: distanceMeters > 0 ? Math.round(distanceMeters / 10) : 1800,
        intensityFactor: 0.82,
        confidence: "moderate",
        confidenceScore: 82,
        estimatedPowerZones: [0, 61, 61, 20],
        factors: [],
        warnings: [],
      };
    }),
    estimateMetrics: vi.fn((_estimation: any, context: any) => ({
      calories: 450,
      distance: context.route?.distanceMeters ?? 0,
    })),
  };
});

import * as estimationCore from "@repo/core/estimation";
import {
  addEstimationToPlan,
  addEstimationToPlans,
  computePlanMetrics,
  getEstimationProfileInputsFromStore,
  toEstimationActivityPlan,
} from "../estimation-helpers";

function activityPlanStructure(
  category: "bike" | "run" = "bike",
  metadata: Record<string, unknown> = {},
) {
  return {
    version: 3,
    segments: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        role: "activity",
        category,
        name: metadata.partial ? "Partial" : category === "bike" ? "Bike" : "Run",
        intervals: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                duration: { type: "time", seconds: 1800 },
                targets:
                  category === "bike"
                    ? [{ type: "%FTP", intensity: 75 }]
                    : [{ type: "%MaxHR", intensity: 70 }],
              },
            ],
          },
        ],
      },
    ],
    ...(metadata.shouldThrow ? { shouldThrow: true } : {}),
  };
}

function createStoreReader(routeFixtures: Record<string, Record<string, unknown>>) {
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
          recorded_at: "2026-07-01T00:00:00.000Z",
          activity_id: "00000000-0000-4000-8000-000000000103",
          source: "imported",
          method: "activity_file_best_effort",
          provenance: {
            activity_id: "00000000-0000-4000-8000-000000000103",
            derived_from: "activity_file_stream",
          },
        },
        {
          effort_type: "speed" as const,
          activity_category: "run" as const,
          duration_seconds: 1200,
          value: 15,
          unit: "km_per_hour",
          recorded_at: "2026-07-01T00:00:00.000Z",
          activity_id: "00000000-0000-4000-8000-000000000104",
          source: "imported",
          method: "activity_file_best_effort",
          provenance: {
            activity_id: "00000000-0000-4000-8000-000000000104",
            derived_from: "activity_file_stream",
          },
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

function createLegacyReader(tableResults: Record<string, unknown>) {
  const calls: Array<{ table: string; values: Record<string, unknown> }> = [];

  return {
    calls,
    reader: {
      from(table: string) {
        const values: Record<string, unknown> = {};
        calls.push({ table, values });

        const builder: any = {
          select: vi.fn(() => builder),
          eq: vi.fn((column: string, value: unknown) => {
            values[`eq:${column}`] = value;
            return builder;
          }),
          gte: vi.fn((column: string, value: unknown) => {
            values[`gte:${column}`] = value;
            return builder;
          }),
          lte: vi.fn((column: string, value: unknown) => {
            values[`lte:${column}`] = value;
            return builder;
          }),
          in: vi.fn((column: string, value: unknown) => {
            values[`in:${column}`] = value;
            return builder;
          }),
          order: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          single: vi.fn(async () => ({
            data:
              typeof tableResults[table] === "function"
                ? (tableResults[table] as (values: Record<string, unknown>) => unknown)(values)
                : (tableResults[table] ?? null),
          })),
          then: (onFulfilled: (value: { data: unknown }) => unknown) =>
            Promise.resolve({
              data:
                typeof tableResults[table] === "function"
                  ? (tableResults[table] as (values: Record<string, unknown>) => unknown)(values)
                  : (tableResults[table] ?? []),
            }).then(onFulfilled),
        };

        return builder;
      },
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("estimation-helpers", () => {
  it("derives estimation category from authoritative V3 segments", () => {
    expect(toEstimationActivityPlan({ structure: activityPlanStructure("run") })).toMatchObject({
      activity_category: "run",
    });
  });

  it("uses a direct FTP profile metric when no eligible effort is available", async () => {
    const inputs = await getEstimationProfileInputsFromStore(
      {
        getEstimationInputs: vi.fn(async () => ({
          profile: { dob: null },
          efforts: [],
          metrics: [
            { metric_type: "ftp", unit: "W", value: 271, recorded_at: new Date().toISOString() },
          ],
          routes: [],
        })),
      } as any,
      "profile-1",
    );

    expect(inputs.ftp).toBe(271);
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
        profile_id: "profile-1",
        name: "Long ride",
        description: "",
        structure: activityPlanStructure(),
      },
      estimationReader as any,
      "profile-1",
    );

    expect(estimationReader.getEstimationInputs).toHaveBeenCalledTimes(1);
    expect(estimationReader.getEstimationInputs).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: "profile-1", routeIds: [] }),
    );
    expect(vi.mocked(estimationCore.estimateActivity).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        ftp: 238,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        estimated_calories: 450,
        estimated_zones: ["Z2", "Z3"],
        confidence: "moderate",
        confidence_score: 82,
        authoritative_metrics: expect.objectContaining({
          estimated_tss: 42,
          estimated_duration: 1800,
          intensity_factor: 0.82,
          estimated_distance: 0,
          provenance: expect.objectContaining({
            estimated_tss: "estimated",
            estimated_duration: "estimated",
            intensity_factor: "estimated",
            estimated_distance: "estimated",
          }),
        }),
        route: null,
      }),
    );
  });

  it("adds estimation for a single plan from the legacy reader without plan route lookup", async () => {
    const { reader, calls } = createLegacyReader({
      profiles: { dob: "1990-01-01" },
      activity_efforts: [
        {
          effort_type: "power",
          activity_category: "bike",
          duration_seconds: 1200,
          value: 240,
          unit: "watts",
        },
      ],
      profile_metrics: [{ metric_type: "weight_kg", value: 72, recorded_at: "2026-01-01" }],
      activity_routes: {
        distance_meters: 24000,
        total_ascent: 180,
        total_descent: 180,
      },
    });

    const result = await addEstimationToPlan(
      {
        id: "plan-legacy",
        profile_id: "profile-1",
        name: "Tempo ride",
        description: "",
        structure: activityPlanStructure(),
      },
      reader as any,
      "profile-1",
    );

    expect(calls.map((call) => call.table)).toEqual([
      "profiles",
      "activity_efforts",
      "profile_metrics",
    ]);
    expect(result.authoritative_metrics.estimated_distance).toBe(0);
    expect(vi.mocked(estimationCore.estimateActivity).mock.calls[0]?.[0]).toEqual(
      expect.not.objectContaining({ route: expect.anything() }),
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
          profile_id: "profile-1",
          name: "Route one",
          description: "",
          structure: activityPlanStructure(),
        },
        undefined,
        {
          id: "plan-2",
          profile_id: "profile-1",
          name: "Route one again",
          description: "",
          structure: activityPlanStructure(),
        },
        {
          id: "plan-3",
          profile_id: "profile-1",
          name: "Broken plan",
          description: "",
          structure: activityPlanStructure("bike", { shouldThrow: true }),
        },
      ],
      estimationReader as any,
      "profile-1",
    );

    expect(result).toHaveLength(3);
    expect(estimationReader.getEstimationInputs).toHaveBeenCalledTimes(1);
    expect(estimationReader.getEstimationInputs).toHaveBeenCalledWith(
      expect.objectContaining({ routeIds: [] }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "plan-1",
        authoritative_metrics: expect.objectContaining({ estimated_distance: 0 }),
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        id: "plan-2",
        authoritative_metrics: expect.objectContaining({ estimated_distance: 0 }),
      }),
    );
    expect(result[2]).toEqual(
      expect.objectContaining({
        id: "plan-3",
        estimated_zones: [],
        confidence: "low",
        confidence_score: 0,
        estimation_status: "failed",
        counts_toward_aggregation: false,
        authoritative_metrics: expect.objectContaining({
          estimated_tss: null,
          estimated_duration: null,
          intensity_factor: null,
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
      estimationReader as any,
      "profile-1",
    );

    expect(result).toEqual({
      estimated_tss: 42,
      estimated_duration_seconds: 1800,
      intensity_factor: 0.82,
      estimated_distance_meters: 0,
    });
  });

  it("preserves unknown evidence as null and excludes partial plans from aggregation", async () => {
    const result = await addEstimationToPlan(
      {
        id: "plan-partial",
        profile_id: "profile-1",
        name: "Distance plan",
        description: "",
        structure: activityPlanStructure("run", { partial: true }),
      },
      createStoreReader({}) as any,
      "profile-1",
    );

    expect(result).toMatchObject({
      estimation_status: "partial",
      counts_toward_aggregation: false,
      authoritative_metrics: {
        estimated_tss: null,
        estimated_duration: null,
        intensity_factor: null,
        provenance: {
          estimated_tss: null,
          estimated_duration: null,
          intensity_factor: null,
          estimated_distance: "estimated",
        },
      },
    });
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
      estimationReader as any,
      "profile-1",
    );

    expect(result).toEqual({
      estimated_tss: 42,
      estimated_duration_seconds: 1800,
      intensity_factor: 0.82,
      estimated_distance_meters: 0,
    });
    expect(vi.mocked(estimationCore.estimateActivity).mock.calls.at(-1)?.[0]).toEqual(
      expect.not.objectContaining({ route: expect.anything() }),
    );
  });

  it("computes metrics with a legacy reader without plan route lookup", async () => {
    const { reader } = createLegacyReader({
      profiles: { dob: "1990-01-01" },
      activity_efforts: [],
      profile_metrics: [],
      activity_routes: {
        total_distance: 18000,
        total_ascent: 220,
        total_descent: 220,
        average_grade: 3,
      },
    });

    const result = await computePlanMetrics(
      {
        structure: activityPlanStructure(),
      },
      reader as any,
      "profile-1",
    );

    expect(result).toEqual({
      estimated_tss: 42,
      estimated_duration_seconds: 1800,
      intensity_factor: 0.82,
      estimated_distance_meters: 0,
    });
  });
});

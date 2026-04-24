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
} from "../estimation-helpers";

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
        },
        {
          effort_type: "speed" as const,
          activity_category: "run" as const,
          duration_seconds: 1200,
          value: 15,
          unit: "km_per_hour",
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
  it("adds estimation for a single plan from the store-backed reader", async () => {
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
        activity_category: "bike",
        structure: {},
        route_id: "route-1",
      },
      estimationReader as any,
      "profile-1",
    );

    expect(estimationReader.getEstimationInputs).toHaveBeenCalledTimes(2);
    expect(estimationReader.getEstimationInputs).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ profileId: "profile-1", routeIds: [] }),
    );
    expect(estimationReader.getEstimationInputs).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ profileId: "profile-1", routeIds: ["route-1"] }),
    );
    expect(vi.mocked(estimationCore.estimateActivity).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        ftp: 238,
        thresholdPaceSecondsPerKm: 240,
        route: expect.objectContaining({ distanceMeters: 42000 }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        estimated_calories: 450,
        estimated_zones: ["Z2", "Z3"],
        confidence: "moderate",
        confidence_score: 82,
        authoritative_metrics: {
          estimated_tss: 42,
          estimated_duration: 4200,
          intensity_factor: 0.82,
          estimated_distance: 42000,
        },
        route: {
          distance: 42000,
          ascent: 350,
          descent: 350,
        },
      }),
    );
  });

  it("adds estimation for a single plan from the legacy reader", async () => {
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
        activity_category: "bike",
        structure: {},
        route_id: "route-legacy",
      },
      reader as any,
      "profile-1",
    );

    expect(calls.map((call) => call.table)).toEqual([
      "profiles",
      "activity_efforts",
      "profile_metrics",
      "activity_routes",
    ]);
    expect(result.authoritative_metrics.estimated_distance).toBe(24000);
    expect(vi.mocked(estimationCore.estimateActivity).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ route: expect.objectContaining({ distanceMeters: 24000 }) }),
    );
  });

  it("dedupes routes, skips null plans, and falls back per failing plan", async () => {
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
          activity_category: "bike",
          structure: {},
          route_id: "route-1",
        },
        undefined,
        {
          id: "plan-2",
          profile_id: "profile-1",
          name: "Route one again",
          description: "",
          activity_category: "bike",
          structure: {},
          route_id: "route-1",
        },
        {
          id: "plan-3",
          profile_id: "profile-1",
          name: "Broken plan",
          description: "",
          activity_category: "bike",
          structure: { shouldThrow: true },
          route_id: "route-2",
        },
      ],
      estimationReader as any,
      "profile-1",
    );

    expect(result).toHaveLength(3);
    expect(estimationReader.getEstimationInputs).toHaveBeenCalledTimes(2);
    expect(estimationReader.getEstimationInputs).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ routeIds: ["route-1", "route-2"] }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "plan-1",
        authoritative_metrics: expect.objectContaining({ estimated_distance: 10000 }),
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        id: "plan-2",
        authoritative_metrics: expect.objectContaining({ estimated_distance: 10000 }),
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
          estimated_tss: 0,
          estimated_duration: 0,
          intensity_factor: 0,
        }),
      }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("computes metrics with a store-backed route", async () => {
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
        activity_category: "bike",
        structure: {},
        route_id: "route-1",
      },
      estimationReader as any,
      "profile-1",
    );

    expect(result).toEqual({
      estimated_tss: 32,
      estimated_duration_seconds: 3200,
      intensity_factor: 0.82,
      estimated_distance_meters: 32000,
    });
  });

  it("does not treat attached route distance as authoritative when structure is present", async () => {
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
        activity_category: "bike",
        structure: {
          intervals: [{ id: "interval-1", repetitions: 1, steps: [{ id: "step-1" }] }],
        },
        route_id: "route-1",
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

  it("computes metrics with a legacy route row", async () => {
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
        activity_category: "bike",
        structure: {},
        route_id: "route-legacy",
      },
      reader as any,
      "profile-1",
    );

    expect(result).toEqual({
      estimated_tss: 18,
      estimated_duration_seconds: 1800,
      intensity_factor: 0.82,
      estimated_distance_meters: 18000,
    });
  });
});

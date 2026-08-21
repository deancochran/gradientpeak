import { commonLoadResultSchema } from "@repo/core/load";
import { describe, expect, it, vi } from "vitest";
import {
  type PlanTabProjectionDependencies,
  planTabProjectionInputSchema,
  readPlanTabProjection,
} from "./planTabProjectionService";

const profileId = "11111111-1111-4111-8111-111111111111";
const asOf = new Date("2026-04-06T12:00:00.000Z");
const aggregate = {
  status: "complete" as const,
  model: "gradientpeak_relative_load" as const,
  version: "1" as const,
  load: 60,
  intensity: 0.8,
  contributingDurationSeconds: 3600,
  knownDurationSeconds: 3600,
  contributingActivityCount: 1,
  partialActivityCount: 0,
  unavailableActivityCount: 0,
  unknownDurationActivityCount: 0,
  totalActivityCount: 1,
  activityCountCoverage: 1,
  knownDurationCoverage: 1,
};

function dependencies(): PlanTabProjectionDependencies {
  return {
    readModel: vi.fn(
      async () =>
        ({
          contractVersion: "athlete-read-model-v1",
          profileId,
          asOf: asOf.toISOString(),
          publishedRevision: 7,
          algorithmVersion: "athlete-state-projection-v1",
          currentBaseline: {
            planningTimezone: "America/Los_Angeles",
            currentPlanningDate: "2026-04-06",
            baseline: {
              longTermLoad: 40,
              recentLoad: 35,
              loadBalance: 5,
            },
            planningContext: null,
          },
          loadHistory: null,
        }) as never,
    ),
    readEffectiveLoad: vi.fn(
      async () =>
        ({
          status: "available",
          completed: aggregate,
          remaining: aggregate,
          effective: {
            status: "available",
            periodStartDate: "2026-04-06",
            periodEndDate: "2026-04-06",
            planningDate: "2026-04-06",
            firmItems: [
              {
                kind: "scheduled",
                scheduledItemId: "22222222-2222-4222-8222-222222222222",
                date: "2026-04-06",
                commonLoad: aggregate,
              },
            ],
            tentativeItems: [
              {
                kind: "scheduled",
                scheduledItemId: "55555555-5555-4555-8555-555555555555",
                date: "2026-04-06",
                commonLoad: { ...aggregate, load: 90 },
              },
            ],
            firm: aggregate,
          },
          model: "gradientpeak_relative_load",
          version: "1",
          sourceCounts: { activities: 0, events: 1 },
          resolvedRange: {
            startDate: "2026-04-06",
            endDate: "2026-04-06",
            timezone: "America/Los_Angeles",
          },
          sourceCoverage: {
            activities: { startDate: "2026-04-06", endDate: "2026-04-06", status: "complete" },
            scheduledItems: {
              startDate: "2026-04-06",
              endDate: "2026-04-06",
              status: "complete",
            },
          },
          recommendation: {
            status: "complete",
            policyVersion: "common_load_recommendation_v1",
            model: "gradientpeak_relative_load",
            version: "1",
            source: "applied_training_plan_prescription",
            computedAsOf: asOf.toISOString(),
            planningTimezone: "America/Los_Angeles",
            trainingPlanId: "33333333-3333-4333-8333-333333333333",
            scheduleBatchId: null,
            sourceItemCount: 1,
            coverage: { startDate: "2026-04-06", endDate: "2026-04-06" },
            points: [
              {
                date: "2026-04-06",
                state: "complete",
                load: 70,
                intensity: 0.8,
                aggregate,
                sourceScheduledItemIds: ["22222222-2222-4222-8222-222222222222"],
              },
            ],
          },
        }) as never,
    ),
    readCurrentScheduledPlan: vi.fn(async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Spring plan",
      scheduleBatchId: null,
      nextEventAt: "2026-04-07T15:00:00.000Z",
    })),
    readGoalMarkers: vi.fn(async () => [
      {
        id: "44444444-4444-4444-8444-444444444444",
        label: "A race",
        targetDate: "2026-06-01",
        activityCategory: "bike",
      },
    ]),
    readItemMetadata: vi.fn(async () => ({
      scheduled: new Map([
        ["22222222-2222-4222-8222-222222222222", { title: "Tempo ride", activityCategory: "bike" }],
      ]),
      completed: new Map(),
    })),
  };
}

describe("readPlanTabProjection", () => {
  it("reads every source through one read-only repeatable-read snapshot", async () => {
    const tx = { marker: "snapshot" };
    const transaction = vi.fn(async (operation, config) => {
      expect(config).toEqual({ accessMode: "read only", isolationLevel: "repeatable read" });
      return operation(tx);
    });
    const deps = dependencies();

    const result = await readPlanTabProjection({
      db: { $client: {}, transaction } as never,
      profileId,
      request: { startDate: "2026-04-06", endDate: "2026-04-06" },
      asOf,
      dependencies: deps,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    for (const dependency of Object.values(deps)) {
      expect(dependency).toHaveBeenCalledWith(expect.objectContaining({ db: tx, profileId }));
    }
    expect(result).toMatchObject({
      contractVersion: "plan-tab-projection-v1",
      currentScheduledPlan: { name: "Spring plan" },
      dayLoads: {
        "2026-04-06": {
          status: "complete",
          commonLoad: 60,
          completedLoadStatus: "known_zero",
          scheduledLoadStatus: "complete",
          scheduledLoad: 60,
          remainingLoadStatus: "complete",
          remainingLoad: 60,
          recommendedLoad: 70,
        },
      },
      recommendationPoints: [{ date: "2026-04-06", status: "complete", load: 70 }],
    });
    expect(result.timeline?.days[0]).toMatchObject({
      date: "2026-04-06",
      scheduledItems: [{ title: "Tempo ride", plannedLoad: 60 }],
      load: { scheduledLoad: 60, recommendedLoad: 70 },
    });
    expect(result.fitness.actual).toHaveLength(2);
    expect(result.fitness.actual.at(-1)).toMatchObject({
      date: "2026-04-06",
      longTermLoad: 40,
      recentLoad: 35,
    });
    expect(result.dayLoads["2026-04-06"]).not.toHaveProperty("tentativeLoad");
    expect(result.ledgerItems).toEqual([
      expect.objectContaining({
        id: "22222222-2222-4222-8222-222222222222",
        kind: "planned",
        load: 60,
      }),
    ]);
    expect(deps.readItemMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledIds: ["22222222-2222-4222-8222-222222222222"],
      }),
    );
  });

  it("returns every date in one contiguous 84-day display range", async () => {
    const deps = dependencies();
    const result = await readPlanTabProjection({
      db: {
        $client: {},
        transaction: async (operation: (tx: unknown) => unknown) => operation({}),
      } as never,
      profileId,
      request: { startDate: "2026-02-23", endDate: "2026-05-17" },
      asOf,
      dependencies: deps,
    });

    const dates = result.timeline?.days.map((day) => day.date) ?? [];
    expect(dates).toHaveLength(84);
    expect(dates[0]).toBe("2026-02-23");
    expect(dates.at(-1)).toBe("2026-05-17");
    expect(new Set(dates).size).toBe(84);
    expect(Object.keys(result.dayLoads)).toEqual(dates);
    expect(deps.readEffectiveLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        request: { startDate: "2026-02-23", endDate: "2026-05-17" },
      }),
    );
  });

  it("reports remaining Load as scheduled work less completed work", async () => {
    const deps = dependencies();
    const readEffectiveLoad = deps.readEffectiveLoad;
    deps.readEffectiveLoad = vi.fn(async (input) => {
      const response = await readEffectiveLoad(input);
      if (response.status !== "available" || response.effective.status !== "available") {
        throw new Error("Expected available fixture load");
      }
      return {
        ...response,
        effective: {
          ...response.effective,
          firmItems: [
            {
              kind: "scheduled",
              scheduledItemId: "22222222-2222-4222-8222-222222222222",
              date: "2026-04-06",
              commonLoad: { ...aggregate, load: 40 },
            },
            {
              kind: "completed",
              completedActivityId: "66666666-6666-4666-8666-666666666666",
              replacedScheduledItemId: null,
              date: "2026-04-06",
              commonLoad: { ...aggregate, load: 15 },
            },
          ],
        },
      } as never;
    });

    const result = await readPlanTabProjection({
      db: {
        $client: {},
        transaction: async (operation: (tx: unknown) => unknown) => operation({}),
      } as never,
      profileId,
      request: { startDate: "2026-04-06", endDate: "2026-04-06" },
      asOf,
      dependencies: deps,
    });

    expect(result.dayLoads["2026-04-06"]).toMatchObject({
      scheduledLoad: 40,
      completedLoad: 15,
      remainingLoadStatus: "complete",
      remainingLoad: 25,
    });
    expect(result.timeline?.days[0]?.load).toMatchObject({
      scheduledLoad: 40,
      completedLoad: 15,
      remainingLoad: 25,
    });
  });

  it("publishes finite partial activity Load as the current completed Load", async () => {
    const deps = dependencies();
    const partialAggregate = {
      ...aggregate,
      status: "partial" as const,
      load: 24,
      partialActivityCount: 1,
    };
    deps.readEffectiveLoad = vi.fn(
      async () =>
        ({
          status: "available",
          completed: partialAggregate,
          remaining: { ...aggregate, status: "known_zero", load: 0, intensity: null },
          effective: {
            status: "available",
            periodStartDate: "2026-04-06",
            periodEndDate: "2026-04-06",
            planningDate: "2026-04-06",
            firmItems: [
              {
                kind: "completed",
                completedActivityId: "66666666-6666-4666-8666-666666666666",
                replacedScheduledItemId: null,
                date: "2026-04-06",
                commonLoad: partialAggregate,
              },
            ],
            tentativeItems: [],
            firm: partialAggregate,
          },
          model: "gradientpeak_relative_load",
          version: "1",
          sourceCounts: { activities: 1, events: 0 },
          resolvedRange: {
            startDate: "2026-04-06",
            endDate: "2026-04-06",
            timezone: "America/Los_Angeles",
          },
          sourceCoverage: {
            activities: { startDate: "2026-04-06", endDate: "2026-04-06", status: "complete" },
            scheduledItems: {
              startDate: "2026-04-06",
              endDate: "2026-04-06",
              status: "complete",
            },
          },
          recommendation: { status: "unavailable", reason: "no_active_plan" },
        }) as never,
    );
    deps.readItemMetadata = vi.fn(async () => ({
      scheduled: new Map(),
      completed: new Map([
        [
          "66666666-6666-4666-8666-666666666666",
          { title: "Partial evidence ride", activityCategory: "bike" },
        ],
      ]),
    }));

    const result = await readPlanTabProjection({
      db: {
        $client: {},
        transaction: async (operation: (tx: unknown) => unknown) => operation({}),
      } as never,
      profileId,
      request: { startDate: "2026-04-06", endDate: "2026-04-06" },
      asOf,
      dependencies: deps,
    });

    expect(result.dayLoads["2026-04-06"]).toMatchObject({
      status: "complete",
      commonLoad: 24,
      completedLoadStatus: "partial",
      completedLoad: 24,
      hasUnavailableCompletedLoad: false,
    });
    expect(result.timeline?.days[0]).toMatchObject({
      load: { completedLoad: 24, completedLoadStatus: "partial" },
      completedItems: [
        { title: "Partial evidence ride", completedLoad: 24, completedLoadStatus: "partial" },
      ],
    });
  });

  it("keeps an unavailable completed activity unavailable through the Plan-tab timeline", async () => {
    const deps = dependencies();
    const unavailableLoad = commonLoadResultSchema.parse({
      status: "unavailable",
      model: "gradientpeak_relative_load",
      version: "1",
      activity_category: "bike",
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf: asOf.toISOString(),
      contributingDurationSeconds: null,
      reason: "activity_data_missing",
    });
    deps.readEffectiveLoad = vi.fn(
      async () =>
        ({
          status: "available",
          completed: unavailableLoad,
          remaining: { ...aggregate, status: "known_zero", load: 0, intensity: null },
          effective: {
            status: "available",
            periodStartDate: "2026-04-06",
            periodEndDate: "2026-04-06",
            planningDate: "2026-04-06",
            firmItems: [
              {
                kind: "completed",
                completedActivityId: "77777777-7777-4777-8777-777777777777",
                replacedScheduledItemId: null,
                date: "2026-04-06",
                commonLoad: unavailableLoad,
              },
            ],
            tentativeItems: [],
            firm: unavailableLoad,
          },
          model: "gradientpeak_relative_load",
          version: "1",
          sourceCounts: { activities: 1, events: 0 },
          resolvedRange: {
            startDate: "2026-04-06",
            endDate: "2026-04-06",
            timezone: "America/Los_Angeles",
          },
          sourceCoverage: {
            activities: { startDate: "2026-04-06", endDate: "2026-04-06", status: "complete" },
            scheduledItems: {
              startDate: "2026-04-06",
              endDate: "2026-04-06",
              status: "complete",
            },
          },
          recommendation: { status: "unavailable", reason: "no_active_plan" },
        }) as never,
    );
    deps.readItemMetadata = vi.fn(async () => ({
      scheduled: new Map(),
      completed: new Map([
        [
          "77777777-7777-4777-8777-777777777777",
          { title: "Ride without Load", activityCategory: "bike" },
        ],
      ]),
    }));

    const result = await readPlanTabProjection({
      db: {
        $client: {},
        transaction: async (operation: (tx: unknown) => unknown) => operation({}),
      } as never,
      profileId,
      request: { startDate: "2026-04-06", endDate: "2026-04-06" },
      asOf,
      dependencies: deps,
    });

    expect(result.dayLoads["2026-04-06"]).toMatchObject({
      completedLoad: null,
      completedLoadStatus: "unavailable",
      hasUnavailableCompletedLoad: true,
    });
    expect(result.timeline?.days[0]).toMatchObject({
      load: { completedLoad: null, completedLoadStatus: "unavailable" },
      completedItems: [
        {
          title: "Ride without Load",
          completedLoad: null,
          completedLoadStatus: "unavailable",
        },
      ],
    });
    expect(result.timeline?.weeks[0]?.load).toMatchObject({
      completedLoad: null,
      completedLoadStatus: "unavailable",
    });
  });

  it("uses a genuine known zero when complete source coverage establishes no planned work", async () => {
    const deps = dependencies();
    const readEffectiveLoad = deps.readEffectiveLoad;
    deps.readEffectiveLoad = vi.fn(async (input) => {
      const response = await readEffectiveLoad(input);
      if (response.status !== "available" || response.effective.status !== "available") {
        throw new Error("Expected available fixture load");
      }
      return {
        ...response,
        effective: { ...response.effective, periodEndDate: "2026-04-07" },
        resolvedRange: { ...response.resolvedRange, endDate: "2026-04-07" },
        sourceCoverage: {
          activities: { ...response.sourceCoverage.activities, endDate: "2026-04-07" },
          scheduledItems: { ...response.sourceCoverage.scheduledItems, endDate: "2026-04-07" },
        },
      } as never;
    });
    const result = await readPlanTabProjection({
      db: {
        $client: {},
        transaction: async (operation: (tx: unknown) => unknown) => operation({}),
      } as never,
      profileId,
      request: { startDate: "2026-04-06", endDate: "2026-04-07" },
      asOf,
      dependencies: deps,
    });

    expect(result.dayLoads["2026-04-07"]).toMatchObject({
      remainingLoadStatus: "known_zero",
      remainingLoad: 0,
    });
    expect(result.fitness.actual).toHaveLength(2);
    expect(result.fitness.actual.map((point) => point.date)).toEqual(["2026-04-05", "2026-04-06"]);
    expect(result.fitness.actual.at(-1)).toMatchObject({
      date: "2026-04-06",
      longTermLoad: 40,
      recentLoad: 35,
      loadBalance: 5,
    });
    expect(result.fitness.actual[0]?.longTermLoad).toBe(40);
    expect(result.fitness.scheduled).toEqual([
      expect.objectContaining({ date: "2026-04-06", longTermLoad: 40 }),
      expect.objectContaining({ date: "2026-04-07" }),
    ]);
    expect(result.fitness.scheduled[1]?.longTermLoad).toBeLessThan(40);
  });

  it("keeps empty completed Load unavailable when activity source coverage is partial", async () => {
    const deps = dependencies();
    const readEffectiveLoad = deps.readEffectiveLoad;
    deps.readEffectiveLoad = vi.fn(async (input) => {
      const response = await readEffectiveLoad(input);
      return {
        ...response,
        sourceCoverage: {
          ...response.sourceCoverage,
          activities: {
            startDate: "2026-04-06",
            endDate: "2026-04-06",
            status: "partial" as const,
          },
        },
      } as never;
    });

    const result = await readPlanTabProjection({
      db: {
        $client: {},
        transaction: async (operation: (tx: unknown) => unknown) => operation({}),
      } as never,
      profileId,
      request: { startDate: "2026-04-06", endDate: "2026-04-06" },
      asOf,
      dependencies: deps,
    });

    expect(result.dayLoads["2026-04-06"]).toMatchObject({
      completedLoad: null,
      completedLoadStatus: "unavailable",
    });
    expect(result.timeline?.days[0]?.load).toMatchObject({
      completedLoad: null,
      completedLoadStatus: "unavailable",
    });
  });

  it("returns recorded fitness history before the planned forecast begins", async () => {
    const deps = dependencies();
    const readModel = deps.readModel;
    const readEffectiveLoad = deps.readEffectiveLoad;
    deps.readModel = vi.fn(async (input) => {
      const model = await readModel(input);
      return {
        ...model,
        loadHistory: {
          publishedRevision: 7,
          algorithmVersion: "athlete-state-projection-v1",
          result: {
            status: "available",
            points: [{ date: "2026-04-05", longTermLoad: 40, recentLoad: 35, loadBalance: 5 }],
          },
        },
      } as never;
    });
    deps.readEffectiveLoad = vi.fn(async (input) => {
      const response = await readEffectiveLoad(input);
      if (response.status !== "available" || response.effective.status !== "available") {
        throw new Error("Expected available fixture load");
      }
      return {
        ...response,
        effective: {
          ...response.effective,
          periodStartDate: "2026-04-05",
          periodEndDate: "2026-04-07",
        },
        resolvedRange: {
          ...response.resolvedRange,
          startDate: "2026-04-05",
          endDate: "2026-04-07",
        },
      } as never;
    });

    const result = await readPlanTabProjection({
      db: {
        $client: {},
        transaction: async (operation: (tx: unknown) => unknown) => operation({}),
      } as never,
      profileId,
      request: { startDate: "2026-04-05", endDate: "2026-04-07" },
      asOf,
      dependencies: deps,
    });

    expect(result.fitness.actual).toEqual([
      expect.objectContaining({ date: "2026-04-05", longTermLoad: 40 }),
      expect.objectContaining({ date: "2026-04-06", longTermLoad: 40 }),
    ]);
    expect(result.fitness.scheduled).toEqual([
      expect.objectContaining({ date: "2026-04-06", longTermLoad: 40 }),
      expect.objectContaining({ date: "2026-04-07" }),
    ]);
    expect(result.fitness.scheduled[0]).toEqual(result.fitness.actual.at(-1));
    expect(result.fitness.scheduled[1]?.longTermLoad).toBeLessThan(40);
  });

  it("reconstructs fitness with the same finite partial completed Load shown by the chart", async () => {
    const deps = dependencies();
    const readEffectiveLoad = deps.readEffectiveLoad;
    deps.readEffectiveLoad = vi.fn(async (input) => {
      const response = await readEffectiveLoad(input);
      if (response.status !== "available" || response.effective.status !== "available") {
        throw new Error("Expected available fixture load");
      }
      return {
        ...response,
        effective: {
          ...response.effective,
          periodStartDate: "2026-04-03",
          periodEndDate: "2026-04-07",
          firmItems: [
            {
              kind: "completed",
              completedActivityId: "66666666-6666-4666-8666-666666666666",
              replacedScheduledItemId: null,
              date: "2026-04-04",
              commonLoad: aggregate,
            },
            {
              kind: "completed",
              completedActivityId: "77777777-7777-4777-8777-777777777777",
              replacedScheduledItemId: null,
              date: "2026-04-05",
              commonLoad: { ...aggregate, status: "partial" as const, load: 100 },
            },
            {
              kind: "scheduled",
              scheduledItemId: "22222222-2222-4222-8222-222222222222",
              date: "2026-04-07",
              commonLoad: aggregate,
            },
          ],
        },
        resolvedRange: {
          ...response.resolvedRange,
          startDate: "2026-04-03",
          endDate: "2026-04-07",
        },
        recommendation: { status: "unavailable" as const, reason: "no_active_plan" as const },
      } as never;
    });

    const result = await readPlanTabProjection({
      db: {
        $client: {},
        transaction: async (operation: (tx: unknown) => unknown) => operation({}),
      } as never,
      profileId,
      request: { startDate: "2026-04-03", endDate: "2026-04-07" },
      asOf,
      dependencies: deps,
    });

    const retention = Math.exp(-1 / 42);
    const partialLoadPriorState = (40 / retention - (1 - retention) * 100) / retention;
    expect(result.fitness.actual.map((point) => point.date)).toEqual([
      "2026-04-03",
      "2026-04-04",
      "2026-04-05",
      "2026-04-06",
    ]);
    expect(result.dayLoads["2026-04-05"]?.completedLoad).toBe(100);
    expect(result.fitness.actual[2]?.longTermLoad).toBeCloseTo(40 / retention, 10);
    expect(result.fitness.actual[1]?.longTermLoad).toBeCloseTo(partialLoadPriorState, 10);
    expect(result.fitness.actual[1]?.longTermLoad).toBeLessThan(
      result.fitness.actual[2]?.longTermLoad ?? 0,
    );
    expect(result.fitness.actual.at(-1)).toMatchObject({
      date: "2026-04-06",
      longTermLoad: 40,
      recentLoad: 35,
      loadBalance: 5,
    });
    expect(result.fitness.scheduled[0]).toEqual(result.fitness.actual.at(-1));
    expect(result.fitness.scheduled.at(-1)).toMatchObject({ date: "2026-04-07" });
    expect(result.fitness.scheduled.at(-1)?.longTermLoad).toBeGreaterThan(40);
  });

  it("keeps fallback bounded and stops a future forecast at unresolved source coverage", async () => {
    const db = {
      $client: {},
      transaction: async (operation: (tx: unknown) => unknown) => operation({}),
    } as never;
    const past = await readPlanTabProjection({
      db,
      profileId,
      request: { startDate: "2026-04-04", endDate: "2026-04-05" },
      asOf,
      dependencies: dependencies(),
    });
    const future = await readPlanTabProjection({
      db,
      profileId,
      request: { startDate: "2026-04-07", endDate: "2026-04-08" },
      asOf,
      dependencies: dependencies(),
    });

    expect(past.fitness.actual.map((point) => point.date)).toEqual(["2026-04-06"]);
    expect(past.fitness.scheduled).toEqual([]);
    expect(future.fitness.actual.map((point) => point.date)).toEqual(["2026-04-06"]);
    expect(future.fitness.scheduled).toEqual([]);
  });

  it("anchors history and forecast to the profile planning date across a UTC date boundary", async () => {
    const deps = dependencies();
    const readModel = deps.readModel;
    const readEffectiveLoad = deps.readEffectiveLoad;
    deps.readModel = vi.fn(async (input) => {
      const model = await readModel(input);
      if (!model.currentBaseline) throw new Error("Expected a current baseline fixture");
      return {
        ...model,
        currentBaseline: { ...model.currentBaseline, currentPlanningDate: "2026-04-05" },
      } as never;
    });
    deps.readEffectiveLoad = vi.fn(async (input) => {
      const response = await readEffectiveLoad(input);
      if (response.status !== "available" || response.effective.status !== "available") {
        throw new Error("Expected available fixture load");
      }
      return {
        ...response,
        effective: { ...response.effective, planningDate: "2026-04-05" },
      } as never;
    });

    const result = await readPlanTabProjection({
      db: {
        $client: {},
        transaction: async (operation: (tx: unknown) => unknown) => operation({}),
      } as never,
      profileId,
      request: { startDate: "2026-04-04", endDate: "2026-04-06" },
      asOf: new Date("2026-04-06T01:00:00.000Z"),
      dependencies: deps,
    });

    expect(result.planningTimezone).toBe("America/Los_Angeles");
    expect(result.today).toBe("2026-04-05");
    expect(result.fitness.actual.at(-1)?.date).toBe("2026-04-05");
    expect(result.fitness.scheduled[0]).toEqual(result.fitness.actual.at(-1));
    expect(result.fitness.scheduled.at(-1)?.date).toBe("2026-04-06");
  });

  it("preserves a partial scheduled Load without forecasting it as zero", async () => {
    const deps = dependencies();
    const partialAggregate = {
      ...aggregate,
      status: "partial" as const,
      partialActivityCount: 1,
    };
    deps.readEffectiveLoad = vi.fn(
      async () =>
        ({
          status: "available",
          completed: { ...aggregate, status: "known_zero", load: 0, intensity: null },
          remaining: partialAggregate,
          effective: {
            status: "available",
            periodStartDate: "2026-04-07",
            periodEndDate: "2026-04-07",
            planningDate: "2026-04-06",
            firmItems: [
              {
                kind: "scheduled",
                scheduledItemId: "22222222-2222-4222-8222-222222222222",
                date: "2026-04-07",
                commonLoad: partialAggregate,
              },
            ],
            tentativeItems: [],
            firm: partialAggregate,
          },
          model: "gradientpeak_relative_load",
          version: "1",
          sourceCounts: { activities: 0, events: 1 },
          resolvedRange: {
            startDate: "2026-04-07",
            endDate: "2026-04-07",
            timezone: "America/Los_Angeles",
          },
          sourceCoverage: {
            activities: { startDate: "2026-04-07", endDate: "2026-04-07", status: "complete" },
            scheduledItems: {
              startDate: "2026-04-07",
              endDate: "2026-04-07",
              status: "partial",
            },
          },
          recommendation: { status: "unavailable", reason: "no_active_plan" },
        }) as never,
    );

    const result = await readPlanTabProjection({
      db: {
        $client: {},
        transaction: async (operation: (tx: unknown) => unknown) => operation({}),
      } as never,
      profileId,
      request: { startDate: "2026-04-07", endDate: "2026-04-07" },
      asOf,
      dependencies: deps,
    });

    expect(result.dayLoads["2026-04-07"]).toMatchObject({
      status: "partial",
      commonLoad: 60,
      scheduledLoadStatus: "partial",
      scheduledLoad: 60,
      remainingLoadStatus: "partial",
      remainingLoad: 60,
    });
    expect(result.timeline?.days[0]).toMatchObject({
      load: { scheduledLoad: 60, scheduledLoadStatus: "partial" },
      scheduledItems: [{ plannedLoad: 60, plannedLoadStatus: "partial" }],
    });
    expect(result.ledgerItems).toEqual([
      expect.objectContaining({ kind: "planned", loadStatus: "partial", load: 60 }),
    ]);
    expect(result.fitness.scheduled).toEqual([]);
  });

  it("preserves an unavailable scheduled Load without creating a rest-day zero", async () => {
    const deps = dependencies();
    const readEffectiveLoad = deps.readEffectiveLoad;
    const unavailableLoad = commonLoadResultSchema.parse({
      status: "unavailable",
      model: "gradientpeak_relative_load",
      version: "1",
      activity_category: "bike",
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf: asOf.toISOString(),
      contributingDurationSeconds: null,
      reason: "threshold_missing",
    });
    deps.readEffectiveLoad = vi.fn(async (input) => {
      const response = await readEffectiveLoad(input);
      if (response.status !== "available" || response.effective.status !== "available") {
        throw new Error("Expected available fixture load");
      }
      return {
        ...response,
        remaining: unavailableLoad,
        effective: {
          ...response.effective,
          periodStartDate: "2026-04-07",
          periodEndDate: "2026-04-07",
          firmItems: [
            {
              kind: "scheduled",
              scheduledItemId: "22222222-2222-4222-8222-222222222222",
              date: "2026-04-07",
              commonLoad: unavailableLoad,
            },
          ],
          firm: unavailableLoad,
        },
        resolvedRange: {
          ...response.resolvedRange,
          startDate: "2026-04-07",
          endDate: "2026-04-07",
        },
        recommendation: { status: "unavailable" as const, reason: "no_active_plan" as const },
      } as never;
    });

    const result = await readPlanTabProjection({
      db: {
        $client: {},
        transaction: async (operation: (tx: unknown) => unknown) => operation({}),
      } as never,
      profileId,
      request: { startDate: "2026-04-07", endDate: "2026-04-07" },
      asOf,
      dependencies: deps,
    });

    expect(result.dayLoads["2026-04-07"]).toMatchObject({
      status: "unavailable",
      commonLoad: null,
      scheduledLoadStatus: "unavailable",
      scheduledLoad: null,
      remainingLoadStatus: "unavailable",
      remainingLoad: null,
    });
    expect(result.timeline?.days[0]).toMatchObject({
      load: { scheduledLoad: null, scheduledLoadStatus: "unavailable" },
      scheduledItems: [{ plannedLoad: null, plannedLoadStatus: "unavailable" }],
    });
    expect(result.ledgerItems).toEqual([
      expect.objectContaining({ kind: "planned", loadStatus: "unavailable", load: null }),
    ]);
    expect(result.fitness.scheduled).toEqual([]);
  });

  it("rejects an unbounded request before opening a transaction", async () => {
    const transaction = vi.fn();

    await expect(
      readPlanTabProjection({
        db: { transaction } as never,
        profileId,
        request: { startDate: "2026-01-01", endDate: "2026-04-01" },
        dependencies: dependencies(),
      }),
    ).rejects.toThrow("Plan-tab ranges cannot exceed 90 days");
    expect(transaction).not.toHaveBeenCalled();
    expect(
      planTabProjectionInputSchema.safeParse({
        startDate: "2026-04-07",
        endDate: "2026-04-06",
      }).success,
    ).toBe(false);
  });
});

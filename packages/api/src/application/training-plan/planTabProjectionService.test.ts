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
            baseline: null,
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
      db: { transaction } as never,
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

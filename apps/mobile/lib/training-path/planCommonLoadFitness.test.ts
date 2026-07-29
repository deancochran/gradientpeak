import { describe, expect, it } from "vitest";
import { buildPlanCommonLoadFitnessSeries } from "./planCommonLoadFitness";

const history = {
  status: "available" as const,
  points: [
    {
      date: "2026-07-27",
      longTermLoad: 40,
      recentLoad: 50,
      loadBalance: -10,
    },
  ],
};

describe("buildPlanCommonLoadFitnessSeries", () => {
  it("maps actual history and projects authoritative effective Load", () => {
    const result = buildPlanCommonLoadFitnessSeries({
      history,
      points: [
        {
          date: "2026-07-28",
          effectiveLoadStatus: "complete",
          effectiveLoad: 80,
        },
        {
          date: "2026-07-29",
          effectiveLoadStatus: "known_zero",
          effectiveLoad: 0,
        },
      ],
    });

    expect(result.actualFitnessHistory).toEqual([
      { date: "2026-07-27", ctl: 40, atl: 50, tsb: -10 },
    ]);
    expect(result.projectionStatus).toBe("complete");
    expect(result.projectedFitness.map((point) => point.date)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
    ]);
  });

  it("stops projected fitness at partial effective Load", () => {
    const result = buildPlanCommonLoadFitnessSeries({
      history,
      points: [
        {
          date: "2026-07-28",
          effectiveLoadStatus: "complete",
          effectiveLoad: 80,
        },
        {
          date: "2026-07-29",
          effectiveLoadStatus: "partial",
          effectiveLoad: 20,
        },
      ],
    });

    expect(result.projectionStatus).toBe("partial");
    expect(result.projectedFitness.map((point) => point.date)).toEqual([
      "2026-07-27",
      "2026-07-28",
    ]);
  });

  it("keeps trends unavailable without complete common Load history", () => {
    expect(
      buildPlanCommonLoadFitnessSeries({
        history: { status: "unavailable" },
        points: [],
      }),
    ).toEqual({
      actualFitnessHistory: [],
      projectedFitness: [],
      recommendedFitness: [],
      projectionStatus: "unavailable",
      recommendationProjectionStatus: "unavailable",
    });
  });

  it("projects a validated common-Load recommendation independently from effective Load", () => {
    const result = buildPlanCommonLoadFitnessSeries({
      history,
      points: [],
      recommendation: {
        status: "complete",
        policyVersion: "common_load_recommendation_v1",
        model: "gradientpeak_relative_load",
        version: "1",
        source: "applied_training_plan_prescription",
        computedAsOf: "2026-07-28T12:00:00.000Z",
        planningTimezone: "UTC",
        trainingPlanId: "11111111-1111-4111-8111-111111111111",
        scheduleBatchId: null,
        sourceItemCount: 1,
        coverage: { startDate: "2026-07-28", endDate: "2026-07-29" },
        points: [
          {
            date: "2026-07-28",
            state: "complete",
            load: 80,
            intensity: 0.8,
            aggregate: {} as never,
            sourceScheduledItemIds: ["22222222-2222-4222-8222-222222222222"],
          },
          {
            date: "2026-07-29",
            state: "known_zero",
            load: 0,
            intensity: null,
            sourceScheduledItemIds: [],
          },
        ],
      },
    });

    expect(result.recommendationProjectionStatus).toBe("complete");
    expect(result.recommendedFitness.map((point) => point.date)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
    ]);
  });

  it("stops recommended fitness before an unavailable recommendation day", () => {
    const result = buildPlanCommonLoadFitnessSeries({
      history,
      points: [],
      recommendation: {
        status: "partial",
        coverage: { startDate: "2026-07-28", endDate: "2026-07-29" },
        points: [
          {
            date: "2026-07-28",
            state: "known_zero",
            load: 0,
            intensity: null,
            sourceScheduledItemIds: [],
          },
          { date: "2026-07-29", state: "unavailable", load: null, intensity: null },
        ],
      } as never,
    });

    expect(result.recommendationProjectionStatus).toBe("partial");
    expect(result.recommendedFitness.map((point) => point.date)).toEqual([
      "2026-07-27",
      "2026-07-28",
    ]);
  });
});

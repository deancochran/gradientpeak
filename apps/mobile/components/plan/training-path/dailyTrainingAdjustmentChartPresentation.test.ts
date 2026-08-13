import { describe, expect, it } from "vitest";
import {
  aggregateDailyTrainingAdjustmentPoints,
  buildDailyTrainingAdjustmentCartesianContract,
  buildDailyTrainingAdjustmentChartData,
  buildDailyTrainingAdjustmentChartDomains,
  formatPlanChartDateLabel,
  getPlanChartBucketDate,
  hasRenderableDailyTrainingAdjustmentData,
} from "./dailyTrainingAdjustmentChartPresentation";

describe("daily training adjustment chart presentation", () => {
  it("keeps completed and planned common Load as separate layers", () => {
    expect(
      buildDailyTrainingAdjustmentChartData([
        {
          date: "2026-07-28",
          effectiveCompletedLoad: 35,
          effectiveRemainingLoad: 45,
          plannedLoad: 60,
          hasTargetLoad: true,
          targetLoad: 90,
        },
      ]),
    ).toEqual([
      {
        x: 0,
        completedLoad: 35,
        plannedLoad: 60,
        actualFitness: null,
        projectedFitness: null,
        actualFatigue: null,
        projectedFatigue: null,
      },
    ]);
  });

  it("passes center-valued data through the renderer contract with xKey x", () => {
    const data = buildDailyTrainingAdjustmentChartData(
      [
        { date: "2026-07-28", effectiveRemainingLoad: 20 },
        { date: "2026-07-29", effectiveRemainingLoad: 30 },
      ],
      { bucketCenters: [120, 168] },
    );
    expect(buildDailyTrainingAdjustmentCartesianContract(data)).toMatchObject({
      xKey: "x",
      data: [{ x: 120 }, { x: 168 }],
    });
  });

  it("recognizes only data that can produce a visible chart mark or trend", () => {
    expect(hasRenderableDailyTrainingAdjustmentData([{ date: "2026-07-28" }])).toBe(false);
    expect(
      hasRenderableDailyTrainingAdjustmentData([
        { date: "2026-07-28", effectiveRemainingLoad: 40 },
      ]),
    ).toBe(true);
    expect(hasRenderableDailyTrainingAdjustmentData([{ date: "2026-07-28", fitnessCtl: 0 }])).toBe(
      true,
    );
  });

  it("does not reinterpret legacy recommendation values as common chart data", () => {
    expect(
      hasRenderableDailyTrainingAdjustmentData([
        {
          date: "2026-07-28",
          hasTargetLoad: false,
          targetLoad: 80,
          targetFitnessCtl: 999,
        },
      ]),
    ).toBe(false);
    expect(
      buildDailyTrainingAdjustmentChartData([
        { date: "2026-07-28", targetLoad: 80, targetFitnessCtl: 999 },
      ])[0],
    ).not.toHaveProperty("targetLoad");
  });

  it("does not adapt recommendation or target fields into chart data", () => {
    const result = buildDailyTrainingAdjustmentChartData([
      {
        date: "2026-07-28",
        recommendedLoadStatus: "complete",
        recommendedLoad: 80,
        targetLoad: 1_000,
        targetFitnessCtl: 50,
      },
    ])[0];
    expect(result).not.toHaveProperty("targetLoad");
    expect(result).not.toHaveProperty("recommendedFitness");
  });

  it("does not use zero for an unavailable planned base", () => {
    const chartData = buildDailyTrainingAdjustmentChartData([
      {
        date: "2026-07-28",
        effectiveRemainingLoad: null,
      },
    ]);
    expect(chartData[0]).toMatchObject({ plannedLoad: null });
    expect(buildDailyTrainingAdjustmentChartDomains(chartData)).toEqual({
      fitnessDomain: [0, 100],
      loadDomain: [0, 100],
    });
  });

  it("uses calendar-aware daily, weekly, and monthly x-axis buckets", () => {
    expect(getPlanChartBucketDate("2026-07-01", "daily")).toBe("2026-07-01");
    expect(getPlanChartBucketDate("2026-07-01", "weekly")).toBe("2026-06-29");
    expect(getPlanChartBucketDate("2026-07-01", "monthly")).toBe("2026-07-01");
    expect(formatPlanChartDateLabel("2026-06-29", "weekly")).toBe("Jun 29");
    expect(formatPlanChartDateLabel("2026-07-01", "monthly")).toBe("Jul ’26");
  });

  it("aggregates only supplied bounded points and never manufactures a period recommendation", () => {
    const points = [
      {
        date: "2026-06-29",
        effectiveLoadStatus: "complete" as const,
        effectiveCompletedLoad: 10,
        effectiveRemainingLoad: 20,
        recommendedLoadStatus: "complete" as const,
        recommendedLoad: 30,
        fitnessCtl: 40,
      },
      {
        date: "2026-07-01",
        effectiveLoadStatus: "complete" as const,
        effectiveCompletedLoad: 5,
        effectiveRemainingLoad: 15,
        recommendedLoadStatus: "unavailable" as const,
        recommendedLoad: null,
        scheduledFitnessCtl: 42,
      },
    ];

    expect(aggregateDailyTrainingAdjustmentPoints(points, "weekly")).toEqual([
      expect.objectContaining({
        date: "2026-06-29",
        effectiveCompletedLoad: 15,
        effectiveRemainingLoad: 35,
        fitnessCtl: 40,
        scheduledFitnessCtl: 42,
      }),
    ]);
    expect(aggregateDailyTrainingAdjustmentPoints(points, "monthly")).toHaveLength(2);
  });

  it("splits actual and planned fitness and fatigue at Today", () => {
    const points = [
      {
        date: "2026-06-01",
        fitnessCtl: 40,
        scheduledFitnessCtl: 41,
        actualFatigueAtl: 45,
        scheduledFatigueAtl: 46,
      },
      {
        date: "2026-06-02",
        fitnessCtl: 41,
        scheduledFitnessCtl: 43,
        actualFatigueAtl: 47,
        scheduledFatigueAtl: 48,
      },
    ];

    expect(
      buildDailyTrainingAdjustmentChartData(points, {
        todayDate: "2026-06-01",
      }),
    ).toEqual([
      expect.objectContaining({
        actualFitness: 40,
        projectedFitness: 41,
        actualFatigue: 45,
        projectedFatigue: 46,
      }),
      expect.objectContaining({
        actualFitness: null,
        projectedFitness: 43,
        actualFatigue: null,
        projectedFatigue: 48,
      }),
    ]);
  });
});

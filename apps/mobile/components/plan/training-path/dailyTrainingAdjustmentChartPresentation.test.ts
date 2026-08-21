import { describe, expect, it } from "vitest";
import {
  aggregateDailyTrainingAdjustmentPoints,
  buildDailyTrainingAdjustmentAccessibilityValue,
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
        form: null,
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

  it("preserves unavailable planned load instead of converting it to zero", () => {
    const chartData = buildDailyTrainingAdjustmentChartData([
      {
        date: "2026-07-28",
        effectiveRemainingLoad: null,
      },
    ]);
    expect(chartData[0]).toMatchObject({ plannedLoad: null });
    expect(buildDailyTrainingAdjustmentChartDomains(chartData)).toEqual({
      fitnessDomain: [0, 100],
      formDomain: [-11, 11],
      loadDomain: [0, 100],
    });
  });

  it("preserves an explicit known-zero planned load", () => {
    const chartData = buildDailyTrainingAdjustmentChartData([
      { date: "2026-07-28", plannedLoad: 0 },
    ]);

    expect(chartData[0]).toMatchObject({ plannedLoad: 0 });
  });

  it("keeps unavailable-only completed Load as a gap and labels it unavailable", () => {
    const point = {
      date: "2026-07-28",
      effectiveCompletedLoad: null,
      effectiveCompletedLoadStatus: "unavailable" as const,
    };

    expect(buildDailyTrainingAdjustmentChartData([point])[0]).toMatchObject({
      completedLoad: null,
    });
    expect(buildDailyTrainingAdjustmentAccessibilityValue(point)).toContain(
      "Completed Common Load unavailable",
    );
  });

  it("focuses the Fitness / Fatigue scale so load-driven movement remains visible", () => {
    const chartData = buildDailyTrainingAdjustmentChartData([
      { date: "2026-07-28", fitnessCtl: 110, actualFatigueAtl: 116 },
      { date: "2026-07-29", fitnessCtl: 114, actualFatigueAtl: 120 },
    ]);

    expect(buildDailyTrainingAdjustmentChartDomains(chartData).fitnessDomain).toEqual([
      108.8, 121.2,
    ]);
  });

  it("keeps the focused Fitness / Fatigue scale ordered for unexpected negative values", () => {
    const chartData = buildDailyTrainingAdjustmentChartData([
      { date: "2026-07-28", fitnessCtl: -12 },
      { date: "2026-07-29", fitnessCtl: -8 },
    ]);

    expect(buildDailyTrainingAdjustmentChartDomains(chartData).fitnessDomain).toEqual([-13.2, 0]);
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
        effectiveCompletedLoadStatus: "partial",
        effectiveLoadStatus: "partial",
        effectiveRemainingLoad: 35,
        fitnessCtl: 40,
        scheduledFitnessCtl: 42,
      }),
    ]);
    expect(aggregateDailyTrainingAdjustmentPoints(points, "monthly")).toHaveLength(2);
  });

  it("marks only a complete seven-day weekly bucket as complete", () => {
    const completeWeek = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-06-${String(index + 1).padStart(2, "0")}`,
      effectiveLoadStatus: "complete" as const,
      effectiveCompletedLoad: 10,
      effectiveCompletedLoadStatus: "complete" as const,
      effectiveRemainingLoad: 20,
    }));

    expect(aggregateDailyTrainingAdjustmentPoints(completeWeek, "weekly")[0]).toMatchObject({
      effectiveCompletedLoadStatus: "complete",
      effectiveLoadStatus: "complete",
    });
  });

  it("keeps a known planned subtotal visible when another included day is unavailable", () => {
    const points = [
      { date: "2026-06-29", plannedLoad: 0 },
      { date: "2026-06-30", plannedLoad: null },
    ];

    expect(aggregateDailyTrainingAdjustmentPoints(points, "weekly")[0]).toMatchObject({
      plannedLoad: 0,
      plannedLoadStatus: "partial",
      effectiveRemainingLoad: null,
    });
    expect(aggregateDailyTrainingAdjustmentPoints(points, "monthly")[0]).toMatchObject({
      plannedLoad: 0,
      plannedLoadStatus: "partial",
      effectiveRemainingLoad: null,
    });
  });

  it("keeps finite partial planned and remaining totals visible as incomplete", () => {
    const result = aggregateDailyTrainingAdjustmentPoints(
      [
        {
          date: "2026-06-01",
          plannedLoad: 30,
          plannedLoadStatus: "partial",
          effectiveRemainingLoad: 20,
          effectiveRemainingLoadStatus: "partial",
        },
        {
          date: "2026-06-02",
          plannedLoad: 10,
          plannedLoadStatus: "complete",
          effectiveRemainingLoad: 5,
          effectiveRemainingLoadStatus: "complete",
        },
      ],
      "weekly",
    )[0];

    expect(result).toMatchObject({
      plannedLoad: 40,
      plannedLoadStatus: "partial",
      effectiveRemainingLoad: 25,
      effectiveRemainingLoadStatus: "partial",
    });
    expect(buildDailyTrainingAdjustmentAccessibilityValue(result ?? null)).toContain(
      "Planned Common Load 40 incomplete",
    );
  });

  it("keeps known-zero planned Load distinct from unavailable in accessibility copy", () => {
    expect(
      buildDailyTrainingAdjustmentAccessibilityValue({
        date: "2026-06-01",
        plannedLoad: 0,
        plannedLoadStatus: "known_zero",
      }),
    ).toContain("Planned Common Load 0, no planned load");
    expect(
      buildDailyTrainingAdjustmentAccessibilityValue({
        date: "2026-06-01",
        plannedLoad: null,
        plannedLoadStatus: "unavailable",
      }),
    ).toContain("Planned Common Load unavailable");
  });

  it("aggregates known plus unavailable completed Load as a partial known subtotal", () => {
    const result = aggregateDailyTrainingAdjustmentPoints(
      [
        {
          date: "2026-06-29",
          effectiveLoadStatus: "complete",
          effectiveCompletedLoad: 18,
          effectiveCompletedLoadStatus: "complete",
        },
        {
          date: "2026-06-30",
          effectiveLoadStatus: "unavailable",
          effectiveCompletedLoad: null,
          effectiveCompletedLoadStatus: "unavailable",
        },
      ],
      "weekly",
    )[0];

    expect(result).toMatchObject({
      effectiveCompletedLoad: 18,
      effectiveCompletedLoadStatus: "partial",
      effectiveLoadStatus: "partial",
    });
    expect(buildDailyTrainingAdjustmentAccessibilityValue(result ?? null)).toContain(
      "Completed Common Load 18 incomplete",
    );
  });

  it("splits actual and planned fitness and fatigue at Today", () => {
    const points = [
      {
        date: "2026-05-31",
        fitnessCtl: 39,
        actualFatigueAtl: 44,
        formTsb: -5,
      },
      {
        date: "2026-06-01",
        fitnessCtl: 40,
        scheduledFitnessCtl: 41,
        actualFatigueAtl: 45,
        scheduledFatigueAtl: 46,
        formTsb: 0,
      },
      {
        date: "2026-06-02",
        fitnessCtl: 41,
        scheduledFitnessCtl: 43,
        actualFatigueAtl: 47,
        scheduledFatigueAtl: 48,
        formTsb: 12,
      },
    ];

    expect(
      buildDailyTrainingAdjustmentChartData(points, {
        todayDate: "2026-06-01",
      }),
    ).toEqual([
      expect.objectContaining({
        actualFitness: 39,
        projectedFitness: null,
        actualFatigue: 44,
        projectedFatigue: null,
        form: -5,
      }),
      expect.objectContaining({
        actualFitness: 40,
        projectedFitness: 41,
        actualFatigue: 45,
        projectedFatigue: 46,
        form: 0,
      }),
      expect.objectContaining({
        actualFitness: null,
        projectedFitness: 43,
        actualFatigue: null,
        projectedFatigue: 48,
        form: 12,
      }),
    ]);
    expect(
      buildDailyTrainingAdjustmentChartDomains(
        buildDailyTrainingAdjustmentChartData(points, { todayDate: "2026-06-01" }),
      ).formDomain,
    ).toEqual([-14, 14]);
  });
});

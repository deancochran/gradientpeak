import { describe, expect, it } from "vitest";
import {
  buildDailyTrainingAdjustmentChartData,
  hasRenderableDailyTrainingAdjustmentData,
} from "./dailyTrainingAdjustmentChartPresentation";

describe("daily training adjustment chart presentation", () => {
  it("keeps completed, planned, and tentative common Load as separate layers", () => {
    expect(
      buildDailyTrainingAdjustmentChartData([
        {
          date: "2026-07-28",
          effectiveCompletedLoad: 35,
          effectiveRemainingLoad: 45,
          effectiveTentativeLoad: 10,
          hasTargetLoad: true,
          targetLoadTss: 90,
        },
      ]),
    ).toEqual([
      {
        index: 0,
        completedLoad: 35,
        plannedLoad: 45,
        plannedLoadWithTentative: 55,
        targetLoad: null,
        actualFitness: null,
        projectedFitness: null,
        recommendedFitness: null,
      },
    ]);
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
          targetLoadTss: 80,
          targetFitnessCtl: 999,
        },
      ]),
    ).toBe(false);
    expect(
      buildDailyTrainingAdjustmentChartData([
        { date: "2026-07-28", targetLoadTss: 80, targetFitnessCtl: 999 },
      ])[0],
    ).toMatchObject({ targetLoad: null, recommendedFitness: null });
  });

  it("plots only an explicitly available common-Load recommendation", () => {
    expect(
      buildDailyTrainingAdjustmentChartData([
        {
          date: "2026-07-28",
          recommendedLoadStatus: "complete",
          recommendedLoad: 80,
          targetLoadTss: 1_000,
        },
        {
          date: "2026-07-29",
          recommendedLoadStatus: "partial",
          recommendedLoad: 40,
          targetFitnessCtl: 50,
        },
        {
          date: "2026-07-30",
          recommendedLoadStatus: "unavailable",
          recommendedLoad: null,
          targetFitnessCtl: 60,
        },
      ]).map((point) => [point.targetLoad, point.recommendedFitness]),
    ).toEqual([
      [80, null],
      [null, null],
      [null, null],
    ]);
  });

  it("does not use zero for an unavailable planned base when tentative Load is known", () => {
    expect(
      buildDailyTrainingAdjustmentChartData([
        {
          date: "2026-07-28",
          effectiveRemainingLoad: null,
          effectiveTentativeLoad: 25,
        },
      ])[0],
    ).toMatchObject({ plannedLoad: null, plannedLoadWithTentative: null });
  });
});

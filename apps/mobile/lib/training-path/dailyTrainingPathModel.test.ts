import { describe, expect, it } from "vitest";
import {
  aggregateDailyTrainingAdjustmentsToWeeks,
  buildDailyTrainingAdjustmentPointsFromTrainingPathData,
  getDailyTrainingAdjustmentSummary,
  normalizeDailyTrainingAdjustmentPoints,
} from "./dailyTrainingPathModel";

describe("dailyTrainingPathModel", () => {
  it("normalizes sparse inputs into contiguous daily points", () => {
    const points = normalizeDailyTrainingAdjustmentPoints({
      startDate: "2026-06-01",
      endDate: "2026-06-03",
      points: [{ date: "2026-06-02", plannedLoadTss: 30, targetLoadTss: 40 }],
    });

    expect(points.map((point) => point.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(points[1]).toMatchObject({
      plannedLoadTss: 30,
      targetLoadTss: 40,
      actualOrScheduledLoadTss: 30,
      loadDeltaTss: -10,
      plannedDeltaTss: -10,
    });
  });

  it("returns a selected-day summary with signed delta labels", () => {
    const points = normalizeDailyTrainingAdjustmentPoints({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      points: [{ date: "2026-06-01", actualOrScheduledLoadTss: 55, targetLoadTss: 40 }],
    });

    expect(getDailyTrainingAdjustmentSummary({ points, selectedDate: "2026-06-01" })).toMatchObject(
      {
        date: "2026-06-01",
        loadDeltaLabel: "+15 TSS",
        plannedDeltaLabel: "-40 TSS",
        loadDeltaTone: "increase",
      },
    );
  });

  it("aggregates daily points into weekly compatibility buckets", () => {
    const points = normalizeDailyTrainingAdjustmentPoints({
      startDate: "2026-06-01",
      endDate: "2026-06-08",
      points: [
        { date: "2026-06-01", plannedLoadTss: 10, targetLoadTss: 20 },
        { date: "2026-06-08", plannedLoadTss: 30, targetLoadTss: 10 },
      ],
    });

    const weeks = aggregateDailyTrainingAdjustmentsToWeeks(points);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({
      weekStartDate: "2026-06-01",
      weekEndDate: "2026-06-07",
      plannedLoadTss: 10,
      targetLoadTss: 20,
      loadDeltaTss: -10,
    });
    expect(weeks[1]).toMatchObject({
      weekStartDate: "2026-06-08",
      weekEndDate: "2026-06-08",
      plannedLoadTss: 30,
      targetLoadTss: 10,
      loadDeltaTss: 20,
    });
  });

  it("maps training path timeline and fitness inputs into daily adjustment points", () => {
    const points = buildDailyTrainingAdjustmentPointsFromTrainingPathData({
      timeline: [
        {
          date: "2026-06-01",
          scheduled_load_tss: 40,
          tentative_scheduled_load_tss: 10,
          completed_load_tss: 20,
          recommended_load_tss: 60,
        },
      ],
      fitnessHistory: [{ date: "2026-06-01", ctl: 42, atl: 50, tsb: -8 }],
      idealFitnessCurve: [{ date: "2026-06-01", ctl: 44 }],
      scheduledFitnessTrend: [{ date: "2026-06-01", ctl: 43, atl: 52, tsb: -9 }],
    });

    expect(points[0]).toMatchObject({
      date: "2026-06-01",
      plannedLoadTss: 40,
      tentativePlannedLoadTss: 10,
      completedLoadTss: 20,
      targetLoadTss: 60,
      actualOrScheduledLoadTss: 70,
      loadDeltaTss: 10,
      plannedDeltaTss: -10,
      fitnessCtl: 42,
      targetFitnessCtl: 44,
      scheduledFitnessCtl: 43,
      fatigueAtl: 52,
      formTsb: -9,
    });
  });
});

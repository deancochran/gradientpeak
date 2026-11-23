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
      points: [{ date: "2026-06-02", plannedLoad: 30, targetLoad: 40 }],
    });

    expect(points.map((point) => point.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(points[1]).toMatchObject({
      plannedLoad: 30,
      targetLoad: 40,
      actualOrScheduledLoad: null,
      loadDelta: null,
      plannedDelta: -10,
    });
    expect(points[0]).toMatchObject({ plannedLoad: null, targetLoad: null });
    expect(points[2]).toMatchObject({ plannedLoad: null, targetLoad: null });
  });

  it("combines completed load with remaining scheduled load", () => {
    const [point] = normalizeDailyTrainingAdjustmentPoints({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      points: [
        {
          date: "2026-06-01",
          plannedLoad: 40,
          completedLoad: 35,
          targetLoad: 50,
        },
      ],
    });

    expect(point).toMatchObject({
      plannedLoad: 40,
      completedLoad: 35,
      actualOrScheduledLoad: 40,
      loadDelta: -10,
      plannedDelta: -10,
    });
  });

  it("returns a selected-day summary with signed delta labels", () => {
    const points = normalizeDailyTrainingAdjustmentPoints({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      points: [{ date: "2026-06-01", actualOrScheduledLoad: 55, targetLoad: 40 }],
    });

    expect(getDailyTrainingAdjustmentSummary({ points, selectedDate: "2026-06-01" })).toMatchObject(
      {
        date: "2026-06-01",
        loadDeltaLabel: "+15 Load",
        plannedDeltaLabel: null,
        loadDeltaTone: "increase",
      },
    );
  });

  it("keeps no-goal summaries nullable instead of emitting target comparison copy", () => {
    const points = normalizeDailyTrainingAdjustmentPoints({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      points: [{ date: "2026-06-01", completedLoad: 55, hasTargetLoad: false }],
    });

    expect(getDailyTrainingAdjustmentSummary({ points })).toMatchObject({
      loadDeltaLabel: null,
      plannedDeltaLabel: null,
      loadDeltaTone: null,
      point: { hasTargetLoad: false },
    });
  });

  it("aggregates daily points into weekly compatibility buckets", () => {
    const points = normalizeDailyTrainingAdjustmentPoints({
      startDate: "2026-06-01",
      endDate: "2026-06-08",
      points: [
        { date: "2026-06-01", plannedLoad: 10, targetLoad: 20 },
        { date: "2026-06-08", plannedLoad: 30, targetLoad: 10 },
      ],
    });

    const weeks = aggregateDailyTrainingAdjustmentsToWeeks(points);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({
      weekStartDate: "2026-06-01",
      weekEndDate: "2026-06-07",
      plannedLoad: null,
      targetLoad: null,
      plannedDelta: null,
    });
    expect(weeks[1]).toMatchObject({
      weekStartDate: "2026-06-08",
      weekEndDate: "2026-06-08",
      plannedLoad: 30,
      targetLoad: 10,
      loadDelta: null,
    });
  });

  it("preserves an explicit planned zero as known instead of unavailable", () => {
    const [point] = normalizeDailyTrainingAdjustmentPoints({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      points: [{ date: "2026-06-01", completedLoad: 0, plannedLoad: 0, targetLoad: 0 }],
    });

    expect(point).toMatchObject({
      actualOrScheduledLoad: 0,
      completedLoad: 0,
      plannedLoad: 0,
      targetLoad: 0,
    });
  });

  it("maps training path timeline and fitness inputs into daily adjustment points", () => {
    const points = buildDailyTrainingAdjustmentPointsFromTrainingPathData({
      timeline: [
        {
          date: "2026-06-01",
          scheduled_common_load: 40,
          completed_common_load: 20,
          recommended_common_load: 60,
        },
      ],
      fitnessHistory: [{ date: "2026-06-01", longTermLoad: 42, recentLoad: 50, loadBalance: -8 }],
      idealFitnessCurve: [{ date: "2026-06-01", longTermLoad: 44 }],
      scheduledFitnessTrend: [
        { date: "2026-06-01", longTermLoad: 43, recentLoad: 52, loadBalance: -9 },
      ],
    });

    expect(points[0]).toMatchObject({
      date: "2026-06-01",
      plannedLoad: 40,
      completedLoad: 20,
      targetLoad: 60,
      actualOrScheduledLoad: 40,
      loadDelta: -20,
      plannedDelta: -20,
      fitnessCtl: 42,
      targetFitnessCtl: 44,
      scheduledFitnessCtl: 43,
      fatigueAtl: 52,
      formTsb: -9,
    });
  });
});

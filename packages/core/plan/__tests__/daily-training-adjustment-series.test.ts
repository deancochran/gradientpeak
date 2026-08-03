import { describe, expect, it } from "vitest";
import { buildTrainingAdjustmentDailySeries } from "../dailyTrainingAdjustmentSeries";

describe("buildTrainingAdjustmentDailySeries", () => {
  it("returns a contiguous daily range without fabricating missing load evidence", () => {
    const points = buildTrainingAdjustmentDailySeries({
      startDate: "2026-06-01",
      endDate: "2026-06-03",
    });

    expect(points.map((point) => point.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(points[1]).toMatchObject({
      plannedLoad: null,
      tentativePlannedLoad: null,
      completedLoad: null,
      targetLoad: null,
      actualOrScheduledLoad: null,
      loadDeltaLoad: null,
      plannedDeltaLoad: null,
      annotations: [],
    });
  });

  it("computes daily load deltas from target, planned, tentative, and actual inputs", () => {
    const points = buildTrainingAdjustmentDailySeries({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      plannedLoadByDate: { "2026-06-01": 45 },
      tentativePlannedLoadByDate: { "2026-06-01": 15 },
      completedLoadByDate: { "2026-06-01": 30 },
      targetLoadByDate: { "2026-06-01": 50 },
      actualOrScheduledLoadByDate: { "2026-06-01": 55 },
    });

    expect(points[0]).toMatchObject({
      actualOrScheduledLoad: 55,
      loadDeltaLoad: 5,
      plannedDeltaLoad: 10,
    });
  });

  it("replaces scheduled forecast with completed load instead of double counting it", () => {
    const [point] = buildTrainingAdjustmentDailySeries({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      completedLoadByDate: new Map([["2026-06-01", 20]]),
      plannedLoadByDate: new Map([["2026-06-01", 35]]),
      tentativePlannedLoadByDate: new Map([["2026-06-01", 0]]),
      targetLoadByDate: new Map([["2026-06-01", 45]]),
    });

    expect(point?.actualOrScheduledLoad).toBe(35);
    expect(point?.actualOrScheduledLoad).not.toBe(55);
    expect(point?.loadDeltaLoad).toBe(-10);
  });

  it("keeps a partially evidenced day unavailable while retaining derivable planned delta", () => {
    const [point] = buildTrainingAdjustmentDailySeries({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      plannedLoadByDate: { "2026-06-01": 35 },
      tentativePlannedLoadByDate: { "2026-06-01": 0 },
      targetLoadByDate: { "2026-06-01": 45 },
    });

    expect(point).toMatchObject({
      completedLoad: null,
      actualOrScheduledLoad: null,
      loadDeltaLoad: null,
      plannedDeltaLoad: -10,
    });
  });

  it("preserves an explicitly unavailable actual-or-scheduled value", () => {
    const [point] = buildTrainingAdjustmentDailySeries({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      plannedLoadByDate: { "2026-06-01": 35 },
      tentativePlannedLoadByDate: { "2026-06-01": 0 },
      completedLoadByDate: { "2026-06-01": 20 },
      targetLoadByDate: { "2026-06-01": 45 },
      actualOrScheduledLoadByDate: { "2026-06-01": null },
    });

    expect(point).toMatchObject({ actualOrScheduledLoad: null, loadDeltaLoad: null });
  });

  it("preserves optional metrics, annotations, and source metadata", () => {
    const [point] = buildTrainingAdjustmentDailySeries({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      fitnessLongTermLoadByDate: { "2026-06-01": 71.2 },
      fatigueRecentLoadByDate: { "2026-06-01": 80.5 },
      formLoadBalanceByDate: { "2026-06-01": -9.3 },
      readinessScoreByDate: { "2026-06-01": 0.82 },
      annotationsByDate: {
        "2026-06-01": [{ code: "goal-week", severity: "info", message: "Goal week" }],
      },
      sourceByDate: {
        "2026-06-01": { target: "goal_projection", planned: "builder", completed: "none" },
      },
    });

    expect(point).toMatchObject({
      fitnessLongTermLoad: 71.2,
      fatigueRecentLoad: 80.5,
      formLoadBalance: -9.3,
      readinessScore: 0.82,
      annotations: [{ code: "goal-week", severity: "info", message: "Goal week" }],
      source: { target: "goal_projection", planned: "builder", completed: "none" },
    });
  });

  it("returns an empty series when the end date is before the start date", () => {
    expect(
      buildTrainingAdjustmentDailySeries({
        startDate: "2026-06-03",
        endDate: "2026-06-01",
      }),
    ).toEqual([]);
  });
});

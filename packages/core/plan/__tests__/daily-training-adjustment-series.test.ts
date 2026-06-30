import { describe, expect, it } from "vitest";
import { buildTrainingAdjustmentDailySeries } from "../dailyTrainingAdjustmentSeries";

describe("buildTrainingAdjustmentDailySeries", () => {
  it("returns a contiguous daily range with zero load defaults", () => {
    const points = buildTrainingAdjustmentDailySeries({
      startDate: "2026-06-01",
      endDate: "2026-06-03",
    });

    expect(points.map((point) => point.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(points[1]).toMatchObject({
      plannedLoadTss: 0,
      tentativePlannedLoadTss: 0,
      completedLoadTss: 0,
      targetLoadTss: 0,
      actualOrScheduledLoadTss: 0,
      loadDeltaTss: 0,
      plannedDeltaTss: 0,
      annotations: [],
    });
  });

  it("computes daily load deltas from target, planned, tentative, and actual inputs", () => {
    const points = buildTrainingAdjustmentDailySeries({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      plannedLoadTssByDate: { "2026-06-01": 45 },
      tentativePlannedLoadTssByDate: { "2026-06-01": 15 },
      completedLoadTssByDate: { "2026-06-01": 30 },
      targetLoadTssByDate: { "2026-06-01": 50 },
      actualOrScheduledLoadTssByDate: { "2026-06-01": 55 },
    });

    expect(points[0]).toMatchObject({
      actualOrScheduledLoadTss: 55,
      loadDeltaTss: 5,
      plannedDeltaTss: 10,
    });
  });

  it("falls back to completed plus planned load when actual-or-scheduled is omitted", () => {
    const [point] = buildTrainingAdjustmentDailySeries({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      completedLoadTssByDate: new Map([["2026-06-01", 20]]),
      plannedLoadTssByDate: new Map([["2026-06-01", 35]]),
      targetLoadTssByDate: new Map([["2026-06-01", 45]]),
    });

    expect(point?.actualOrScheduledLoadTss).toBe(55);
    expect(point?.loadDeltaTss).toBe(10);
  });

  it("preserves optional metrics, annotations, and source metadata", () => {
    const [point] = buildTrainingAdjustmentDailySeries({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      fitnessCtlByDate: { "2026-06-01": 71.2 },
      fatigueAtlByDate: { "2026-06-01": 80.5 },
      formTsbByDate: { "2026-06-01": -9.3 },
      readinessScoreByDate: { "2026-06-01": 0.82 },
      annotationsByDate: {
        "2026-06-01": [{ code: "goal-week", severity: "info", message: "Goal week" }],
      },
      sourceByDate: {
        "2026-06-01": { target: "goal_projection", planned: "builder", completed: "none" },
      },
    });

    expect(point).toMatchObject({
      fitnessCtl: 71.2,
      fatigueAtl: 80.5,
      formTsb: -9.3,
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

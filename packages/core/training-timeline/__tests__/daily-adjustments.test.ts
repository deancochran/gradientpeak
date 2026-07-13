import { describe, expect, it } from "vitest";
import {
  aggregateDailyTrainingLoadAdjustmentsToWeeks,
  normalizeDailyTrainingLoadAdjustments,
} from "../daily-adjustments";

describe("daily training load adjustments", () => {
  it("normalizes sparse points and derives load deltas", () => {
    const points = normalizeDailyTrainingLoadAdjustments({
      startDate: "2026-06-01",
      endDate: "2026-06-03",
      points: [{ date: "2026-06-02", plannedLoadTss: 30, targetLoadTss: 40 }],
    });

    expect(points.map((point) => point.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(points[1]).toMatchObject({
      actualOrScheduledLoadTss: 30,
      loadDeltaTss: -10,
      plannedDeltaTss: -10,
    });
  });

  it("combines completed load with the remaining scheduled and tentative load", () => {
    const [point] = normalizeDailyTrainingLoadAdjustments({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      points: [
        {
          date: "2026-06-01",
          plannedLoadTss: 40,
          tentativePlannedLoadTss: 10,
          completedLoadTss: 20,
          targetLoadTss: 60,
        },
      ],
    });

    expect(point).toMatchObject({
      completedLoadTss: 20,
      actualOrScheduledLoadTss: 50,
      loadDeltaTss: -10,
      plannedDeltaTss: -10,
    });
  });

  it("uses an explicit remaining load supplied by a canonical timeline", () => {
    const [point] = normalizeDailyTrainingLoadAdjustments({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      points: [
        {
          date: "2026-06-01",
          plannedLoadTss: 80,
          completedLoadTss: 35,
          remainingScheduledLoadTss: 20,
          targetLoadTss: 50,
        },
      ],
    });

    expect(point).toMatchObject({
      actualOrScheduledLoadTss: 55,
      loadDeltaTss: 5,
    });
  });

  it("aggregates canonical daily values without recalculating pending load", () => {
    const points = normalizeDailyTrainingLoadAdjustments({
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      points: [
        { date: "2026-06-01", plannedLoadTss: 40, completedLoadTss: 20, targetLoadTss: 40 },
        { date: "2026-06-02", plannedLoadTss: 30, targetLoadTss: 20 },
      ],
    });

    expect(aggregateDailyTrainingLoadAdjustmentsToWeeks(points)[0]).toMatchObject({
      plannedLoadTss: 70,
      completedLoadTss: 20,
      actualOrScheduledLoadTss: 70,
      targetLoadTss: 60,
      loadDeltaTss: 10,
      plannedDeltaTss: 10,
    });
  });
});

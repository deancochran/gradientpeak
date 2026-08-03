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
      points: [
        {
          date: "2026-06-02",
          plannedLoad: 30,
          tentativePlannedLoad: 0,
          completedLoad: 0,
          targetLoad: 40,
        },
      ],
    });

    expect(points.map((point) => point.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(points[1]).toMatchObject({
      actualOrScheduledLoad: 30,
      loadDelta: -10,
      plannedDelta: -10,
    });
  });

  it("combines completed load with the remaining scheduled and tentative load", () => {
    const [point] = normalizeDailyTrainingLoadAdjustments({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      points: [
        {
          date: "2026-06-01",
          plannedLoad: 40,
          tentativePlannedLoad: 10,
          completedLoad: 20,
          targetLoad: 60,
        },
      ],
    });

    expect(point).toMatchObject({
      completedLoad: 20,
      actualOrScheduledLoad: 50,
      loadDelta: -10,
      plannedDelta: -10,
    });
  });

  it("uses an explicit remaining load supplied by a canonical timeline", () => {
    const [point] = normalizeDailyTrainingLoadAdjustments({
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      points: [
        {
          date: "2026-06-01",
          plannedLoad: 80,
          tentativePlannedLoad: 0,
          completedLoad: 35,
          remainingScheduledLoad: 20,
          targetLoad: 50,
        },
      ],
    });

    expect(point).toMatchObject({
      actualOrScheduledLoad: 55,
      loadDelta: 5,
    });
  });

  it("aggregates canonical daily values without recalculating pending load", () => {
    const points = normalizeDailyTrainingLoadAdjustments({
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      points: [
        {
          date: "2026-06-01",
          plannedLoad: 40,
          tentativePlannedLoad: 0,
          completedLoad: 20,
          targetLoad: 40,
        },
        {
          date: "2026-06-02",
          plannedLoad: 30,
          tentativePlannedLoad: 0,
          completedLoad: 0,
          targetLoad: 20,
        },
      ],
    });

    expect(aggregateDailyTrainingLoadAdjustmentsToWeeks(points)[0]).toMatchObject({
      plannedLoad: 70,
      completedLoad: 20,
      actualOrScheduledLoad: 70,
      targetLoad: 60,
      loadDelta: 10,
      plannedDelta: 10,
    });
  });

  it("propagates unavailable dimensions through daily and weekly derivations", () => {
    const points = normalizeDailyTrainingLoadAdjustments({
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      points: [
        {
          date: "2026-06-01",
          plannedLoad: null,
          tentativePlannedLoad: 0,
          completedLoad: 0,
          targetLoad: 40,
        },
        {
          date: "2026-06-02",
          plannedLoad: 30,
          tentativePlannedLoad: 0,
          completedLoad: 0,
          targetLoad: 20,
        },
      ],
    });

    expect(points[0]).toMatchObject({ actualOrScheduledLoad: null, plannedDelta: null });
    expect(aggregateDailyTrainingLoadAdjustmentsToWeeks(points)[0]).toMatchObject({
      plannedLoad: null,
      actualOrScheduledLoad: null,
      plannedDelta: null,
    });
  });
});

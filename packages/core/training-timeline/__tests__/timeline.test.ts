import { describe, expect, it } from "vitest";
import {
  buildTrainingDaySummary,
  buildTrainingTimelineWindow,
  buildTrainingTimelineWindowFromLoadTimeline,
  compareTrainingLoad,
  summarizeTrainingLoadComparison,
} from "../index";

describe("training timeline", () => {
  it("compares planned scheduled and completed load in one canonical shape", () => {
    expect(
      compareTrainingLoad({
        plannedTss: 75,
        scheduledTss: 60,
        tentativeScheduledTss: 15,
        completedTss: 40,
        recommendedTss: 80,
      }),
    ).toEqual({
      plannedTss: 75,
      scheduledTss: 60,
      tentativeScheduledTss: 15,
      completedTss: 40,
      remainingTss: 35,
      recommendedTss: 80,
      deltaTss: -35,
    });
  });

  it("builds day summaries from load timeline aliases and item fallbacks", () => {
    const day = buildTrainingDaySummary({
      date: "2026-07-09",
      loadPoint: { date: "2026-07-09", ideal_tss: 90, actual_tss: 30 },
      scheduledItems: [
        {
          id: "scheduled-1",
          source: "training_plan",
          date: "2026-07-09",
          title: "Endurance ride",
          plannedLoadTss: 75,
          status: "planned",
        },
      ],
    });

    expect(day.load.plannedTss).toBe(90);
    expect(day.load.scheduledTss).toBe(75);
    expect(day.load.completedTss).toBe(30);
  });

  it("builds contiguous day and week windows", () => {
    const window = buildTrainingTimelineWindow({
      today: "2026-07-09",
      startDate: "2026-07-06",
      endDate: "2026-07-12",
      loadPoints: [
        { date: "2026-07-06", recommended_load_tss: 50, scheduled_load_tss: 50 },
        { date: "2026-07-07", recommended_load_tss: 40, completed_load_tss: 35 },
      ],
    });

    expect(window.days).toHaveLength(7);
    expect(window.weeks).toHaveLength(1);
    expect(window.weeks[0]?.load.plannedTss).toBe(90);
    expect(window.weeks[0]?.load.completedTss).toBe(35);
  });

  it("adapts existing training load timelines without changing callers", () => {
    const window = buildTrainingTimelineWindowFromLoadTimeline({
      today: "2026-07-09",
      startDate: "2026-07-09",
      endDate: "2026-07-09",
      timeline: [
        {
          date: "2026-07-09",
          recommended_load_tss: 100,
          scheduled_load_tss: 80,
          completed_load_tss: 20,
        },
      ],
    });

    expect(
      summarizeTrainingLoadComparison(window.days[0]?.load ?? compareTrainingLoad({})),
    ).toEqual({
      planned: "100 TSS",
      scheduled: "80 TSS",
      completed: "20 TSS",
      remaining: "60 TSS",
      delta: "-60 TSS",
    });
  });
});

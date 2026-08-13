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
        plannedLoad: 75,
        scheduledLoad: 75,
        completedLoad: 40,
        recommendedLoad: 80,
      }),
    ).toEqual({
      plannedLoad: 75,
      scheduledLoad: 75,
      completedLoad: 40,
      remainingLoad: 35,
      recommendedLoad: 80,
      deltaLoad: -35,
    });
  });

  it("builds day summaries from canonical load points and item fallbacks", () => {
    const day = buildTrainingDaySummary({
      date: "2026-07-09",
      loadPoint: {
        date: "2026-07-09",
        recommended_common_load: 90,
        completed_common_load: 30,
      },
      scheduledItems: [
        {
          id: "scheduled-1",
          source: "training_plan",
          date: "2026-07-09",
          title: "Endurance ride",
          plannedLoad: 75,
          status: "planned",
        },
      ],
    });

    expect(day.load.plannedLoad).toBe(90);
    expect(day.load.scheduledLoad).toBe(75);
    expect(day.load.completedLoad).toBe(30);
  });

  it("builds contiguous day and week windows", () => {
    const window = buildTrainingTimelineWindow({
      today: "2026-07-09",
      startDate: "2026-07-06",
      endDate: "2026-07-12",
      loadPoints: [
        {
          date: "2026-07-06",
          recommended_common_load: 50,
          scheduled_common_load: 50,
          completed_common_load: 0,
        },
        {
          date: "2026-07-07",
          recommended_common_load: 40,
          scheduled_common_load: 0,
          completed_common_load: 35,
        },
      ],
    });

    expect(window.days).toHaveLength(7);
    expect(window.weeks).toHaveLength(1);
    expect(window.weeks[0]?.load.plannedLoad).toBeNull();
    expect(window.weeks[0]?.load.completedLoad).toBe(35);
  });

  it("adapts existing training load timelines without changing callers", () => {
    const window = buildTrainingTimelineWindowFromLoadTimeline({
      today: "2026-07-09",
      startDate: "2026-07-09",
      endDate: "2026-07-09",
      timeline: [
        {
          date: "2026-07-09",
          recommended_common_load: 100,
          scheduled_common_load: 80,
          completed_common_load: 20,
        },
      ],
    });

    expect(
      summarizeTrainingLoadComparison(window.days[0]?.load ?? compareTrainingLoad({})),
    ).toEqual({
      planned: "100 Common Load",
      scheduled: "80 Common Load",
      completed: "20 Common Load",
      remaining: "60 Common Load",
      delta: "-60 Common Load",
    });
  });

  it("preserves explicit unavailable values and does not replace a known zero with item load", () => {
    const unavailable = buildTrainingDaySummary({
      date: "2026-07-09",
      loadPoint: {
        date: "2026-07-09",
        scheduled_common_load: null,
        completed_common_load: null,
      },
      scheduledItems: [
        {
          id: "scheduled",
          source: "training_plan",
          date: "2026-07-09",
          title: "Ride",
          plannedLoad: 50,
          status: "planned",
        },
      ],
      completedItems: [
        {
          id: "completed",
          source: "completed_activity",
          date: "2026-07-09",
          title: "Ride",
          completedLoad: 50,
        },
      ],
    });
    const knownZero = buildTrainingDaySummary({
      date: "2026-07-10",
      loadPoint: {
        date: "2026-07-10",
        scheduled_common_load: 0,
        completed_common_load: 0,
      },
      scheduledItems: [
        {
          id: "scheduled",
          source: "training_plan",
          date: "2026-07-10",
          title: "Ride",
          plannedLoad: 50,
          status: "planned",
        },
      ],
      completedItems: [
        {
          id: "completed",
          source: "completed_activity",
          date: "2026-07-10",
          title: "Ride",
          completedLoad: 50,
        },
      ],
    });

    expect(unavailable.load.scheduledLoad).toBeNull();
    expect(unavailable.load.completedLoad).toBeNull();
    expect(knownZero.load.scheduledLoad).toBe(0);
    expect(knownZero.load.completedLoad).toBe(0);
  });

  it("does not replace known zero scheduled load with the planned load", () => {
    expect(
      compareTrainingLoad({
        plannedLoad: 50,
        scheduledLoad: 0,
        completedLoad: 0,
      }),
    ).toMatchObject({ remainingLoad: 0, deltaLoad: 0 });
  });
});

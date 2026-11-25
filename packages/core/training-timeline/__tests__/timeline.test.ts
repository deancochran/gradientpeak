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
      plannedLoadStatus: "complete",
      scheduledLoad: 75,
      scheduledLoadStatus: "complete",
      completedLoad: 40,
      completedLoadStatus: "complete",
      remainingLoad: 35,
      remainingLoadStatus: "complete",
      recommendedLoad: 80,
      recommendedLoadStatus: "complete",
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
    expect(day.load.plannedLoadStatus).toBe("complete");
    expect(day.load.scheduledLoad).toBe(75);
    expect(day.load.scheduledLoadStatus).toBe("complete");
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
    expect(window.weeks[0]?.load.plannedLoad).toBe(90);
    expect(window.weeks[0]?.load.plannedLoadStatus).toBe("partial");
    expect(window.weeks[0]?.load.scheduledLoad).toBe(50);
    expect(window.weeks[0]?.load.scheduledLoadStatus).toBe("partial");
    expect(window.weeks[0]?.load.completedLoad).toBe(35);
    expect(window.weeks[0]?.load.completedLoadStatus).toBe("partial");
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
    expect(window.days[0]?.load.completedLoadStatus).toBe("complete");
  });

  it("preserves explicit unavailable scheduled values and genuine known zero", () => {
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
    expect(unavailable.load.scheduledLoadStatus).toBe("unavailable");
    expect(unavailable.load.completedLoad).toBeNull();
    expect(knownZero.load.scheduledLoad).toBe(0);
    expect(knownZero.load.scheduledLoadStatus).toBe("known_zero");
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

  it("uses known zero only when complete source coverage establishes an empty day", () => {
    const knownEmpty = buildTrainingDaySummary({
      date: "2026-07-11",
      scheduledItems: [],
      scheduledSourceStatus: "complete",
      completedItems: [],
      completedSourceStatus: "complete",
    });
    const unknownEmpty = buildTrainingDaySummary({ date: "2026-07-12" });

    expect(knownEmpty.load).toMatchObject({
      scheduledLoad: 0,
      scheduledLoadStatus: "known_zero",
      completedLoad: 0,
      completedLoadStatus: "known_zero",
    });
    expect(unknownEmpty.load).toMatchObject({
      scheduledLoad: null,
      scheduledLoadStatus: "unavailable",
      completedLoad: null,
      completedLoadStatus: "unavailable",
    });
  });

  it("keeps unavailable completed work and a mixed known subtotal status-aware", () => {
    const unavailable = buildTrainingDaySummary({
      date: "2026-07-11",
      completedItems: [
        {
          id: "completed-unavailable",
          source: "completed_activity",
          date: "2026-07-11",
          title: "Activity without Load",
          completedLoad: null,
          completedLoadStatus: "unavailable",
        },
      ],
      completedSourceStatus: "complete",
    });
    const partial = buildTrainingDaySummary({
      date: "2026-07-12",
      completedItems: [
        {
          id: "completed-known",
          source: "completed_activity",
          date: "2026-07-12",
          title: "Known activity",
          completedLoad: 42,
          completedLoadStatus: "complete",
        },
        {
          id: "completed-unknown",
          source: "completed_activity",
          date: "2026-07-12",
          title: "Unknown activity",
          completedLoad: null,
          completedLoadStatus: "unavailable",
        },
      ],
      completedSourceStatus: "complete",
    });
    const partialCoverage = buildTrainingDaySummary({
      date: "2026-07-13",
      completedItems: [
        {
          id: "completed-known-partial-source",
          source: "completed_activity",
          date: "2026-07-13",
          title: "Known activity from partial source",
          completedLoad: 18,
          completedLoadStatus: "complete",
        },
      ],
      completedSourceStatus: "partial",
    });

    expect(unavailable.load).toMatchObject({
      completedLoad: null,
      completedLoadStatus: "unavailable",
    });
    expect(partial.load).toMatchObject({
      completedLoad: 42,
      completedLoadStatus: "partial",
    });
    expect(partialCoverage.load).toMatchObject({
      completedLoad: 18,
      completedLoadStatus: "partial",
    });
  });

  it("retains an explicitly measured zero completed Load", () => {
    const day = buildTrainingDaySummary({
      date: "2026-07-13",
      completedItems: [
        {
          id: "completed-zero",
          source: "completed_activity",
          date: "2026-07-13",
          title: "Zero-load activity",
          completedLoad: 0,
          completedLoadStatus: "known_zero",
        },
      ],
      completedSourceStatus: "complete",
    });

    expect(day.completedItems[0]).toMatchObject({
      completedLoad: 0,
      completedLoadStatus: "known_zero",
    });
    expect(day.load).toMatchObject({ completedLoad: 0, completedLoadStatus: "known_zero" });
  });
});

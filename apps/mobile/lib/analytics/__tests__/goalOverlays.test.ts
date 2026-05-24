import { describe, expect, it } from "vitest";
import { buildGoalOverlays, filterGoalOverlaysByDateRange } from "../goalOverlays";

describe("goal overlays", () => {
  it("normalizes dated goals into chart-ready overlays", () => {
    const overlays = buildGoalOverlays({
      todayKey: "2026-05-06",
      goals: [
        {
          id: "goal-1",
          title: "Spring marathon",
          target_date: "2026-05-09",
          activity_category: "run",
          priority: 8,
          objective: { type: "event_performance", target_time_s: 10800 },
        } as any,
        {
          id: "goal-2",
          title: "Old FTP",
          target_date: "2026-04-01",
          activity_category: "bike",
          priority: 4,
          objective: { type: "threshold", metric: "power" },
        } as any,
      ],
    });

    expect(overlays).toEqual([
      expect.objectContaining({
        goalId: "goal-2",
        status: "completed",
        targetMetric: "power",
      }),
      expect.objectContaining({
        goalId: "goal-1",
        status: "upcoming",
        targetMetric: "finish_time",
      }),
    ]);
  });

  it("filters overlays by selected chart date range", () => {
    const overlays = [
      { id: "a", targetDate: "2026-04-01" },
      { id: "b", targetDate: "2026-05-09" },
      { id: "c", targetDate: "2026-06-01" },
    ];

    expect(
      filterGoalOverlaysByDateRange(overlays, {
        startDate: "2026-05-01",
        endDate: "2026-05-31",
      }),
    ).toEqual([{ id: "b", targetDate: "2026-05-09" }]);
  });
});

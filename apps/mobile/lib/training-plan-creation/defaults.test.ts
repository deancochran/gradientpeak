import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultTrainingPlanBuilderState } from "./defaults";
import { formatBuilderWeekdayWithWeek } from "./formatters";

describe("createDefaultTrainingPlanBuilderState", () => {
  afterEach(() => vi.useRealTimers());

  it("uses the local calendar date for default schedule fields", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 2, 23, 30));

    const state = createDefaultTrainingPlanBuilderState();

    expect(state.anchorDate).toBe("2026-01-02");
    expect(state.scheduling.startDate).toBe("2026-01-02");
  });
  it.each([
    "2026-03-08",
    "2026-11-01",
  ])("keeps DST-day anchors local and labels relative slots without assuming Monday (%s)", (date) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${date}T23:30:00`));
    const state = createDefaultTrainingPlanBuilderState();
    expect(state.anchorDate).toBe(date);
    expect(state.scheduling.startDate).toBe(date);
    expect(formatBuilderWeekdayWithWeek(0)).toBe("Week 1 · Day 1");
    expect(formatBuilderWeekdayWithWeek(8)).toBe("Week 2 · Day 2");
  });
});

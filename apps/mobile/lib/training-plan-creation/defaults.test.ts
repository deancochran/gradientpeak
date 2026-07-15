import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultTrainingPlanBuilderState } from "./defaults";

describe("createDefaultTrainingPlanBuilderState", () => {
  afterEach(() => vi.useRealTimers());

  it("uses the local calendar date for default schedule fields", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 2, 23, 30));

    const state = createDefaultTrainingPlanBuilderState();

    expect(state.anchorDate).toBe("2026-01-02");
    expect(state.scheduling.startDate).toBe("2026-01-02");
  });
});

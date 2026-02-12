import { describe, expect, it } from "vitest";
import { deriveCreationContext } from "../deriveCreationContext";

describe("deriveCreationContext", () => {
  it("returns conservative baseline range when no history is available", () => {
    const context = deriveCreationContext({
      completed_activities: [],
      efforts: [],
      profile_metrics: {},
    });

    expect(context.history_availability_state).toBe("none");
    expect(context.recommended_baseline_tss_range.min).toBeGreaterThanOrEqual(
      30,
    );
    expect(context.recommended_baseline_tss_range.max).toBeLessThanOrEqual(120);
  });

  it("widens baseline recommendations upward with rich recent activity", () => {
    const completedActivities = Array.from({ length: 12 }, (_, index) => ({
      occurred_at: new Date(
        Date.now() - index * 2 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      activity_category: "run",
      duration_seconds: 3600,
      tss: 80,
    }));

    const context = deriveCreationContext({
      completed_activities: completedActivities,
    });

    expect(context.history_availability_state).toBe("rich");
    expect(context.recommended_baseline_tss_range.min).toBeGreaterThan(120);
    expect(context.recommended_baseline_tss_range.max).toBeGreaterThan(
      context.recommended_baseline_tss_range.min,
    );
  });
});

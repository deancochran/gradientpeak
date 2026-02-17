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
    expect(context.recommended_baseline_tss_range.min).toBeGreaterThan(70);
    expect(context.recommended_baseline_tss_range.max).toBeGreaterThan(
      context.recommended_baseline_tss_range.min,
    );
  });

  it("derives weekly load and session defaults from recent behavior", () => {
    const completedActivities = [
      {
        occurred_at: "2026-02-15T08:00:00.000Z",
        tss: 75,
        duration_seconds: 3600,
      },
      {
        occurred_at: "2026-02-13T08:00:00.000Z",
        tss: 68,
        duration_seconds: 3400,
      },
      {
        occurred_at: "2026-02-11T08:00:00.000Z",
        tss: 80,
        duration_seconds: 3900,
      },
      {
        occurred_at: "2026-02-09T08:00:00.000Z",
        tss: 72,
        duration_seconds: 3550,
      },
      {
        occurred_at: "2026-02-08T08:00:00.000Z",
        tss: 95,
        duration_seconds: 4200,
      },
      {
        occurred_at: "2026-02-06T08:00:00.000Z",
        tss: 82,
        duration_seconds: 3900,
      },
      {
        occurred_at: "2026-02-04T08:00:00.000Z",
        tss: 78,
        duration_seconds: 3600,
      },
      {
        occurred_at: "2026-02-03T08:00:00.000Z",
        tss: 66,
        duration_seconds: 3200,
      },
      {
        occurred_at: "2026-02-01T08:00:00.000Z",
        tss: 88,
        duration_seconds: 4100,
      },
      {
        occurred_at: "2026-01-30T08:00:00.000Z",
        tss: 70,
        duration_seconds: 3500,
      },
    ];

    const context = deriveCreationContext({
      completed_activities: completedActivities,
      as_of: "2026-02-16T00:00:00.000Z",
    });

    expect(
      context.recommended_sessions_per_week_range.min,
    ).toBeGreaterThanOrEqual(2);
    expect(context.recommended_sessions_per_week_range.max).toBeGreaterThan(
      context.recommended_sessions_per_week_range.min,
    );
    expect(context.recommended_baseline_tss_range.max).toBeGreaterThan(
      context.recommended_baseline_tss_range.min,
    );
    expect(
      context.rationale_codes.some((code) => code.startsWith("preferred_day_")),
    ).toBe(true);
  });
});

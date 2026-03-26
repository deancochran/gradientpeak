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
    expect(context.recommended_baseline_tss_range.min).toBeGreaterThanOrEqual(80);
    expect(context.recommended_baseline_tss_range.max).toBeGreaterThan(
      context.recommended_baseline_tss_range.min,
    );
    expect(context.learned_ramp_rate?.max_safe_ramp_rate).toBe(40);
    expect(context.learned_ramp_rate?.confidence).toBe("low");
    expect(context.missing_required_onboarding_fields).toContain("dob");
  });

  it("widens baseline recommendations upward with rich recent activity", () => {
    const completedActivities = Array.from({ length: 12 }, (_, index) => ({
      occurred_at: new Date(Date.now() - index * 2 * 24 * 60 * 60 * 1000).toISOString(),
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

    expect(context.recommended_sessions_per_week_range.min).toBeGreaterThanOrEqual(2);
    expect(context.recommended_sessions_per_week_range.max).toBeGreaterThan(
      context.recommended_sessions_per_week_range.min,
    );
    expect(context.recommended_baseline_tss_range.max).toBeGreaterThan(
      context.recommended_baseline_tss_range.min,
    );
    expect(context.rationale_codes.some((code) => code.startsWith("preferred_day_"))).toBe(true);
  });

  it("adds personalization outputs while keeping backward-compatible core fields", () => {
    const context = deriveCreationContext({
      completed_activities: [
        {
          occurred_at: "2026-02-10T08:00:00.000Z",
          tss: 90,
          intensity_factor: 0.91,
        },
      ],
      profile: {
        dob: "1990-01-01",
        gender: "female",
      },
      as_of: "2026-02-16T00:00:00.000Z",
    });

    expect(context.user_age).toBeDefined();
    expect(context.user_gender).toBe("female");
    expect(context.max_sustainable_ctl).toBeDefined();
    expect(context.training_quality?.high_intensity_ratio).toBeGreaterThan(0.5);
    expect(context.history_availability_state).toBeDefined();
    expect(context.recommended_baseline_tss_range.min).toBeDefined();
  });

  it("applies youth-safe defaults continuously from age-sensitive priors", () => {
    const context = deriveCreationContext({
      completed_activities: [],
      profile: {
        dob: "2012-02-16",
      },
      as_of: "2026-02-16T00:00:00.000Z",
    });

    expect(context.is_youth).toBe(true);
    expect(context.user_age).toBe(14);
    expect(context.max_sustainable_ctl).toBeLessThan(100);
    expect(context.recommended_sessions_per_week_range.max).toBeLessThanOrEqual(4);
    expect(context.missing_required_onboarding_fields ?? []).toHaveLength(0);
  });
});

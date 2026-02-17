import { describe, expect, it } from "vitest";
import { normalizeProjectionSafetyConfig } from "../projection/safety-caps";

describe("normalizeProjectionSafetyConfig", () => {
  it("applies balanced defaults when no config is provided", () => {
    expect(normalizeProjectionSafetyConfig(undefined)).toEqual({
      optimization_profile: "balanced",
      post_goal_recovery_days: 5,
      max_weekly_tss_ramp_pct: 7,
      max_ctl_ramp_per_week: 3,
    });
  });

  it("clamps values to safe bounds", () => {
    expect(
      normalizeProjectionSafetyConfig({
        optimization_profile: "outcome_first",
        post_goal_recovery_days: 100,
        max_weekly_tss_ramp_pct: 99,
        max_ctl_ramp_per_week: 99,
      }),
    ).toEqual({
      optimization_profile: "outcome_first",
      post_goal_recovery_days: 28,
      max_weekly_tss_ramp_pct: 40,
      max_ctl_ramp_per_week: 12,
    });
  });

  it("preserves hard bound contract for safety caps", () => {
    const floored = normalizeProjectionSafetyConfig({
      max_weekly_tss_ramp_pct: -5,
      max_ctl_ramp_per_week: -3,
      post_goal_recovery_days: -9,
    });
    expect(floored.max_weekly_tss_ramp_pct).toBe(0);
    expect(floored.max_ctl_ramp_per_week).toBe(0);
    expect(floored.post_goal_recovery_days).toBe(0);

    const capped = normalizeProjectionSafetyConfig({
      max_weekly_tss_ramp_pct: 999,
      max_ctl_ramp_per_week: 999,
      post_goal_recovery_days: 999,
    });
    expect(capped.max_weekly_tss_ramp_pct).toBe(40);
    expect(capped.max_ctl_ramp_per_week).toBe(12);
    expect(capped.post_goal_recovery_days).toBe(28);
  });
});

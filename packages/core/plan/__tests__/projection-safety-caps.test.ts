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
      max_weekly_tss_ramp_pct: 20,
      max_ctl_ramp_per_week: 8,
    });
  });
});

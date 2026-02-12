import { describe, expect, it } from "vitest";
import { normalizeCreationConfig } from "../normalizeCreationConfig";

describe("normalizeCreationConfig safety fields", () => {
  it("fills deterministic defaults when safety fields are omitted", () => {
    const normalized = normalizeCreationConfig({});

    expect(normalized.optimization_profile).toBe("balanced");
    expect(normalized.post_goal_recovery_days).toBe(5);
    expect(normalized.max_weekly_tss_ramp_pct).toBe(7);
    expect(normalized.max_ctl_ramp_per_week).toBe(3);
  });

  it("accepts explicit user overrides inside hard bounds", () => {
    const normalized = normalizeCreationConfig({
      user_values: {
        optimization_profile: "sustainable",
        post_goal_recovery_days: 10,
        max_weekly_tss_ramp_pct: 4,
        max_ctl_ramp_per_week: 1.5,
      },
    });

    expect(normalized.optimization_profile).toBe("sustainable");
    expect(normalized.post_goal_recovery_days).toBe(10);
    expect(normalized.max_weekly_tss_ramp_pct).toBe(4);
    expect(normalized.max_ctl_ramp_per_week).toBe(1.5);
  });
});

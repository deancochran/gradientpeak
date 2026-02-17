import { describe, expect, it } from "vitest";
import { normalizeCreationConfig } from "../normalizeCreationConfig";

describe("normalizeCreationConfig safety fields", () => {
  it("fills deterministic defaults when safety fields are omitted", () => {
    const normalized = normalizeCreationConfig({});

    expect(normalized.optimization_profile).toBe("balanced");
    expect(normalized.post_goal_recovery_days).toBe(5);
    expect(normalized.max_weekly_tss_ramp_pct).toBe(7);
    expect(normalized.max_ctl_ramp_per_week).toBe(3);
    expect(normalized.projection_control_v2).toEqual({
      mode: "simple",
      ambition: 0.5,
      risk_tolerance: 0.4,
      curvature: 0,
      curvature_strength: 0.35,
      user_owned: {
        mode: false,
        ambition: false,
        risk_tolerance: false,
        curvature: false,
        curvature_strength: false,
      },
    });
  });

  it("accepts explicit user overrides inside hard bounds", () => {
    const normalized = normalizeCreationConfig({
      user_values: {
        optimization_profile: "sustainable",
        post_goal_recovery_days: 10,
        max_weekly_tss_ramp_pct: 4,
        max_ctl_ramp_per_week: 1.5,
        projection_control_v2: {
          mode: "advanced",
          ambition: 0.8,
          user_owned: {
            mode: true,
            ambition: true,
          },
        },
      },
    });

    expect(normalized.optimization_profile).toBe("sustainable");
    expect(normalized.post_goal_recovery_days).toBe(10);
    expect(normalized.max_weekly_tss_ramp_pct).toBe(4);
    expect(normalized.max_ctl_ramp_per_week).toBe(1.5);
    expect(normalized.projection_control_v2).toEqual({
      mode: "advanced",
      ambition: 0.8,
      risk_tolerance: 0.4,
      curvature: 0,
      curvature_strength: 0.35,
      user_owned: {
        mode: true,
        ambition: true,
        risk_tolerance: false,
        curvature: false,
        curvature_strength: false,
      },
    });
  });

  it("fills deterministic calibration defaults when omitted", () => {
    const normalized = normalizeCreationConfig({});

    expect(normalized.calibration.version).toBe(1);
    expect(normalized.calibration.readiness_composite).toEqual({
      target_attainment_weight: 0.45,
      envelope_weight: 0.3,
      durability_weight: 0.15,
      evidence_weight: 0.1,
    });
    expect(normalized.calibration.optimizer.lookahead_weeks).toBe(5);
  });

  it("merges partial calibration overrides with defaults", () => {
    const normalized = normalizeCreationConfig({
      user_values: {
        calibration: {
          readiness_timeline: {
            smoothing_iterations: 40,
          },
          optimizer: {
            preparedness_weight: 20,
          },
        },
      },
    });

    expect(normalized.calibration.readiness_timeline.smoothing_iterations).toBe(
      40,
    );
    expect(normalized.calibration.optimizer.preparedness_weight).toBe(20);
    expect(normalized.calibration.optimizer.candidate_steps).toBe(7);
  });
});

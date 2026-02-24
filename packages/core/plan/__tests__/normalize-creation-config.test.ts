import { describe, expect, it } from "vitest";
import { normalizeCreationConfig } from "../normalizeCreationConfig";

describe("normalizeCreationConfig safety fields", () => {
  it("fills deterministic defaults when safety fields are omitted", () => {
    const normalized = normalizeCreationConfig({});

    expect(normalized.optimization_profile).toBe("balanced");
    expect(normalized.post_goal_recovery_days).toBe(5);
    expect(normalized.behavior_controls_v1).toEqual({
      aggressiveness: 0.5,
      variability: 0.5,
      spike_frequency: 0.35,
      shape_target: 0,
      shape_strength: 0.35,
      recovery_priority: 0.6,
      starting_fitness_confidence: 0.6,
    });
  });

  it("accepts explicit user overrides inside hard bounds", () => {
    const normalized = normalizeCreationConfig({
      user_values: {
        optimization_profile: "sustainable",
        post_goal_recovery_days: 10,
        behavior_controls_v1: {
          aggressiveness: 0.8,
          variability: 0.3,
          spike_frequency: 0.7,
          shape_target: -0.4,
          shape_strength: 0.9,
          recovery_priority: 0.75,
          starting_fitness_confidence: 0.25,
        },
      },
    });

    expect(normalized.optimization_profile).toBe("sustainable");
    expect(normalized.post_goal_recovery_days).toBe(10);
    expect(normalized.behavior_controls_v1.aggressiveness).toBe(0.8);
    expect(normalized.behavior_controls_v1.shape_target).toBe(-0.4);
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

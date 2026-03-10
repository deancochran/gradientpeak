import { describe, expect, it } from "vitest";
import { buildProjectionEngineInput, normalizeCreationConfig } from "..";

const expandedPlan = {
  start_date: "2026-02-24",
  end_date: "2026-08-14",
  blocks: [
    {
      name: "Base",
      phase: "base",
      start_date: "2026-02-24",
      end_date: "2026-04-05",
      target_weekly_tss_range: { min: 260, max: 320 },
    },
    {
      name: "Build",
      phase: "build",
      start_date: "2026-04-06",
      end_date: "2026-07-31",
      target_weekly_tss_range: { min: 300, max: 390 },
    },
    {
      name: "Taper",
      phase: "taper",
      start_date: "2026-08-01",
      end_date: "2026-08-14",
      target_weekly_tss_range: { min: 180, max: 240 },
    },
  ],
  goals: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Race A",
      target_date: "2026-07-10",
      priority: 1,
      targets: [
        {
          target_type: "power_threshold" as const,
          activity_category: "bike" as const,
          target_watts: 305,
          test_duration_s: 1200,
        },
      ],
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Race B",
      target_date: "2026-08-14",
      priority: 2,
      targets: [
        {
          target_type: "race_performance" as const,
          activity_category: "run" as const,
          distance_m: 10000,
          target_time_s: 2820,
        },
      ],
    },
  ],
};

describe("buildProjectionEngineInput", () => {
  it("builds a deterministic engine input shape from expanded plan and normalized config", () => {
    const normalizedConfig = normalizeCreationConfig({
      now_iso: "2026-02-24T00:00:00.000Z",
      user_values: {
        optimization_profile: "balanced",
        post_goal_recovery_days: 6,
        behavior_controls_v1: {
          aggressiveness: 0.55,
          variability: 0.5,
          spike_frequency: 0.4,
          shape_target: 0,
          shape_strength: 0.35,
          recovery_priority: 0.55,
          starting_fitness_confidence: 0.62,
        },
      },
    });

    const priorInferredSnapshot = {
      mean: {
        ctl: 48,
        atl: 51,
        tsb: -3,
        slb: 37,
        durability: 58,
        readiness: 61,
      },
      uncertainty: {
        state_variance: 0.15,
        confidence: 0.73,
      },
      evidence_quality: {
        score: 0.71,
        missingness_ratio: 0.08,
      },
      as_of: "2026-02-23T12:00:00.000Z",
      metadata: {
        updated_at: "2026-02-23T12:00:00.000Z",
        missingness_counter: 2,
        evidence_counter: 18,
      },
    };

    const first = buildProjectionEngineInput({
      expanded_plan: expandedPlan,
      normalized_creation_config: normalizedConfig,
      starting_ctl: 47,
      starting_atl: 53,
      prior_inferred_snapshot: priorInferredSnapshot,
    });

    const second = buildProjectionEngineInput({
      expanded_plan: expandedPlan,
      normalized_creation_config: normalizedConfig,
      starting_ctl: 47,
      starting_atl: 53,
      prior_inferred_snapshot: priorInferredSnapshot,
    });

    expect(second).toEqual(first);
    expect(first.creation_config).toEqual({
      optimization_profile: normalizedConfig.optimization_profile,
      post_goal_recovery_days: normalizedConfig.post_goal_recovery_days,
      behavior_controls_v1: normalizedConfig.behavior_controls_v1,
      calibration: normalizedConfig.calibration,
    });
    expect(first.timeline).toEqual({
      start_date: expandedPlan.start_date,
      end_date: expandedPlan.end_date,
    });
    expect(first.starting_ctl).toBe(47);
    expect(first.starting_atl).toBe(53);
    expect(first.prior_inferred_snapshot).toEqual(priorInferredSnapshot);
  });

  it("omits creation config when normalized config is not provided", () => {
    const shapedInput = buildProjectionEngineInput({
      expanded_plan: expandedPlan,
    });

    expect(shapedInput.creation_config).toBeUndefined();
    expect(shapedInput.timeline.start_date).toBe(expandedPlan.start_date);
    expect(shapedInput.timeline.end_date).toBe(expandedPlan.end_date);
  });
});

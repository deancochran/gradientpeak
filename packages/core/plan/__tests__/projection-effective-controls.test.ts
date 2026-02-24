import { describe, expect, it } from "vitest";
import { trainingPlanCalibrationConfigSchema } from "../../schemas/training_plan_structure";
import {
  buildCurvatureEnvelope,
  computeCurvaturePenalty,
  resolveEffectiveProjectionControls,
  resolveProfileSearchBounds,
} from "../projection/effective-controls";
import { normalizeProjectionSafetyConfig } from "../projection/safety-caps";

const calibration = trainingPlanCalibrationConfigSchema.parse({});

describe("projection effective controls mapping", () => {
  it("keeps aggressiveness mapping monotonic for preparedness/search while ramp caps stay invariant", () => {
    const normalizedConfig = normalizeProjectionSafetyConfig({
      optimization_profile: "balanced",
      max_weekly_tss_ramp_pct: 7,
      max_ctl_ramp_per_week: 3,
    });

    const lowAggressiveness = resolveEffectiveProjectionControls({
      normalized_config: normalizedConfig,
      calibration,
      behavior_controls_v1: {
        aggressiveness: 0,
      },
    });
    const highAggressiveness = resolveEffectiveProjectionControls({
      normalized_config: normalizedConfig,
      calibration,
      behavior_controls_v1: {
        aggressiveness: 1,
      },
    });

    expect(highAggressiveness.optimizer.preparedness_weight).toBeGreaterThan(
      lowAggressiveness.optimizer.preparedness_weight,
    );
    expect(highAggressiveness.optimizer.lookahead_weeks).toBeGreaterThanOrEqual(
      lowAggressiveness.optimizer.lookahead_weeks,
    );
    expect(highAggressiveness.optimizer.candidate_steps).toBeGreaterThanOrEqual(
      lowAggressiveness.optimizer.candidate_steps,
    );
    expect(highAggressiveness.ramp_caps.max_weekly_tss_ramp_pct).toBe(
      lowAggressiveness.ramp_caps.max_weekly_tss_ramp_pct,
    );
    expect(highAggressiveness.ramp_caps.max_ctl_ramp_per_week).toBe(
      lowAggressiveness.ramp_caps.max_ctl_ramp_per_week,
    );
    expect(highAggressiveness.ramp_caps.max_weekly_tss_ramp_pct).toBe(7);
    expect(highAggressiveness.ramp_caps.max_ctl_ramp_per_week).toBe(3);
  });

  it("keeps variability mapping monotonic for volatility/churn penalty relaxation", () => {
    const normalizedConfig = normalizeProjectionSafetyConfig({
      optimization_profile: "balanced",
      max_weekly_tss_ramp_pct: 7,
      max_ctl_ramp_per_week: 3,
    });

    const lowVariability = resolveEffectiveProjectionControls({
      normalized_config: normalizedConfig,
      calibration,
      behavior_controls_v1: {
        variability: 0,
      },
    });
    const highVariability = resolveEffectiveProjectionControls({
      normalized_config: normalizedConfig,
      calibration,
      behavior_controls_v1: {
        variability: 1,
      },
    });

    expect(highVariability.optimizer.volatility_penalty_weight).toBeLessThan(
      lowVariability.optimizer.volatility_penalty_weight,
    );
    expect(highVariability.optimizer.churn_penalty_weight).toBeLessThan(
      lowVariability.optimizer.churn_penalty_weight,
    );
    expect(highVariability.ramp_caps.max_weekly_tss_ramp_pct).toBe(
      lowVariability.ramp_caps.max_weekly_tss_ramp_pct,
    );
    expect(highVariability.ramp_caps.max_ctl_ramp_per_week).toBe(
      lowVariability.ramp_caps.max_ctl_ramp_per_week,
    );
    expect(highVariability.ramp_caps.max_weekly_tss_ramp_pct).toBe(7);
    expect(highVariability.ramp_caps.max_ctl_ramp_per_week).toBe(3);
  });

  it("keeps hard ramp bounds and profile/schema search bounds enforced", () => {
    const outcomeBounds = resolveProfileSearchBounds("outcome_first");

    const constrained = resolveEffectiveProjectionControls({
      normalized_config: normalizeProjectionSafetyConfig({
        optimization_profile: "outcome_first",
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      }),
      calibration: trainingPlanCalibrationConfigSchema.parse({
        optimizer: {
          lookahead_weeks: 8,
          candidate_steps: 15,
        },
      }),
      behavior_controls_v1: {
        aggressiveness: 1,
        variability: 1,
        spike_frequency: 1,
      },
    });

    expect(constrained.ramp_caps.max_weekly_tss_ramp_pct).toBeLessThanOrEqual(
      40,
    );
    expect(
      constrained.ramp_caps.max_weekly_tss_ramp_pct,
    ).toBeGreaterThanOrEqual(0);
    expect(constrained.ramp_caps.max_ctl_ramp_per_week).toBeLessThanOrEqual(12);
    expect(constrained.ramp_caps.max_ctl_ramp_per_week).toBeGreaterThanOrEqual(
      0,
    );
    expect(constrained.optimizer.lookahead_weeks).toBeLessThanOrEqual(
      outcomeBounds.lookahead_weeks.max,
    );
    expect(constrained.optimizer.lookahead_weeks).toBeGreaterThanOrEqual(
      outcomeBounds.lookahead_weeks.min,
    );
    expect(constrained.optimizer.candidate_steps).toBeLessThanOrEqual(
      outcomeBounds.candidate_steps.max,
    );
    expect(constrained.optimizer.candidate_steps).toBeGreaterThanOrEqual(
      outcomeBounds.candidate_steps.min,
    );
  });

  it("returns deterministic effective mapping for identical inputs", () => {
    const input = {
      normalized_config: normalizeProjectionSafetyConfig({
        optimization_profile: "balanced",
        max_weekly_tss_ramp_pct: 7,
        max_ctl_ramp_per_week: 3,
      }),
      calibration,
      behavior_controls_v1: {
        aggressiveness: 0.72,
        variability: 0.28,
        spike_frequency: 0.44,
        shape_target: -0.3,
        shape_strength: 0.84,
        recovery_priority: 0.61,
        starting_fitness_confidence: 0.77,
      },
    } as const;

    expect(resolveEffectiveProjectionControls(input)).toEqual(
      resolveEffectiveProjectionControls(input),
    );
  });

  it("removes hidden 20/8 ceiling when frontier overrides are explicit", () => {
    const widened = resolveEffectiveProjectionControls({
      normalized_config: normalizeProjectionSafetyConfig({
        optimization_profile: "outcome_first",
        max_weekly_tss_ramp_pct: 40,
        max_ctl_ramp_per_week: 12,
      }),
      calibration,
      behavior_controls_v1: {
        aggressiveness: 1,
        variability: 1,
        spike_frequency: 1,
      },
    });

    expect(widened.ramp_caps.max_weekly_tss_ramp_pct).toBeGreaterThan(20);
    expect(widened.ramp_caps.max_ctl_ramp_per_week).toBeGreaterThan(8);
    expect(widened.ramp_caps.max_weekly_tss_ramp_pct).toBeLessThanOrEqual(40);
    expect(widened.ramp_caps.max_ctl_ramp_per_week).toBeLessThanOrEqual(12);
  });
});

describe("curvature controls", () => {
  it("maps behavior shape controls into curvature outputs", () => {
    const mapped = resolveEffectiveProjectionControls({
      normalized_config: normalizeProjectionSafetyConfig({
        optimization_profile: "balanced",
        max_weekly_tss_ramp_pct: 7,
        max_ctl_ramp_per_week: 3,
      }),
      calibration,
      behavior_controls_v1: {
        shape_target: -0.55,
        shape_strength: 0.7,
      },
    });

    expect(mapped.curvature.target).toBe(-0.55);
    expect(mapped.curvature.strength).toBe(0.7);
    expect(mapped.curvature.weight).toBeGreaterThan(0);
  });

  it("matches curvature polarity by reducing penalty when sign aligns", () => {
    const weeklyActions = [220, 245, 278, 320, 370];
    const envelopes = weeklyActions.map((_, index) =>
      buildCurvatureEnvelope({ pattern: "ramp", week_index: index }),
    );

    const positivePenalty = computeCurvaturePenalty({
      previous_week_tss: 200,
      weekly_actions: weeklyActions,
      envelopes,
      curvature: 1,
      scale_reference: 240,
    });
    const neutralPenalty = computeCurvaturePenalty({
      previous_week_tss: 200,
      weekly_actions: weeklyActions,
      envelopes,
      curvature: 0,
      scale_reference: 240,
    });
    const negativePenalty = computeCurvaturePenalty({
      previous_week_tss: 200,
      weekly_actions: weeklyActions,
      envelopes,
      curvature: -1,
      scale_reference: 240,
    });

    expect(positivePenalty).toBeLessThan(negativePenalty);
    expect(neutralPenalty).toBeLessThan(negativePenalty);
  });

  it("decays curvature envelope in taper/recovery to preserve taper emphasis", () => {
    const ramp = buildCurvatureEnvelope({ pattern: "ramp", week_index: 0 });
    const taper = buildCurvatureEnvelope({ pattern: "taper", week_index: 0 });
    const recovery = buildCurvatureEnvelope({
      pattern: "recovery",
      week_index: 0,
    });

    expect(ramp).toBeGreaterThan(taper);
    expect(taper).toBeGreaterThan(recovery);
  });
});

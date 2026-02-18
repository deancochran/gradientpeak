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
  it("keeps ambition mapping monotonic for preparedness/search while ramp caps stay invariant", () => {
    const normalizedConfig = normalizeProjectionSafetyConfig({
      optimization_profile: "balanced",
      max_weekly_tss_ramp_pct: 7,
      max_ctl_ramp_per_week: 3,
    });

    const lowAmbition = resolveEffectiveProjectionControls({
      normalized_config: normalizedConfig,
      calibration,
      projection_control: {
        ambition: 0,
        risk_tolerance: 0.4,
      },
    });
    const highAmbition = resolveEffectiveProjectionControls({
      normalized_config: normalizedConfig,
      calibration,
      projection_control: {
        ambition: 1,
        risk_tolerance: 0.4,
      },
    });

    expect(highAmbition.optimizer.preparedness_weight).toBeGreaterThan(
      lowAmbition.optimizer.preparedness_weight,
    );
    expect(highAmbition.optimizer.lookahead_weeks).toBeGreaterThanOrEqual(
      lowAmbition.optimizer.lookahead_weeks,
    );
    expect(highAmbition.optimizer.candidate_steps).toBeGreaterThanOrEqual(
      lowAmbition.optimizer.candidate_steps,
    );
    expect(highAmbition.ramp_caps.max_weekly_tss_ramp_pct).toBe(
      lowAmbition.ramp_caps.max_weekly_tss_ramp_pct,
    );
    expect(highAmbition.ramp_caps.max_ctl_ramp_per_week).toBe(
      lowAmbition.ramp_caps.max_ctl_ramp_per_week,
    );
    expect(highAmbition.ramp_caps.max_weekly_tss_ramp_pct).toBe(7);
    expect(highAmbition.ramp_caps.max_ctl_ramp_per_week).toBe(3);
  });

  it("keeps risk-tolerance monotonic for penalty relaxation while ramp caps stay invariant", () => {
    const normalizedConfig = normalizeProjectionSafetyConfig({
      optimization_profile: "balanced",
      max_weekly_tss_ramp_pct: 7,
      max_ctl_ramp_per_week: 3,
    });

    const lowRiskTolerance = resolveEffectiveProjectionControls({
      normalized_config: normalizedConfig,
      calibration,
      projection_control: {
        ambition: 0.5,
        risk_tolerance: 0,
      },
    });
    const highRiskTolerance = resolveEffectiveProjectionControls({
      normalized_config: normalizedConfig,
      calibration,
      projection_control: {
        ambition: 0.5,
        risk_tolerance: 1,
      },
    });

    expect(highRiskTolerance.optimizer.risk_penalty_weight).toBeLessThan(
      lowRiskTolerance.optimizer.risk_penalty_weight,
    );
    expect(highRiskTolerance.optimizer.volatility_penalty_weight).toBeLessThan(
      lowRiskTolerance.optimizer.volatility_penalty_weight,
    );
    expect(highRiskTolerance.optimizer.churn_penalty_weight).toBeLessThan(
      lowRiskTolerance.optimizer.churn_penalty_weight,
    );
    expect(highRiskTolerance.ramp_caps.max_weekly_tss_ramp_pct).toBe(
      lowRiskTolerance.ramp_caps.max_weekly_tss_ramp_pct,
    );
    expect(highRiskTolerance.ramp_caps.max_ctl_ramp_per_week).toBe(
      lowRiskTolerance.ramp_caps.max_ctl_ramp_per_week,
    );
    expect(highRiskTolerance.ramp_caps.max_weekly_tss_ramp_pct).toBe(7);
    expect(highRiskTolerance.ramp_caps.max_ctl_ramp_per_week).toBe(3);
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
      projection_control: {
        ambition: 1,
        risk_tolerance: 1,
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
      projection_control: {
        ambition: 0.72,
        risk_tolerance: 0.28,
        curvature: -0.3,
        curvature_strength: 0.84,
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
      projection_control: {
        ambition: 1,
        risk_tolerance: 1,
      },
    });

    expect(widened.ramp_caps.max_weekly_tss_ramp_pct).toBeGreaterThan(20);
    expect(widened.ramp_caps.max_ctl_ramp_per_week).toBeGreaterThan(8);
    expect(widened.ramp_caps.max_weekly_tss_ramp_pct).toBeLessThanOrEqual(40);
    expect(widened.ramp_caps.max_ctl_ramp_per_week).toBeLessThanOrEqual(12);
  });
});

describe("curvature controls", () => {
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

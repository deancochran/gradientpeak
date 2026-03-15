import type { MpcObjectiveComponents } from "../../projection/mpc/objective";
import type { ReferenceTrackingEvaluation } from "./trackReferenceTrajectory";

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function buildPeriodizedObjectiveComponents(input: {
  preparedness_primary: number;
  preparedness_secondary: number;
  overload_penalty: number;
  volatility_penalty: number;
  churn_penalty: number;
  monotony_penalty: number;
  strain_penalty: number;
  curvature_penalty: number;
  reference_tracking?: ReferenceTrackingEvaluation | null;
}): MpcObjectiveComponents {
  const tracking = input.reference_tracking;
  const trackingReward = tracking
    ? clamp01(1 - tracking.tracking_error / 8) * 0.35
    : 0;
  const trackingReadinessReward = tracking
    ? clamp01(1 - tracking.ctl_mean_absolute_error / 6) * 0.2
    : 0;
  const trackingRiskPenalty = tracking
    ? tracking.safety_penalty + tracking.taper_pressure * 0.75
    : 0;
  const trackingVolatilityPenalty = tracking
    ? tracking.tracking_error * 0.04
    : 0;
  const trackingChurnPenalty = tracking
    ? tracking.tss_mean_absolute_error / 140
    : 0;

  return {
    goal_attainment: round(input.preparedness_primary + trackingReward),
    projected_readiness: round(
      input.preparedness_secondary + trackingReadinessReward,
    ),
    overload_penalty: round(input.overload_penalty + trackingRiskPenalty),
    load_volatility_penalty: round(
      input.volatility_penalty + trackingVolatilityPenalty,
    ),
    plan_change_penalty: round(input.churn_penalty + trackingChurnPenalty),
    monotony_penalty: round(input.monotony_penalty),
    strain_penalty: round(input.strain_penalty),
    curvature_penalty: round(input.curvature_penalty),
  };
}

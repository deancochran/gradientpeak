import type { EffectiveProjectionControls } from "./effective-controls";
import type { MpcObjectiveEvaluation } from "./mpc/objective";

export interface ProjectionDiagnosticsEffectiveOptimizerConfig {
  weights: {
    preparedness_weight: number;
    risk_penalty_weight: number;
    volatility_penalty_weight: number;
    churn_penalty_weight: number;
  };
  caps: {
    max_weekly_tss_ramp_pct: number;
    max_ctl_ramp_per_week: number;
  };
  search: {
    lookahead_weeks: number;
    candidate_steps: number;
  };
  curvature: {
    target: number;
    strength: number;
    weight: number;
  };
}

export interface ProjectionObjectiveContributions {
  sampled_weeks: number;
  objective_score: number;
  weighted_terms: MpcObjectiveEvaluation["weighted_terms"];
}

export interface ProjectionReferenceTrackingDiagnostics {
  scored_weeks: number;
  matched_points: number;
  ctl_mean_absolute_error: number;
  tss_mean_absolute_error: number;
  taper_pressure: number;
  safety_penalty: number;
}

export interface ProjectionOptimizationTradeoffSummary {
  goal_utility: number;
  risk_penalty: number;
  volatility_penalty: number;
  churn_penalty: number;
  net_utility: number;
}

export interface ProjectionConvergenceGuard {
  max_solver_attempts: number;
  solver_attempts: number;
  non_finite_objective_rejections: number;
  stability_assertions: string[];
}

export function createZeroObjectiveWeightedTerms(): MpcObjectiveEvaluation["weighted_terms"] {
  return {
    goal: 0,
    readiness: 0,
    risk: 0,
    volatility: 0,
    churn: 0,
    monotony: 0,
    strain: 0,
    curve: 0,
  };
}

export function createZeroObjectiveContributions(): ProjectionObjectiveContributions {
  return {
    sampled_weeks: 0,
    objective_score: 0,
    weighted_terms: createZeroObjectiveWeightedTerms(),
  };
}

export function createZeroReferenceTracking(): ProjectionReferenceTrackingDiagnostics {
  return {
    scored_weeks: 0,
    matched_points: 0,
    ctl_mean_absolute_error: 0,
    tss_mean_absolute_error: 0,
    taper_pressure: 0,
    safety_penalty: 0,
  };
}

export function createZeroTradeoffSummary(): ProjectionOptimizationTradeoffSummary {
  return {
    goal_utility: 0,
    risk_penalty: 0,
    volatility_penalty: 0,
    churn_penalty: 0,
    net_utility: 0,
  };
}

export function createDefaultConvergenceGuard(): ProjectionConvergenceGuard {
  return {
    max_solver_attempts: 3,
    solver_attempts: 0,
    non_finite_objective_rejections: 0,
    stability_assertions: [],
  };
}

export function resolveDiagnosticsEffectiveOptimizerConfig(input: {
  effectiveControls: EffectiveProjectionControls;
  searchLookaheadWeeks?: number;
  searchCandidateSteps?: number;
}): ProjectionDiagnosticsEffectiveOptimizerConfig {
  return {
    weights: {
      preparedness_weight: input.effectiveControls.optimizer.preparedness_weight,
      risk_penalty_weight: input.effectiveControls.optimizer.risk_penalty_weight,
      volatility_penalty_weight: input.effectiveControls.optimizer.volatility_penalty_weight,
      churn_penalty_weight: input.effectiveControls.optimizer.churn_penalty_weight,
    },
    caps: {
      max_weekly_tss_ramp_pct: input.effectiveControls.ramp_caps.max_weekly_tss_ramp_pct,
      max_ctl_ramp_per_week: input.effectiveControls.ramp_caps.max_ctl_ramp_per_week,
    },
    search: {
      lookahead_weeks:
        input.searchLookaheadWeeks ?? input.effectiveControls.optimizer.lookahead_weeks,
      candidate_steps:
        input.searchCandidateSteps ?? input.effectiveControls.optimizer.candidate_steps,
    },
    curvature: {
      target: input.effectiveControls.curvature.target,
      strength: input.effectiveControls.curvature.strength,
      weight: input.effectiveControls.curvature.weight,
    },
  };
}

export function parseObjectiveContributionsPayload(
  payload: Record<string, number | string | boolean | null> | undefined,
): ProjectionObjectiveContributions & {
  reference_tracking: ProjectionReferenceTrackingDiagnostics;
} {
  if (!payload) {
    return {
      ...createZeroObjectiveContributions(),
      reference_tracking: createZeroReferenceTracking(),
    };
  }

  const readNumber = (key: string): number => {
    const value = payload[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };

  return {
    sampled_weeks: 1,
    objective_score: readNumber("objective_score"),
    weighted_terms: {
      goal: readNumber("weighted_term_goal"),
      readiness: readNumber("weighted_term_readiness"),
      risk: readNumber("weighted_term_risk"),
      volatility: readNumber("weighted_term_volatility"),
      churn: readNumber("weighted_term_churn"),
      monotony: readNumber("weighted_term_monotony"),
      strain: readNumber("weighted_term_strain"),
      curve: readNumber("weighted_term_curve"),
    },
    reference_tracking: {
      scored_weeks: readNumber("reference_tracking_scored_weeks"),
      matched_points: readNumber("reference_tracking_matched_points"),
      ctl_mean_absolute_error: readNumber("reference_tracking_ctl_mae"),
      tss_mean_absolute_error: readNumber("reference_tracking_tss_mae"),
      taper_pressure: readNumber("reference_tracking_taper_pressure"),
      safety_penalty: readNumber("reference_tracking_safety_penalty"),
    },
  };
}

export function serializeObjectiveContributionsPayload(input: {
  objective_score: number;
  weighted_terms: MpcObjectiveEvaluation["weighted_terms"];
  reference_tracking?: ProjectionReferenceTrackingDiagnostics;
}): Record<string, number> {
  return {
    objective_score: input.objective_score,
    weighted_term_goal: input.weighted_terms.goal,
    weighted_term_readiness: input.weighted_terms.readiness,
    weighted_term_risk: input.weighted_terms.risk,
    weighted_term_volatility: input.weighted_terms.volatility,
    weighted_term_churn: input.weighted_terms.churn,
    weighted_term_monotony: input.weighted_terms.monotony,
    weighted_term_strain: input.weighted_terms.strain,
    weighted_term_curve: input.weighted_terms.curve,
    reference_tracking_scored_weeks: input.reference_tracking?.scored_weeks ?? 0,
    reference_tracking_matched_points: input.reference_tracking?.matched_points ?? 0,
    reference_tracking_ctl_mae: input.reference_tracking?.ctl_mean_absolute_error ?? 0,
    reference_tracking_tss_mae: input.reference_tracking?.tss_mean_absolute_error ?? 0,
    reference_tracking_taper_pressure: input.reference_tracking?.taper_pressure ?? 0,
    reference_tracking_safety_penalty: input.reference_tracking?.safety_penalty ?? 0,
  };
}

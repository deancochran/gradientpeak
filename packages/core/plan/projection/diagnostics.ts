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
    max_weekly_load_ramp_pct: number;
    max_longTermLoad_ramp_per_week: number;
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
  longTermLoad_mean_absolute_error: number;
  load_mean_absolute_error: number;
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

export type WeeklyOptimizationPath = "full_mpc" | "degraded_bounded_mpc" | "cap_only_baseline";

export interface ProjectionLoadResolutionSummary {
  week_count: number;
  capped_weeks: number;
  load_ramp_capped_weeks: number;
  longTermLoad_ramp_capped_weeks: number;
  demand_floor_weeks: number;
  demand_floor_override_weeks: number;
  recovery_adjusted_weeks: number;
  recovery_weeks: number;
  average_baseline_to_final_delta_load: number;
  average_requested_to_final_delta_load: number;
  average_mpc_to_final_delta_load: number;
  max_requested_to_final_delta_load: number;
  limiting_constraints: string[];
  confidence: "high" | "medium" | "low";
  confidence_reasons: string[];
}

export interface ProjectionDiagnostics {
  selected_path: WeeklyOptimizationPath;
  fallback_reason: string | null;
  candidate_counts: {
    full_mpc: number;
    degraded_bounded_mpc: number;
  };
  prune_counts: {
    full_mpc: number;
    degraded_bounded_mpc: number;
  };
  active_constraints: string[];
  tie_break_chain: string[];
  effective_optimizer_config: ProjectionDiagnosticsEffectiveOptimizerConfig;
  clamp_counts: {
    load: number;
    longTermLoad: number;
  };
  objective_contributions: ProjectionObjectiveContributions;
  optimization_tradeoff_summary: ProjectionOptimizationTradeoffSummary;
  convergence_guard: ProjectionConvergenceGuard;
  reference_context?: {
    status: "available" | "unsupported" | "absent";
    supported_goal_count: number;
    unsupported_goal_count: number;
    rationale_codes: string[];
  };
  reference_tracking?: ProjectionReferenceTrackingDiagnostics;
  load_resolution_summary?: ProjectionLoadResolutionSummary;
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
    longTermLoad_mean_absolute_error: 0,
    load_mean_absolute_error: 0,
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
      max_weekly_load_ramp_pct: input.effectiveControls.ramp_caps.max_weekly_load_ramp_pct,
      max_longTermLoad_ramp_per_week:
        input.effectiveControls.ramp_caps.max_longTermLoad_ramp_per_week,
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

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function mergeSelectedPath(
  current: WeeklyOptimizationPath,
  next: WeeklyOptimizationPath,
): WeeklyOptimizationPath {
  const rank: Record<WeeklyOptimizationPath, number> = {
    full_mpc: 0,
    degraded_bounded_mpc: 1,
    cap_only_baseline: 2,
  };
  return rank[next] > rank[current] ? next : current;
}

/** Combines one week's optimizer evidence without exposing accumulator mutation to the engine. */
export function mergeProjectionDiagnostics(
  aggregate: ProjectionDiagnostics,
  next: ProjectionDiagnostics,
): ProjectionDiagnostics {
  const weightedTerms = {
    goal: round6(
      aggregate.objective_contributions.weighted_terms.goal +
        next.objective_contributions.weighted_terms.goal,
    ),
    readiness: round6(
      aggregate.objective_contributions.weighted_terms.readiness +
        next.objective_contributions.weighted_terms.readiness,
    ),
    risk: round6(
      aggregate.objective_contributions.weighted_terms.risk +
        next.objective_contributions.weighted_terms.risk,
    ),
    volatility: round6(
      aggregate.objective_contributions.weighted_terms.volatility +
        next.objective_contributions.weighted_terms.volatility,
    ),
    churn: round6(
      aggregate.objective_contributions.weighted_terms.churn +
        next.objective_contributions.weighted_terms.churn,
    ),
    monotony: round6(
      aggregate.objective_contributions.weighted_terms.monotony +
        next.objective_contributions.weighted_terms.monotony,
    ),
    strain: round6(
      aggregate.objective_contributions.weighted_terms.strain +
        next.objective_contributions.weighted_terms.strain,
    ),
    curve: round6(
      aggregate.objective_contributions.weighted_terms.curve +
        next.objective_contributions.weighted_terms.curve,
    ),
  };
  const referenceTracking = {
    scored_weeks:
      (aggregate.reference_tracking?.scored_weeks ?? 0) +
      (next.reference_tracking?.scored_weeks ?? 0),
    matched_points:
      (aggregate.reference_tracking?.matched_points ?? 0) +
      (next.reference_tracking?.matched_points ?? 0),
    longTermLoad_mean_absolute_error: round6(
      (aggregate.reference_tracking?.longTermLoad_mean_absolute_error ?? 0) +
        (next.reference_tracking?.longTermLoad_mean_absolute_error ?? 0),
    ),
    load_mean_absolute_error: round6(
      (aggregate.reference_tracking?.load_mean_absolute_error ?? 0) +
        (next.reference_tracking?.load_mean_absolute_error ?? 0),
    ),
    taper_pressure: round6(
      (aggregate.reference_tracking?.taper_pressure ?? 0) +
        (next.reference_tracking?.taper_pressure ?? 0),
    ),
    safety_penalty: round6(
      (aggregate.reference_tracking?.safety_penalty ?? 0) +
        (next.reference_tracking?.safety_penalty ?? 0),
    ),
  };
  const objectiveScore = round6(
    aggregate.objective_contributions.objective_score +
      next.objective_contributions.objective_score,
  );

  return {
    ...aggregate,
    selected_path: mergeSelectedPath(aggregate.selected_path, next.selected_path),
    fallback_reason: aggregate.fallback_reason ?? next.fallback_reason,
    candidate_counts: {
      full_mpc: aggregate.candidate_counts.full_mpc + next.candidate_counts.full_mpc,
      degraded_bounded_mpc:
        aggregate.candidate_counts.degraded_bounded_mpc +
        next.candidate_counts.degraded_bounded_mpc,
    },
    prune_counts: {
      full_mpc: aggregate.prune_counts.full_mpc + next.prune_counts.full_mpc,
      degraded_bounded_mpc:
        aggregate.prune_counts.degraded_bounded_mpc + next.prune_counts.degraded_bounded_mpc,
    },
    active_constraints: [...new Set([...aggregate.active_constraints, ...next.active_constraints])],
    tie_break_chain:
      next.tie_break_chain.length > 0 ? [...next.tie_break_chain] : aggregate.tie_break_chain,
    effective_optimizer_config: {
      ...aggregate.effective_optimizer_config,
      search: {
        lookahead_weeks: Math.min(
          aggregate.effective_optimizer_config.search.lookahead_weeks,
          next.effective_optimizer_config.search.lookahead_weeks,
        ),
        candidate_steps: Math.min(
          aggregate.effective_optimizer_config.search.candidate_steps,
          next.effective_optimizer_config.search.candidate_steps,
        ),
      },
    },
    convergence_guard: {
      ...aggregate.convergence_guard,
      solver_attempts:
        aggregate.convergence_guard.solver_attempts + next.convergence_guard.solver_attempts,
      non_finite_objective_rejections:
        aggregate.convergence_guard.non_finite_objective_rejections +
        next.convergence_guard.non_finite_objective_rejections,
      stability_assertions: [
        ...new Set([
          ...aggregate.convergence_guard.stability_assertions,
          ...next.convergence_guard.stability_assertions,
        ]),
      ],
    },
    objective_contributions: {
      sampled_weeks:
        aggregate.objective_contributions.sampled_weeks +
        next.objective_contributions.sampled_weeks,
      objective_score: objectiveScore,
      weighted_terms: weightedTerms,
    },
    reference_tracking: referenceTracking,
    optimization_tradeoff_summary: {
      goal_utility: round6(weightedTerms.goal + weightedTerms.readiness),
      risk_penalty: round6(weightedTerms.risk),
      volatility_penalty: round6(weightedTerms.volatility),
      churn_penalty: round6(weightedTerms.churn),
      net_utility: objectiveScore,
    },
  };
}

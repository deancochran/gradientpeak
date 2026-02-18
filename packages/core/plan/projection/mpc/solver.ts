import type { OptimizationProfile } from "../safety-caps";
import { clampMpcCandidateAction, resolveMpcSolveBounds } from "./constraints";
import { buildDeterministicCandidateLattice } from "./lattice";
import {
  type MpcTieBreakCandidate,
  type MpcTieBreakField,
  pickBestMpcCandidate,
} from "./tiebreak";

export interface DeterministicMpcEvaluationResult {
  objective_score: number;
  primary_goal_date?: string;
  primary_goal_id?: string;
  diagnostics_payload?: Record<string, number | string | boolean | null>;
}

export interface DeterministicMpcSolverInput {
  optimization_profile: OptimizationProfile;
  previous_action: number;
  action_bounds: {
    min_value: number;
    max_value: number;
  };
  requested_horizon_weeks?: number;
  requested_candidate_count?: number;
  precision?: number;
  evaluate_candidate: (input: {
    candidate_value: number;
    horizon_weeks: number;
  }) => DeterministicMpcEvaluationResult;
}

export interface DeterministicMpcEvaluatedCandidate extends MpcTieBreakCandidate {
  diagnostics_payload?: Record<string, number | string | boolean | null>;
}

export interface DeterministicMpcSolverDiagnostics {
  optimization_profile: OptimizationProfile;
  horizon_weeks: number;
  candidate_limit: number;
  generated_candidates: number[];
  evaluated_candidates: number;
  pruned_branches: number;
  active_constraints: string[];
  tie_break_order: readonly MpcTieBreakField[];
}

export interface DeterministicMpcSolverResult {
  selected_candidate: number;
  selected_objective_score: number;
  candidates: DeterministicMpcEvaluatedCandidate[];
  diagnostics: DeterministicMpcSolverDiagnostics;
}

/**
 * Solves a single deterministic bounded MPC action selection step.
 */
export function solveDeterministicBoundedMpc(
  input: DeterministicMpcSolverInput,
): DeterministicMpcSolverResult {
  const bounds = resolveMpcSolveBounds({
    optimization_profile: input.optimization_profile,
    requested_horizon_weeks: input.requested_horizon_weeks,
    requested_candidate_count: input.requested_candidate_count,
  });

  const centeredAction = clampMpcCandidateAction({
    candidate_value: input.previous_action,
    min_value: input.action_bounds.min_value,
    max_value: input.action_bounds.max_value,
  });

  const generatedCandidates = buildDeterministicCandidateLattice({
    min_value: input.action_bounds.min_value,
    max_value: input.action_bounds.max_value,
    center_value: centeredAction,
    candidate_count: bounds.candidate_count,
    precision: input.precision,
  });

  const evaluatedCandidates: DeterministicMpcEvaluatedCandidate[] =
    generatedCandidates.map((candidateValue) => {
      const evaluation = input.evaluate_candidate({
        candidate_value: candidateValue,
        horizon_weeks: bounds.horizon_weeks,
      });
      const objectiveScore = Number.isFinite(evaluation.objective_score)
        ? evaluation.objective_score
        : Number.NEGATIVE_INFINITY;

      return {
        candidate_value: candidateValue,
        objective_score: objectiveScore,
        delta_from_prev: Math.abs(candidateValue - input.previous_action),
        primary_goal_date: evaluation.primary_goal_date,
        primary_goal_id: evaluation.primary_goal_id,
        diagnostics_payload: evaluation.diagnostics_payload,
      };
    });

  const best = pickBestMpcCandidate(evaluatedCandidates);

  return {
    selected_candidate: best.selected.candidate_value,
    selected_objective_score: best.selected.objective_score,
    candidates: evaluatedCandidates,
    diagnostics: {
      optimization_profile: input.optimization_profile,
      horizon_weeks: bounds.horizon_weeks,
      candidate_limit: bounds.candidate_count,
      generated_candidates: generatedCandidates,
      evaluated_candidates: evaluatedCandidates.length,
      pruned_branches: Math.max(
        0,
        bounds.candidate_count - generatedCandidates.length,
      ),
      active_constraints: [
        "profile_horizon_bound",
        "profile_candidate_bound",
        "action_min_max_bound",
      ],
      tie_break_order: best.tie_break_order,
    },
  };
}

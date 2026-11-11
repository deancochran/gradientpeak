import {
  createZeroObjectiveContributions,
  createZeroReferenceTracking,
  type ProjectionConvergenceGuard,
  type ProjectionDiagnostics,
  type ProjectionReferenceTrackingDiagnostics,
  resolveDiagnosticsEffectiveOptimizerConfig,
  type WeeklyOptimizationPath,
} from "./diagnostics";
import type { EffectiveProjectionControls } from "./effective-controls";
import type { MpcObjectiveEvaluation } from "./mpc/objective";
import { type DeterministicMpcSolverInput, solveDeterministicBoundedMpc } from "./mpc/solver";

export interface ProjectionCandidateObjective {
  objective_score: number;
  weighted_terms: MpcObjectiveEvaluation["weighted_terms"];
  reference_tracking: ProjectionReferenceTrackingDiagnostics & { tracking_error: number };
}

export interface WeeklyOptimizationDecision {
  selected_weekly_load: number;
  diagnostics: ProjectionDiagnostics;
}

/** Executes and reports one MPC search mode; fallback ordering remains the engine's responsibility. */
export function runWeeklyMpcAttempt(input: {
  path: Exclude<WeeklyOptimizationPath, "cap_only_baseline">;
  fallbackReason: string | null;
  baseDiagnostics: ProjectionDiagnostics;
  convergenceGuard: ProjectionConvergenceGuard;
  effectiveControls: EffectiveProjectionControls;
  solver: DeterministicMpcSolverInput<ProjectionCandidateObjective>;
}): WeeklyOptimizationDecision {
  const result = solveDeterministicBoundedMpc<ProjectionCandidateObjective>(input.solver);
  const selectedCandidate = result.candidates.find(
    (candidate) => candidate.candidate_value === result.selected_candidate,
  );
  const selectedObjective = selectedCandidate?.diagnostics_payload;

  return {
    selected_weekly_load: result.selected_candidate,
    diagnostics: {
      ...input.baseDiagnostics,
      selected_path: input.path,
      fallback_reason: input.fallbackReason,
      candidate_counts: {
        ...input.baseDiagnostics.candidate_counts,
        [input.path]: result.diagnostics.evaluated_candidates,
      },
      prune_counts: {
        ...input.baseDiagnostics.prune_counts,
        [input.path]: result.diagnostics.pruned_branches,
      },
      active_constraints: [
        ...new Set([
          ...input.baseDiagnostics.active_constraints,
          ...result.diagnostics.active_constraints,
        ]),
      ],
      tie_break_chain: [...result.diagnostics.tie_break_order],
      effective_optimizer_config: resolveDiagnosticsEffectiveOptimizerConfig({
        effectiveControls: input.effectiveControls,
        searchLookaheadWeeks: result.diagnostics.horizon_weeks,
        searchCandidateSteps: result.diagnostics.candidate_limit,
      }),
      objective_contributions: selectedObjective
        ? {
            sampled_weeks: 1,
            objective_score: selectedObjective.objective_score,
            weighted_terms: selectedObjective.weighted_terms,
          }
        : createZeroObjectiveContributions(),
      reference_tracking: selectedObjective?.reference_tracking ?? createZeroReferenceTracking(),
      convergence_guard: {
        ...input.convergenceGuard,
        stability_assertions: [...input.convergenceGuard.stability_assertions],
      },
    },
  };
}

import { describe, expect, it } from "vitest";
import { calculateLongTermLoad, calculateRecentLoad } from "../../../load/progression";
import {
  createDefaultConvergenceGuard,
  createZeroObjectiveContributions,
  createZeroReferenceTracking,
  createZeroTradeoffSummary,
  mergeProjectionDiagnostics,
  type ProjectionDiagnostics,
} from "../diagnostics";
import { simulateProjectionLoadState } from "../load-state-transition";
import { resolveProjectionPolicy } from "../policy";

function diagnostics(path: ProjectionDiagnostics["selected_path"]): ProjectionDiagnostics {
  const policy = resolveProjectionPolicy({});
  return {
    selected_path: path,
    fallback_reason: null,
    candidate_counts: { full_mpc: 0, degraded_bounded_mpc: 0 },
    prune_counts: { full_mpc: 0, degraded_bounded_mpc: 0 },
    active_constraints: [],
    tie_break_chain: [],
    effective_optimizer_config: {
      weights: {
        preparedness_weight: policy.effectiveControls.optimizer.preparedness_weight,
        risk_penalty_weight: policy.effectiveControls.optimizer.risk_penalty_weight,
        volatility_penalty_weight: policy.effectiveControls.optimizer.volatility_penalty_weight,
        churn_penalty_weight: policy.effectiveControls.optimizer.churn_penalty_weight,
      },
      caps: policy.effectiveControls.ramp_caps,
      search: {
        lookahead_weeks: policy.effectiveControls.optimizer.lookahead_weeks,
        candidate_steps: policy.effectiveControls.optimizer.candidate_steps,
      },
      curvature: policy.effectiveControls.curvature,
    },
    clamp_counts: { load: 0, longTermLoad: 0 },
    objective_contributions: createZeroObjectiveContributions(),
    optimization_tradeoff_summary: createZeroTradeoffSummary(),
    convergence_guard: createDefaultConvergenceGuard(),
    reference_tracking: createZeroReferenceTracking(),
  };
}

describe("projection pipeline seams", () => {
  it("resolves configuration precedence once", () => {
    const policy = resolveProjectionPolicy({
      creationConfig: {
        optimization_profile: "sustainable",
        max_weekly_load_ramp_pct: 4,
        behavior_controls: { aggressiveness: 0.8 },
      },
    });

    expect(policy.normalizedConfig).toMatchObject({
      optimization_profile: "sustainable",
      max_weekly_load_ramp_pct: 4,
    });
    expect(policy.effectiveControls.ramp_caps.max_weekly_load_ramp_pct).toBe(4);
    expect(policy.usedDefaultCalibration).toBe(false);
  });

  it("uses one deterministic load-state transition for weekly execution", () => {
    const transition = simulateProjectionLoadState({
      startingState: { longTermLoad: 40, recentLoad: 50 },
      weeklyLoad: 280,
      days: 2,
    });
    const firstLongTermLoad = calculateLongTermLoad(40, 40);
    const firstRecentLoad = calculateRecentLoad(50, 40);

    expect(transition.points[0]).toMatchObject({
      dayOffset: 0,
      longTermLoad: firstLongTermLoad,
      recentLoad: firstRecentLoad,
    });
    expect(transition.finalState).toEqual({
      longTermLoad: calculateLongTermLoad(firstLongTermLoad, 40),
      recentLoad: calculateRecentLoad(firstRecentLoad, 40),
    });
  });

  it("merges weekly diagnostics without engine-owned mutation", () => {
    const aggregate = diagnostics("full_mpc");
    const weekly = diagnostics("degraded_bounded_mpc");
    weekly.fallback_reason = "full_mpc_error";
    weekly.candidate_counts.degraded_bounded_mpc = 3;
    weekly.objective_contributions = {
      sampled_weeks: 1,
      objective_score: 2,
      weighted_terms: {
        goal: 3,
        readiness: 1,
        risk: -1,
        volatility: -0.5,
        churn: -0.25,
        monotony: 0,
        strain: 0,
        curve: 0,
      },
    };

    const merged = mergeProjectionDiagnostics(aggregate, weekly);

    expect(aggregate.selected_path).toBe("full_mpc");
    expect(merged).toMatchObject({
      selected_path: "degraded_bounded_mpc",
      fallback_reason: "full_mpc_error",
      candidate_counts: { degraded_bounded_mpc: 3 },
      optimization_tradeoff_summary: {
        goal_utility: 4,
        risk_penalty: -1,
        net_utility: 2,
      },
    });
  });
});

export interface MpcObjectiveWeights {
  w_goal: number;
  w_readiness: number;
  w_risk: number;
  w_volatility: number;
  w_churn: number;
  w_monotony: number;
  w_strain: number;
  w_curve: number;
}

export interface MpcObjectiveComponents {
  goal_attainment: number;
  projected_readiness: number;
  overload_penalty: number;
  load_volatility_penalty: number;
  plan_change_penalty: number;
  monotony_penalty: number;
  strain_penalty: number;
  curvature_penalty?: number;
}

export interface MpcObjectiveEvaluation {
  objective_score: number;
  weighted_terms: {
    goal: number;
    readiness: number;
    risk: number;
    volatility: number;
    churn: number;
    monotony: number;
    strain: number;
    curve: number;
  };
}

export const DEFAULT_MPC_OBJECTIVE_WEIGHTS: MpcObjectiveWeights = {
  w_goal: 1,
  w_readiness: 1,
  w_risk: 1,
  w_volatility: 1,
  w_churn: 1,
  w_monotony: 1,
  w_strain: 1,
  w_curve: 0,
};

/**
 * Evaluates the bounded deterministic MPC objective function.
 */
export function evaluateMpcObjective(input: {
  components: MpcObjectiveComponents;
  weights?: Partial<MpcObjectiveWeights>;
}): MpcObjectiveEvaluation {
  const weights: MpcObjectiveWeights = {
    ...DEFAULT_MPC_OBJECTIVE_WEIGHTS,
    ...input.weights,
  };

  const weightedTerms = {
    goal: input.components.goal_attainment * weights.w_goal,
    readiness: input.components.projected_readiness * weights.w_readiness,
    risk: input.components.overload_penalty * weights.w_risk,
    volatility: input.components.load_volatility_penalty * weights.w_volatility,
    churn: input.components.plan_change_penalty * weights.w_churn,
    monotony: input.components.monotony_penalty * weights.w_monotony,
    strain: input.components.strain_penalty * weights.w_strain,
    curve: (input.components.curvature_penalty ?? 0) * weights.w_curve,
  };

  return {
    objective_score: roundScore(
      weightedTerms.goal +
        weightedTerms.readiness -
        weightedTerms.risk -
        weightedTerms.volatility -
        weightedTerms.churn -
        weightedTerms.monotony -
        weightedTerms.strain -
        weightedTerms.curve,
    ),
    weighted_terms: weightedTerms,
  };
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

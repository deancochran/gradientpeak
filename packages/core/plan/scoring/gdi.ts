import { toPriorityTier, type GoalPriorityTier } from "./planScore";

export type FeasibilityBand =
  | "feasible"
  | "stretch"
  | "aggressive"
  | "nearly_impossible"
  | "infeasible";

export interface GoalGdiInput {
  goal_id: string;
  priority: number;
  performance_gap: number;
  load_gap: number;
  timeline_pressure: number;
  sparsity_penalty: number;
}

export interface GoalGdiResult {
  goal_id: string;
  priority: number;
  components: {
    PG: number;
    LG: number;
    TP: number;
    SP: number;
  };
  gdi: number;
  feasibility_band: FeasibilityBand;
}

const TIER_WEIGHTS: Record<GoalPriorityTier, number> = {
  A: 0.62,
  B: 0.28,
  C: 0.1,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function mapGdiToFeasibilityBand(gdi: number): FeasibilityBand {
  if (gdi < 0.3) return "feasible";
  if (gdi < 0.5) return "stretch";
  if (gdi < 0.75) return "aggressive";
  if (gdi < 0.95) return "nearly_impossible";
  return "infeasible";
}

/**
 * Computes deterministic Goal Difficulty Index (GDI) per goal.
 */
export function computeGoalGdi(input: GoalGdiInput): GoalGdiResult {
  const PG = clamp01(input.performance_gap);
  const LG = clamp01(input.load_gap);
  const TP = clamp01(input.timeline_pressure);
  const SP = clamp01(input.sparsity_penalty);
  const gdi = round3(0.45 * PG + 0.35 * LG + 0.2 * TP + SP);

  return {
    goal_id: input.goal_id,
    priority: input.priority,
    components: { PG, LG, TP, SP },
    gdi,
    feasibility_band: mapGdiToFeasibilityBand(gdi),
  };
}

/**
 * Aggregates plan-level GDI using tier weighting plus A-tier worst-case guard.
 */
export function computePlanGdi(goalGdi: GoalGdiResult[]): {
  gdi: number;
  feasibility_band: FeasibilityBand;
} {
  if (goalGdi.length === 0) {
    return { gdi: 0, feasibility_band: "feasible" };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let aGoalWorst = 0;
  let hasAGoal = false;

  for (const goal of goalGdi) {
    const tier = toPriorityTier(goal.priority);
    const weight = TIER_WEIGHTS[tier];
    weightedSum += goal.gdi * weight;
    totalWeight += weight;

    if (tier === "A") {
      hasAGoal = true;
      aGoalWorst = Math.max(aGoalWorst, goal.gdi);
    }
  }

  const weightedMean = totalWeight <= 0 ? 0 : weightedSum / totalWeight;
  const guarded = hasAGoal ? Math.max(weightedMean, aGoalWorst) : weightedMean;
  const rounded = round3(guarded);

  return {
    gdi: rounded,
    feasibility_band: mapGdiToFeasibilityBand(rounded),
  };
}

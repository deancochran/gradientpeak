import type { GoalAssessmentResult } from "./goalScore";

export type GoalPriorityTier = "A" | "B" | "C";

export interface PlanScoreResult {
  plan_goal_score_0_1: number;
  tier_means: Record<GoalPriorityTier, number>;
  tier_counts: Record<GoalPriorityTier, number>;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function toPriorityTier(priority: number): GoalPriorityTier {
  if (priority >= 7) return "A";
  if (priority >= 4) return "B";
  return "C";
}

function resolvePriorityWeight(priority: number): number {
  const clamped = Math.max(0, Math.min(10, Math.round(priority)));
  const normalized = clamped / 10;
  return round3(0.2 + Math.pow(normalized, 2));
}

/**
 * Aggregates per-goal scores with deterministic A/B/C precedence.
 */
export function scorePlanGoals(goals: GoalAssessmentResult[]): PlanScoreResult {
  const ordered = [...goals].sort((a, b) => b.priority - a.priority);

  const tierBuckets: Record<GoalPriorityTier, number[]> = {
    A: [],
    B: [],
    C: [],
  };

  for (const goal of ordered) {
    tierBuckets[toPriorityTier(goal.priority)].push(goal.goal_score_0_1);
  }

  const tierMeans: Record<GoalPriorityTier, number> = {
    A:
      tierBuckets.A.length === 0
        ? 0
        : tierBuckets.A.reduce((sum, value) => sum + value, 0) /
          tierBuckets.A.length,
    B:
      tierBuckets.B.length === 0
        ? 0
        : tierBuckets.B.reduce((sum, value) => sum + value, 0) /
          tierBuckets.B.length,
    C:
      tierBuckets.C.length === 0
        ? 0
        : tierBuckets.C.reduce((sum, value) => sum + value, 0) /
          tierBuckets.C.length,
  };

  const weightedTotal = ordered.reduce((sum, goal) => {
    return sum + goal.goal_score_0_1 * resolvePriorityWeight(goal.priority);
  }, 0);
  const totalWeight = ordered.reduce((sum, goal) => {
    return sum + resolvePriorityWeight(goal.priority);
  }, 0);

  return {
    plan_goal_score_0_1: round3(
      totalWeight <= 0 ? 0 : weightedTotal / totalWeight,
    ),
    tier_means: {
      A: round3(tierMeans.A),
      B: round3(tierMeans.B),
      C: round3(tierMeans.C),
    },
    tier_counts: {
      A: tierBuckets.A.length,
      B: tierBuckets.B.length,
      C: tierBuckets.C.length,
    },
  };
}

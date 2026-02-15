import type { GoalAssessmentResult } from "./goalScore";

export type GoalPriorityTier = "A" | "B" | "C";

export interface PlanScoreResult {
  plan_goal_score_0_1: number;
  tier_means: Record<GoalPriorityTier, number>;
  tier_counts: Record<GoalPriorityTier, number>;
}

const DEFAULT_TIER_WEIGHTS: Record<GoalPriorityTier, number> = {
  A: 0.62,
  B: 0.28,
  C: 0.1,
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function toPriorityTier(priority: number): GoalPriorityTier {
  if (priority <= 3) return "A";
  if (priority <= 6) return "B";
  return "C";
}

/**
 * Aggregates per-goal scores with deterministic A/B/C precedence.
 */
export function scorePlanGoals(
  goals: GoalAssessmentResult[],
  tierWeights: Record<GoalPriorityTier, number> = DEFAULT_TIER_WEIGHTS,
): PlanScoreResult {
  const ordered = [...goals].sort((a, b) => {
    const aTier = toPriorityTier(a.priority);
    const bTier = toPriorityTier(b.priority);
    if (aTier !== bTier) {
      return aTier.localeCompare(bTier);
    }

    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    return a.goal_id.localeCompare(b.goal_id);
  });

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

  return {
    plan_goal_score_0_1: round3(
      tierMeans.A * tierWeights.A +
        tierMeans.B * tierWeights.B +
        tierMeans.C * tierWeights.C,
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

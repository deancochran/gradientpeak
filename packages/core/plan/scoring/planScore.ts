import type { GoalAssessmentResult } from "./goalScore";
import { mapGoalPriorityToWeight } from "./priorityWeight";
import { weightedMean } from "./weightedMean";

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

/**
 * Aggregates per-goal scores with shared continuous priority weighting.
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

  const goalScores = ordered.map((goal) => goal.goal_score_0_1);
  const priorityWeights = ordered.map((goal) =>
    mapGoalPriorityToWeight(goal.priority),
  );
  const planScore = weightedMean(goalScores, priorityWeights);

  return {
    plan_goal_score_0_1: round3(planScore),
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

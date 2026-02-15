import type { GoalTargetV2 } from "../../schemas/training_plan_structure";
import {
  scoreTargetSatisfaction,
  type TargetProjectionSignals,
  type TargetSatisfactionResult,
} from "./targetSatisfaction";

export interface GoalAssessmentInput {
  goal_id: string;
  priority: number;
  targets: GoalTargetV2[];
  projection: TargetProjectionSignals;
}

export interface GoalAssessmentResult {
  goal_id: string;
  priority: number;
  goal_score_0_1: number;
  target_scores: TargetSatisfactionResult[];
  conflict_notes: string[];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeWeight(rawWeight: number | undefined): number {
  if (
    typeof rawWeight !== "number" ||
    Number.isNaN(rawWeight) ||
    rawWeight <= 0
  ) {
    return 1;
  }

  return rawWeight;
}

function getTargetSortKey(target: GoalTargetV2): string {
  switch (target.target_type) {
    case "race_performance":
      return [
        target.target_type,
        target.activity_category,
        String(Math.round(target.distance_m)),
        String(Math.round(target.target_time_s)),
      ].join("|");
    case "pace_threshold":
      return [
        target.target_type,
        target.activity_category,
        String(Math.round(target.target_speed_mps * 1000)),
        String(Math.round(target.test_duration_s)),
      ].join("|");
    case "power_threshold":
      return [
        target.target_type,
        target.activity_category,
        String(Math.round(target.target_watts)),
        String(Math.round(target.test_duration_s)),
      ].join("|");
    case "hr_threshold":
      return [
        target.target_type,
        String(Math.round(target.target_lthr_bpm)),
      ].join("|");
  }
}

/**
 * Aggregates deterministic per-target satisfaction into a per-goal score.
 */
export function scoreGoalAssessment(
  input: GoalAssessmentInput,
): GoalAssessmentResult {
  const orderedTargets = [...input.targets].sort((a, b) => {
    const aKey = getTargetSortKey(a);
    const bKey = getTargetSortKey(b);
    return aKey.localeCompare(bKey);
  });

  const targetScores = orderedTargets.map((target) =>
    scoreTargetSatisfaction({
      target,
      projection: input.projection,
    }),
  );

  if (targetScores.length === 0) {
    return {
      goal_id: input.goal_id,
      priority: input.priority,
      goal_score_0_1: round3((input.projection.readiness_score ?? 0) / 100),
      target_scores: [],
      conflict_notes: ["goal_has_no_targets"],
    };
  }

  const weights = orderedTargets.map((target) =>
    normalizeWeight((target as { weight?: number }).weight),
  );
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const weightedScore = targetScores.reduce((sum, targetScore, index) => {
    const weight = weights[index] ?? 1;
    return sum + (targetScore.score_0_100 / 100) * weight;
  }, 0);

  return {
    goal_id: input.goal_id,
    priority: input.priority,
    goal_score_0_1: round3(totalWeight <= 0 ? 0 : weightedScore / totalWeight),
    target_scores: targetScores,
    conflict_notes: [],
  };
}

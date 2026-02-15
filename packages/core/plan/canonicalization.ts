import type { MinimalTrainingPlanCreate } from "../schemas/training_plan_structure";

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function targetSortKey(
  target: MinimalTrainingPlanCreate["goals"][number]["targets"][number],
): string {
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
        String(round3(target.target_speed_mps)),
        String(Math.round(target.test_duration_s)),
      ].join("|");
    case "power_threshold":
      return [
        target.target_type,
        target.activity_category,
        String(round3(target.target_watts)),
        String(Math.round(target.test_duration_s)),
      ].join("|");
    case "hr_threshold":
      return [
        target.target_type,
        String(Math.round(target.target_lthr_bpm)),
      ].join("|");
  }
}

function goalSortKey(
  goal: MinimalTrainingPlanCreate["goals"][number],
  index: number,
): string {
  return [
    String(Math.round(goal.priority ?? 1)),
    goal.target_date,
    goal.name.trim().toLowerCase(),
    String(index),
  ].join("|");
}

export function canonicalizeMinimalTrainingPlanCreate(
  input: MinimalTrainingPlanCreate,
): MinimalTrainingPlanCreate {
  const goalsWithStableIndex = input.goals.map((goal, index) => ({
    goal,
    index,
  }));

  return {
    ...input,
    goals: goalsWithStableIndex
      .sort((a, b) =>
        goalSortKey(a.goal, a.index).localeCompare(
          goalSortKey(b.goal, b.index),
        ),
      )
      .map(({ goal }) => ({
        ...goal,
        targets: [...goal.targets].sort((a, b) =>
          targetSortKey(a).localeCompare(targetSortKey(b)),
        ),
      })),
  };
}

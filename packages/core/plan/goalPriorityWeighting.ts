import type { TrainingGoal } from "../schemas/training_plan_structure";

const MIN_PRIORITY = 0;
const MAX_PRIORITY = 10;

export function normalizeGoalPriority(priority: number | undefined): number {
  if (priority === undefined || Number.isNaN(priority)) {
    return MIN_PRIORITY;
  }

  const clamped = Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, priority));
  return Math.round(clamped);
}

export function getGoalPriorityWeight(
  priority: number | undefined,
  maxPriority: number = MAX_PRIORITY,
): number {
  const normalizedPriority = normalizeGoalPriority(priority);
  const effectiveMax = Math.max(maxPriority, MIN_PRIORITY);
  return 1 + Math.min(effectiveMax, normalizedPriority);
}

export function calculateGoalPriorityWeights(
  goals: Array<
    Pick<TrainingGoal, "id"> & Partial<Pick<TrainingGoal, "priority">>
  >,
): Record<string, number> {
  if (goals.length === 0) {
    return {};
  }

  const rawWeights = goals.map((goal) => ({
    id: goal.id,
    weight: getGoalPriorityWeight(goal.priority),
  }));
  const totalWeight = rawWeights.reduce((sum, item) => sum + item.weight, 0);

  if (totalWeight <= 0) {
    const evenWeight = 1 / goals.length;
    return Object.fromEntries(goals.map((goal) => [goal.id, evenWeight]));
  }

  return Object.fromEntries(
    rawWeights.map((item) => [item.id, item.weight / totalWeight]),
  );
}

export function applyGoalPriorityWeighting<
  TGoal extends Pick<TrainingGoal, "id"> &
    Partial<Pick<TrainingGoal, "priority">>,
>(goals: TGoal[]): Array<TGoal & { priority: number; weight: number }> {
  const weightByGoalId = calculateGoalPriorityWeights(goals);
  return goals.map((goal) => {
    const priority = normalizeGoalPriority(goal.priority);
    const weight = weightByGoalId[goal.id] ?? 0;
    return {
      ...goal,
      priority,
      weight,
    };
  });
}

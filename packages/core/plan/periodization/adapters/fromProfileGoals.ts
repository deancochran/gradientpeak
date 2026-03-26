import {
  type NormalizedPlanningGoal,
  normalizedPlanningGoalSchema,
  type PlanningGoalPriorityClass,
} from "../../../schemas/planning";
import type { GoalTargetV2 } from "../../../schemas/training_plan_structure";

export interface ProfileGoalLike {
  id: string;
  name: string;
  target_date: string;
  priority?: number;
  targets: GoalTargetV2[];
}

function resolvePriorityClass(priority: number): PlanningGoalPriorityClass {
  if (priority >= 8) {
    return "A";
  }

  if (priority >= 4) {
    return "B";
  }

  return "C";
}

function resolvePrimaryActivityCategory(targets: GoalTargetV2[]) {
  for (const target of targets) {
    if ("activity_category" in target && target.activity_category) {
      return target.activity_category;
    }
  }

  return "other" as const;
}

export function fromProfileGoals(goals: ProfileGoalLike[]): NormalizedPlanningGoal[] {
  return goals
    .map((goal) => {
      const priority = goal.priority ?? 5;
      const priorityClass = resolvePriorityClass(priority);

      return normalizedPlanningGoalSchema.parse({
        id: goal.id,
        name: goal.name,
        target_date: goal.target_date,
        priority,
        priority_class: priorityClass,
        activity_category: resolvePrimaryActivityCategory(goal.targets),
        targets: goal.targets,
        rationale_codes: [
          `goal_priority_class_${priorityClass}`,
          "goal_normalized_from_legacy_profile_targets",
        ],
      });
    })
    .sort((left, right) => {
      if (left.target_date !== right.target_date) {
        return left.target_date.localeCompare(right.target_date);
      }

      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }

      return left.id.localeCompare(right.id);
    });
}

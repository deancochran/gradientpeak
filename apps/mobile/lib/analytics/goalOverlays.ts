import type { ProfileGoal } from "@repo/core";

export type GoalOverlayStatus = "active" | "completed" | "upcoming";

export interface GoalOverlay {
  id: string;
  goalId: string;
  targetDate: string;
  label: string;
  status: GoalOverlayStatus;
  activityCategory: ProfileGoal["activity_category"];
  objectiveType: ProfileGoal["objective"]["type"];
  targetMetric: string | null;
  color: string;
  priority: number;
}

type DateRangeFilter = {
  startDate?: string | null;
  endDate?: string | null;
};

function getGoalOverlayStatus(goal: ProfileGoal, todayKey: string): GoalOverlayStatus {
  if (!goal.target_date) {
    return "active";
  }

  if (goal.target_date < todayKey) {
    return "completed";
  }

  return "upcoming";
}

function getGoalOverlayColor(goal: ProfileGoal): string {
  switch (goal.activity_category) {
    case "run":
      return "rgba(168, 85, 247, 0.68)";
    case "bike":
      return "rgba(14, 165, 233, 0.68)";
    case "swim":
      return "rgba(6, 182, 212, 0.68)";
    default:
      return "rgba(34, 197, 94, 0.68)";
  }
}

function getGoalTargetMetric(goal: ProfileGoal): string | null {
  switch (goal.objective.type) {
    case "event_performance":
      return goal.objective.target_time_s !== undefined
        ? "finish_time"
        : goal.objective.target_speed_mps !== undefined
          ? "pace"
          : "event_completion";
    case "threshold":
      return goal.objective.metric;
    case "completion":
      return goal.objective.distance_m !== undefined
        ? "distance"
        : goal.objective.duration_s !== undefined
          ? "duration"
          : "completion";
    case "consistency":
      return "sessions_per_week";
  }
}

export function filterGoalOverlaysByDateRange<T extends { targetDate: string }>(
  overlays: T[],
  range: DateRangeFilter,
): T[] {
  return overlays.filter((overlay) => {
    if (range.startDate && overlay.targetDate < range.startDate) {
      return false;
    }

    if (range.endDate && overlay.targetDate > range.endDate) {
      return false;
    }

    return true;
  });
}

export function buildGoalOverlays({
  goals,
  todayKey,
  dateRange,
}: {
  goals: ProfileGoal[];
  todayKey: string;
  dateRange?: DateRangeFilter;
}): GoalOverlay[] {
  const overlays = goals
    .filter(
      (goal): goal is ProfileGoal & { target_date: string } =>
        typeof goal.target_date === "string" && goal.target_date.length > 0,
    )
    .map((goal) => ({
      id: `goal-overlay:${goal.id}`,
      goalId: goal.id,
      targetDate: goal.target_date,
      label: goal.title,
      status: getGoalOverlayStatus(goal, todayKey),
      activityCategory: goal.activity_category,
      objectiveType: goal.objective.type,
      targetMetric: getGoalTargetMetric(goal),
      color: getGoalOverlayColor(goal),
      priority: goal.priority,
    }))
    .sort((left, right) => {
      const dateOrder = left.targetDate.localeCompare(right.targetDate);
      return dateOrder === 0 ? right.priority - left.priority : dateOrder;
    });

  return dateRange ? filterGoalOverlaysByDateRange(overlays, dateRange) : overlays;
}

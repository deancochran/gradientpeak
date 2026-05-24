export type GoalReadinessTrajectoryPointInput = {
  date: string;
  state_readiness?: number | null;
  predicted_fitness_ctl?: number | null;
};

export type GoalReadinessTrajectoryPoint = {
  date: string;
  goal_readiness: number;
  low: number;
  high: number;
};

export type BuildGoalReadinessTrajectoryInput = {
  points: GoalReadinessTrajectoryPointInput[];
  goalTargetDate: string;
  currentGoalReadiness?: number | null;
  targetGoalReadiness?: number | null;
  confidence?: "high" | "medium" | "low";
};

export function resolveGoalReadinessTarget(
  input?: {
    target_surplus_preference?: number | null;
  } | null,
): number {
  const surplus = input?.target_surplus_preference;
  if (typeof surplus !== "number" || !Number.isFinite(surplus)) {
    return 100;
  }

  return Math.max(94, Math.min(110, Math.round(96 + surplus * 16)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function dateMs(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function smoothstep(value: number): number {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

function uncertaintyMargin(confidence?: "high" | "medium" | "low"): number {
  if (confidence === "high") return 4;
  if (confidence === "medium") return 8;
  return 12;
}

/**
 * Converts a physiological readiness path into a goal-normalized readiness trajectory.
 *
 * State readiness describes fitness/fatigue/form. Goal readiness describes progress toward being
 * prepared for a specific target date, so the recommended trajectory is anchored to the goal date
 * rather than capped by the raw state-readiness score.
 */
export function buildGoalReadinessTrajectory({
  points,
  goalTargetDate,
  currentGoalReadiness,
  targetGoalReadiness,
  confidence,
}: BuildGoalReadinessTrajectoryInput): GoalReadinessTrajectoryPoint[] {
  const visiblePoints = [...points]
    .filter((point) => point.date && point.date <= goalTargetDate)
    .sort((left, right) => left.date.localeCompare(right.date));

  if (visiblePoints.length === 0) {
    return [];
  }

  const firstPoint = visiblePoints[0]!;
  const firstReadiness =
    typeof currentGoalReadiness === "number" && Number.isFinite(currentGoalReadiness)
      ? currentGoalReadiness
      : typeof firstPoint.state_readiness === "number" &&
          Number.isFinite(firstPoint.state_readiness)
        ? firstPoint.state_readiness
        : 50;
  const target = clamp(
    typeof targetGoalReadiness === "number" && Number.isFinite(targetGoalReadiness)
      ? targetGoalReadiness
      : resolveGoalReadinessTarget(),
    70,
    110,
  );
  const start = clamp(firstReadiness, 0, target);
  const margin = uncertaintyMargin(confidence);
  const firstMs = dateMs(firstPoint.date);
  const goalMs = Math.max(firstMs, dateMs(goalTargetDate));
  const totalDuration = Math.max(1, goalMs - firstMs);
  const ctlValues = visiblePoints
    .map((point) => point.predicted_fitness_ctl)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const startCtl = ctlValues[0] ?? null;
  const peakCtl = ctlValues.length > 0 ? Math.max(...ctlValues) : null;

  return visiblePoints.map((point) => {
    const timeProgress = clamp((dateMs(point.date) - firstMs) / totalDuration, 0, 1);
    const ctlProgress =
      startCtl !== null && peakCtl !== null && peakCtl > startCtl
        ? clamp(((point.predicted_fitness_ctl ?? startCtl) - startCtl) / (peakCtl - startCtl), 0, 1)
        : timeProgress;
    const stateProgress =
      typeof point.state_readiness === "number" && Number.isFinite(point.state_readiness)
        ? clamp((point.state_readiness - start) / Math.max(1, target - start), 0, 1)
        : timeProgress;
    const progress = smoothstep(
      Math.max(timeProgress * 0.55 + ctlProgress * 0.35 + stateProgress * 0.1, timeProgress),
    );
    const readiness = round1(start + (target - start) * progress);

    return {
      date: point.date,
      goal_readiness: readiness,
      low: round1(clamp(readiness - margin, 0, 110)),
      high: round1(clamp(readiness + margin, 0, 110)),
    };
  });
}

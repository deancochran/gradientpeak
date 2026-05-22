import type { ProfileGoal } from "../schemas";
import { getGoalMetricSummary } from "./draft";

export type GoalIntelligenceStatus =
  | "behind"
  | "slightly_behind"
  | "on_track"
  | "ahead"
  | "exceeding"
  | "uncertain";

export type GoalIntelligenceOutcomeType =
  | "finish_time"
  | "pace"
  | "power"
  | "heart_rate"
  | "completion"
  | "consistency";

export type GoalIntelligenceDriver = {
  metric: string;
  direction: "positive" | "negative" | "neutral";
  label: string;
  description: string;
  impact: "low" | "medium" | "high";
};

export type GoalIntelligence = {
  goalId: string;
  status: GoalIntelligenceStatus;
  readinessScore: number | null;
  projectedOutcome: {
    type: GoalIntelligenceOutcomeType;
    value: number | string | null;
    unit: string;
    displayValue: string;
    confidenceLow?: number | string;
    confidenceHigh?: number | string;
    confidenceDisplay?: string;
  };
  targetOutcome: {
    value: number | string | null;
    unit: string;
    displayValue: string;
  };
  summary: string;
  explanation: string;
  keyDrivers: GoalIntelligenceDriver[];
  updatedAt: string;
};

export type BuildGoalIntelligenceInput = {
  goal: ProfileGoal;
  readinessScore?: number | null;
  confidence?: number | null;
  updatedAt?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundedReadiness(readinessScore: number | null | undefined): number | null {
  return typeof readinessScore === "number" && Number.isFinite(readinessScore)
    ? Math.round(clamp(readinessScore, 0, 200))
    : null;
}

export function interpretGoalReadiness(readinessScore: number | null | undefined): {
  status: GoalIntelligenceStatus;
  label: string;
} {
  const score = roundedReadiness(readinessScore);

  if (score === null) {
    return { status: "uncertain", label: "Projection needs more data" };
  }

  if (score < 80) return { status: "behind", label: "Behind target trajectory" };
  if (score < 95) return { status: "slightly_behind", label: "Slightly behind target" };
  if (score <= 105) return { status: "on_track", label: "On track" };
  if (score <= 120) return { status: "ahead", label: "Ahead of target" };
  return { status: "exceeding", label: "Exceeding target trajectory" };
}

function formatFriendlyDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatPaceFromSpeed(speedMps: number): string {
  if (!Number.isFinite(speedMps) || speedMps <= 0) {
    return "--";
  }

  return `${formatFriendlyDuration(1609.344 / speedMps)}/mi`;
}

function confidenceRangePercent(confidence: number | null | undefined): number {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return 0.06;
  }

  return 0.12 - clamp(confidence, 0, 1) * 0.08;
}

function readinessFactor(readinessScore: number | null): number | null {
  if (readinessScore === null) return null;
  return clamp(readinessScore / 100, 0.5, 1.5);
}

function createTargetOutcome(goal: ProfileGoal): GoalIntelligence["targetOutcome"] {
  const metric = getGoalMetricSummary(goal);

  switch (goal.objective.type) {
    case "event_performance":
      return {
        value: goal.objective.target_time_s ?? goal.objective.target_speed_mps ?? null,
        unit: goal.objective.target_time_s ? "seconds" : "m/s",
        displayValue: metric.value,
      };
    case "threshold":
      return {
        value: goal.objective.value,
        unit:
          goal.objective.metric === "power" ? "W" : goal.objective.metric === "hr" ? "bpm" : "m/s",
        displayValue: metric.value,
      };
    case "completion":
      return {
        value: goal.objective.duration_s ?? goal.objective.distance_m ?? null,
        unit: goal.objective.duration_s ? "seconds" : "meters",
        displayValue: metric.value,
      };
    case "consistency":
      return {
        value: goal.objective.target_sessions_per_week ?? goal.objective.target_weeks ?? null,
        unit: "sessions",
        displayValue: metric.value,
      };
  }
}

function createProjectedOutcome(input: {
  goal: ProfileGoal;
  readinessScore: number | null;
  confidence?: number | null;
}): GoalIntelligence["projectedOutcome"] {
  const { goal, readinessScore, confidence } = input;
  const factor = readinessFactor(readinessScore);
  const rangePercent = confidenceRangePercent(confidence);

  if (factor === null) {
    return {
      type:
        goal.objective.type === "threshold" && goal.objective.metric === "power"
          ? "power"
          : "completion",
      value: null,
      unit: "unknown",
      displayValue: "Projection unavailable",
      confidenceDisplay: "Add more training data to estimate an outcome.",
    };
  }

  switch (goal.objective.type) {
    case "event_performance": {
      if (typeof goal.objective.target_time_s === "number") {
        const projectedSeconds = goal.objective.target_time_s / factor;
        const low = projectedSeconds * (1 - rangePercent);
        const high = projectedSeconds * (1 + rangePercent);

        return {
          type: "finish_time",
          value: Math.round(projectedSeconds),
          unit: "seconds",
          displayValue: formatFriendlyDuration(projectedSeconds),
          confidenceLow: Math.round(low),
          confidenceHigh: Math.round(high),
          confidenceDisplay: `${formatFriendlyDuration(low)}-${formatFriendlyDuration(high)}`,
        };
      }

      if (typeof goal.objective.target_speed_mps === "number") {
        const projectedSpeed = goal.objective.target_speed_mps * factor;
        return {
          type: "pace",
          value: projectedSpeed,
          unit: "m/s",
          displayValue: formatPaceFromSpeed(projectedSpeed),
        };
      }

      break;
    }
    case "threshold": {
      const projectedValue =
        goal.objective.metric === "pace"
          ? goal.objective.value * factor
          : goal.objective.value * factor;
      const type =
        goal.objective.metric === "power"
          ? "power"
          : goal.objective.metric === "hr"
            ? "heart_rate"
            : "pace";
      const displayValue =
        goal.objective.metric === "pace"
          ? formatPaceFromSpeed(projectedValue)
          : goal.objective.metric === "power"
            ? `${Math.round(projectedValue)} W`
            : `${Math.round(projectedValue)} bpm`;

      return {
        type,
        value: Math.round(projectedValue),
        unit:
          goal.objective.metric === "power" ? "W" : goal.objective.metric === "hr" ? "bpm" : "m/s",
        displayValue,
      };
    }
    case "completion": {
      const completionLikelihood = Math.round(clamp(factor * 100, 0, 100));
      return {
        type: "completion",
        value: completionLikelihood,
        unit: "%",
        displayValue: `${completionLikelihood}% completion confidence`,
      };
    }
    case "consistency": {
      const completionRate = Math.round(clamp(factor * 100, 0, 100));
      return {
        type: "consistency",
        value: completionRate,
        unit: "%",
        displayValue: `${completionRate}% projected completion rate`,
      };
    }
  }

  return {
    type: "completion",
    value: null,
    unit: "unknown",
    displayValue: "Projection unavailable",
  };
}

function createSummary(input: {
  goal: ProfileGoal;
  status: GoalIntelligenceStatus;
  projectedDisplay: string;
  targetDisplay: string;
}): string {
  const { goal, status, projectedDisplay, targetDisplay } = input;

  if (status === "uncertain") {
    return `More training data is needed before ${goal.title} can produce a reliable performance projection.`;
  }

  const prefix =
    status === "behind"
      ? "Current trajectory is behind"
      : status === "slightly_behind"
        ? "Current trajectory is slightly behind"
        : status === "on_track"
          ? "Current trajectory is on track for"
          : status === "ahead"
            ? "Current trajectory is ahead of"
            : "Current trajectory is exceeding";

  return `${prefix} the ${targetDisplay} target, projecting ${projectedDisplay}.`;
}

function createDrivers(input: {
  goal: ProfileGoal;
  status: GoalIntelligenceStatus;
  readinessScore: number | null;
}): GoalIntelligenceDriver[] {
  const { goal, status, readinessScore } = input;
  const targetMetric = getGoalMetricSummary(goal);
  const readinessDirection =
    status === "behind" || status === "slightly_behind"
      ? "negative"
      : status === "uncertain"
        ? "neutral"
        : "positive";

  return [
    {
      metric: "goal_target",
      direction: "neutral",
      label: targetMetric.label,
      description: `${targetMetric.value} is the target this projection is measured against.`,
      impact: "medium",
    },
    {
      metric: "readiness_trajectory",
      direction: readinessDirection,
      label: "Readiness trajectory",
      description:
        readinessScore === null
          ? "Readiness is not available yet, so the goal is shown with an uncertainty state."
          : `Current readiness is ${readinessScore}%, which drives the projected outcome range.`,
      impact: "high",
    },
    {
      metric: "goal_timing",
      direction: "neutral",
      label: "Goal timing",
      description: `The target date is ${goal.target_date}, so future training and recovery should be interpreted against that window.`,
      impact: "medium",
    },
  ];
}

export function buildGoalIntelligence(input: BuildGoalIntelligenceInput): GoalIntelligence {
  const readinessScore = roundedReadiness(input.readinessScore);
  const readiness = interpretGoalReadiness(readinessScore);
  const targetOutcome = createTargetOutcome(input.goal);
  const projectedOutcome = createProjectedOutcome({
    goal: input.goal,
    readinessScore,
    confidence: input.confidence,
  });
  const summary = createSummary({
    goal: input.goal,
    status: readiness.status,
    projectedDisplay: projectedOutcome.displayValue,
    targetDisplay: targetOutcome.displayValue,
  });

  return {
    goalId: input.goal.id,
    status: readiness.status,
    readinessScore,
    projectedOutcome,
    targetOutcome,
    summary,
    explanation:
      readiness.status === "uncertain"
        ? "Goal intelligence needs completed training, readiness, or forecast inputs before it can estimate a reliable outcome."
        : readiness.label,
    keyDrivers: createDrivers({ goal: input.goal, status: readiness.status, readinessScore }),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

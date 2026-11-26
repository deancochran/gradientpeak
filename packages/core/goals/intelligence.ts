import type { ProfileGoal } from "../schemas";
import { getGoalMetricSummary } from "./draft";

export type GoalIntelligenceStatus =
  | "behind"
  | "slightly_behind"
  | "on_track"
  | "ahead"
  | "exceeding"
  | "uncertain";

export type GoalIntelligenceState = "unavailable" | "heuristic_context";

export type GoalIntelligenceReasonCode =
  | "readiness_unavailable"
  | "heuristic_readiness_not_predictive";

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
  state: GoalIntelligenceState;
  reasonCodes: GoalIntelligenceReasonCode[];
  status: GoalIntelligenceStatus;
  readinessScore: number | null;
  projectedOutcome: {
    type: GoalIntelligenceOutcomeType;
    value: number | string | null;
    unit: string;
    displayValue: string;
    confidenceLow?: number | string | null;
    confidenceHigh?: number | string | null;
    confidenceDisplay?: string | null;
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
  void readinessScore;
  return { status: "uncertain", label: "Outcome projection unavailable" };
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
}): GoalIntelligence["projectedOutcome"] {
  const { goal } = input;
  const type: GoalIntelligenceOutcomeType =
    goal.objective.type === "event_performance"
      ? typeof goal.objective.target_time_s === "number"
        ? "finish_time"
        : "pace"
      : goal.objective.type === "threshold"
        ? goal.objective.metric === "power"
          ? "power"
          : goal.objective.metric === "hr"
            ? "heart_rate"
            : "pace"
        : goal.objective.type;
  return {
    type,
    value: null,
    unit: "unknown",
    displayValue: "Projection unavailable",
    confidenceLow: null,
    confidenceHigh: null,
    confidenceDisplay: null,
  };
}

function createSummary(input: {
  goal: ProfileGoal;
  status: GoalIntelligenceStatus;
  targetDisplay: string;
}): string {
  const { goal, targetDisplay } = input;
  return `No validated outcome projection is available for ${goal.title}; the target remains ${targetDisplay}.`;
}

function createDrivers(input: {
  goal: ProfileGoal;
  status: GoalIntelligenceStatus;
  readinessScore: number | null;
}): GoalIntelligenceDriver[] {
  const { goal, status, readinessScore } = input;
  const targetMetric = getGoalMetricSummary(goal);
  void status;

  return [
    {
      metric: "goal_target",
      direction: "neutral",
      label: targetMetric.label,
      description: `${targetMetric.value} is the goal target.`,
      impact: "medium",
    },
    {
      metric: "readiness_context",
      direction: "neutral",
      label: "Readiness context",
      description:
        readinessScore === null
          ? "Readiness is not available yet, so the goal is shown with an uncertainty state."
          : `Current readiness is ${readinessScore}; this is heuristic context, not a performance prediction.`,
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
  });
  const summary = createSummary({
    goal: input.goal,
    status: readiness.status,
    targetDisplay: targetOutcome.displayValue,
  });

  return {
    goalId: input.goal.id,
    state: readinessScore === null ? "unavailable" : "heuristic_context",
    reasonCodes: [
      readinessScore === null ? "readiness_unavailable" : "heuristic_readiness_not_predictive",
    ],
    status: readiness.status,
    readinessScore,
    projectedOutcome,
    targetOutcome,
    summary,
    explanation:
      "Readiness context is descriptive only and does not predict target attainment or performance outcomes.",
    keyDrivers: createDrivers({ goal: input.goal, status: readiness.status, readinessScore }),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

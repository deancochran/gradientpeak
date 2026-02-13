import {
  creationFeasibilitySafetySummarySchema,
  type CreationContextSummary,
  type CreationFeasibilitySafetySummary,
  type TrainingPlanCreationConfig,
} from "../schemas/training_plan_structure";
import type { ConstraintConflict } from "./resolveConstraintConflicts";

export interface ClassifyCreationFeasibilityInput {
  config: TrainingPlanCreationConfig;
  context: CreationContextSummary;
  conflicts?: ConstraintConflict[];
  now_iso?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Classifies deterministic feasibility and safety from creation config.
 */
export function classifyCreationFeasibility(
  input: ClassifyCreationFeasibilityInput,
): CreationFeasibilitySafetySummary {
  const { config, context } = input;
  const nowIso = input.now_iso ?? new Date().toISOString();
  const conflicts = input.conflicts ?? [];

  const recommendedSessionMidpoint =
    (context.recommended_sessions_per_week_range.min +
      context.recommended_sessions_per_week_range.max) /
    2;
  const configuredSessionMidpoint =
    ((config.constraints.min_sessions_per_week ?? recommendedSessionMidpoint) +
      (config.constraints.max_sessions_per_week ??
        recommendedSessionMidpoint)) /
    2;
  const sessionHalfRange =
    Math.max(
      1,
      (context.recommended_sessions_per_week_range.max -
        context.recommended_sessions_per_week_range.min) /
        2,
    ) || 1;
  const normalizedDistance =
    Math.abs(configuredSessionMidpoint - recommendedSessionMidpoint) /
    sessionHalfRange;
  const feasibilityScore = Number(
    clamp(1 - normalizedDistance, 0, 1).toFixed(3),
  );

  const feasibilityBand =
    configuredSessionMidpoint <
    context.recommended_sessions_per_week_range.min * 0.9
      ? "under-reaching"
      : configuredSessionMidpoint >
          context.recommended_sessions_per_week_range.max * 1.1
        ? "over-reaching"
        : "on-track";

  const hardRestDays = new Set(config.constraints.hard_rest_days).size;
  const maxSessions = config.constraints.max_sessions_per_week ?? 0;

  let safetyScore = 1;
  if (feasibilityBand === "over-reaching") safetyScore -= 0.35;
  if (hardRestDays === 0 && maxSessions >= 6) safetyScore -= 0.2;
  if (config.constraints.goal_difficulty_preference === "stretch")
    safetyScore -= 0.12;
  if (context.history_availability_state === "none" && maxSessions >= 6) {
    safetyScore -= 0.2;
  }

  const blockingConflictCount = conflicts.filter(
    (conflict) => conflict.severity === "blocking",
  ).length;
  safetyScore -= blockingConflictCount * 0.2;
  safetyScore = Number(clamp(safetyScore, 0, 1).toFixed(3));

  const safetyBand =
    safetyScore >= 0.7 ? "safe" : safetyScore >= 0.4 ? "caution" : "high-risk";

  const confidencePenalty = blockingConflictCount > 0 ? 0.2 : 0;
  const confidence = Number(
    clamp(context.signal_quality - confidencePenalty, 0.1, 1).toFixed(3),
  );

  const topDrivers = [
    {
      code: `sessions_vs_context_${feasibilityBand}`,
      message:
        feasibilityBand === "on-track"
          ? "Session constraints align with recent context range"
          : feasibilityBand === "under-reaching"
            ? "Session constraints are conservative compared to recent context"
            : "Session constraints are aggressive compared to recent context",
      impact: Number((feasibilityBand === "on-track" ? 0.4 : -0.45).toFixed(3)),
    },
    {
      code: `history_${context.history_availability_state}`,
      message:
        context.history_availability_state === "rich"
          ? "Rich recent history supports tighter calibration"
          : context.history_availability_state === "sparse"
            ? "Sparse history widens recommendation uncertainty"
            : "No history fallback uses conservative assumptions",
      impact:
        context.history_availability_state === "rich"
          ? 0.2
          : context.history_availability_state === "sparse"
            ? -0.1
            : -0.2,
    },
    {
      code: `constraints_rest_days_${hardRestDays}`,
      message:
        hardRestDays >= 2
          ? "Rest-day constraints provide recovery margin"
          : "Limited hard rest constraints reduce recovery margin",
      impact: hardRestDays >= 2 ? 0.15 : -0.15,
    },
  ];

  const recommendedActions = [] as Array<{
    code: string;
    message: string;
    priority: 1 | 2 | 3;
  }>;

  if (feasibilityBand === "over-reaching" || safetyBand !== "safe") {
    recommendedActions.push({
      code: "reduce_session_density",
      message: "Reduce session targets or raise recovery constraints",
      priority: 1,
    });
  }

  if (feasibilityBand === "under-reaching") {
    recommendedActions.push({
      code: "increase_session_density",
      message: "Increase session targets toward the recommended range",
      priority: 2,
    });
  }

  if (
    config.constraints.goal_difficulty_preference === "stretch" &&
    safetyBand !== "safe"
  ) {
    recommendedActions.push({
      code: "reduce_goal_difficulty",
      message: "Switch goal difficulty from stretch to balanced",
      priority: 2,
    });
  }

  const blockers = conflicts
    .filter((conflict) => conflict.severity === "blocking")
    .map((conflict) => ({
      code: conflict.code,
      message: conflict.message,
      field_paths: conflict.field_paths,
    }));

  return creationFeasibilitySafetySummarySchema.parse({
    feasibility_band: feasibilityBand,
    safety_band: safetyBand,
    feasibility_score: feasibilityScore,
    safety_score: safetyScore,
    confidence,
    top_drivers: topDrivers,
    recommended_actions: recommendedActions,
    blockers,
    computed_at: nowIso,
  });
}

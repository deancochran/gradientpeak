import type { ReadinessForecastBaseline } from "@repo/core";

type ReadinessForecastDashboard = {
  physiological_readiness_score: number | null;
  readiness_points: Array<{ predicted_fitness_longTermLoad: number }>;
  readiness_score: number | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Builds the readiness forecast baseline while preserving history and projection fallback semantics. */
export function buildReadinessForecastBaseline(input: {
  startDate: string;
  today: string;
  hasActualHistory: boolean;
  estimatedCurrentLongTermLoad: number;
  projectionDashboard: ReadinessForecastDashboard | null;
  readinessSummaryScore: number;
}): ReadinessForecastBaseline {
  if (input.hasActualHistory) {
    return {
      start_date: input.startDate,
      today: input.today,
      initial_longTermLoad: 0,
      initial_recentLoad: 0,
      initial_readiness: 50,
      source: "history",
      confidence: "medium",
      confidence_reason_codes: [],
    };
  }

  const projectionPoint = input.projectionDashboard?.readiness_points[0];
  const fallbackLongTermLoad =
    projectionPoint && Number.isFinite(projectionPoint.predicted_fitness_longTermLoad)
      ? projectionPoint.predicted_fitness_longTermLoad
      : input.estimatedCurrentLongTermLoad;
  const fallbackReadiness =
    input.projectionDashboard?.physiological_readiness_score ??
    input.projectionDashboard?.readiness_score ??
    input.readinessSummaryScore;

  return {
    start_date: input.startDate,
    today: input.today,
    initial_longTermLoad: Math.round(Math.max(0, fallbackLongTermLoad) * 10) / 10,
    initial_recentLoad: Math.round(Math.max(0, fallbackLongTermLoad) * 10) / 10,
    initial_readiness: clamp(Math.round(fallbackReadiness), 0, 100),
    today_longTermLoad: Math.round(Math.max(0, fallbackLongTermLoad) * 10) / 10,
    today_recentLoad: Math.round(Math.max(0, fallbackLongTermLoad) * 10) / 10,
    today_readiness: clamp(Math.round(fallbackReadiness), 0, 100),
    source: input.projectionDashboard ? "fallback" : "profile_estimate",
    confidence: input.projectionDashboard ? "medium" : "low",
    confidence_reason_codes: ["projection_fallback_baseline"],
  };
}

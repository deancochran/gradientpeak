import {
  type CommonLoadRecommendation,
  type CommonLoadTrendProjectionDay,
  projectCommonLoadTrend,
} from "@repo/core/load";

type PlanCommonLoadProjectionPoint = {
  date: string;
  effectiveLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  effectiveLoad?: number | null;
};

type CommonLoadHistory =
  | {
      status: "available";
      points: Array<{
        date: string;
        longTermLoad: number;
        recentLoad: number;
        loadBalance: number;
      }>;
    }
  | { status: "unavailable" }
  | null
  | undefined;

function finiteNonnegative(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function toProjectionDay(point: PlanCommonLoadProjectionPoint): CommonLoadTrendProjectionDay {
  if (point.effectiveLoadStatus === "known_zero") {
    return { date: point.date, state: "known_zero" };
  }
  if (
    (point.effectiveLoadStatus === "complete" || point.effectiveLoadStatus === "partial") &&
    finiteNonnegative(point.effectiveLoad)
  ) {
    return { date: point.date, state: "available", load: point.effectiveLoad };
  }
  return {
    date: point.date,
    state: "unavailable",
    reason: point.effectiveLoadStatus === "partial" ? "partial" : "unavailable",
  };
}

function toRecommendationProjectionDay(
  point: Exclude<CommonLoadRecommendation, { status: "unavailable" }>["points"][number],
): CommonLoadTrendProjectionDay {
  if (point.state === "known_zero") return { date: point.date, state: "known_zero" };
  if (point.state === "complete" || point.state === "partial") {
    return { date: point.date, state: "available", load: point.load };
  }
  return {
    date: point.date,
    state: "unavailable",
    reason: "unavailable",
  };
}

export function buildPlanCommonLoadFitnessSeries(input: {
  history: CommonLoadHistory;
  points: readonly PlanCommonLoadProjectionPoint[];
  recommendation?: CommonLoadRecommendation;
}) {
  if (input.history?.status !== "available") {
    return {
      actualFitnessHistory: [],
      projectedFitness: [],
      recommendedFitness: [],
      projectionStatus: "unavailable" as const,
      recommendationProjectionStatus: "unavailable" as const,
    };
  }

  const actualFitnessHistory = input.history.points.map((point) => ({
    date: point.date,
    longTermLoad: point.longTermLoad,
    recentLoad: point.recentLoad,
    loadBalance: point.loadBalance,
  }));
  const baseline = input.history.points.at(-1);
  if (!baseline) {
    return {
      actualFitnessHistory,
      projectedFitness: [],
      recommendedFitness: [],
      projectionStatus: "unavailable" as const,
      recommendationProjectionStatus: "unavailable" as const,
    };
  }

  const projection = projectCommonLoadTrend({
    baseline,
    days: input.points.filter((point) => point.date > baseline.date).map(toProjectionDay),
  });
  const projectedFitness =
    projection.points.length > 1
      ? projection.points.map((point) => ({
          date: point.date,
          longTermLoad: point.longTermLoad,
          recentLoad: point.recentLoad,
          loadBalance: point.loadBalance,
        }))
      : [];
  const recommendationProjection =
    input.recommendation && input.recommendation.status !== "unavailable"
      ? projectCommonLoadTrend({
          baseline,
          days: input.recommendation.points
            .filter((point) => point.date > baseline.date)
            .map(toRecommendationProjectionDay),
        })
      : null;
  const recommendedFitness =
    recommendationProjection && recommendationProjection.points.length > 1
      ? recommendationProjection.points.map((point) => ({
          date: point.date,
          longTermLoad: point.longTermLoad,
          recentLoad: point.recentLoad,
          loadBalance: point.loadBalance,
        }))
      : [];

  return {
    actualFitnessHistory,
    projectedFitness,
    recommendedFitness,
    projectionStatus: projection.status,
    recommendationProjectionStatus: recommendationProjection?.status ?? ("unavailable" as const),
  };
}

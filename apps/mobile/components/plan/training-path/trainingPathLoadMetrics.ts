type TrainingPathLoadMetricPoint = {
  completedLoad?: number | null;
  completedLoadUnavailable?: boolean;
  hasCompletedActivityWithoutLoad?: boolean;
  hasTargetLoad?: boolean;
  effectiveLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable" | undefined;
  effectiveLoad?: number | null | undefined;
  effectiveIntensity?: number | null | undefined;
  effectiveCompletedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable" | undefined;
  effectiveCompletedLoad?: number | null | undefined;
  effectiveRemainingLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable" | undefined;
  effectiveRemainingLoad?: number | null | undefined;
  recommendedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable" | undefined;
  recommendedLoad?: number | null | undefined;
  plannedLoad?: number | null;
  plannedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable" | undefined;
  targetLoad?: number | null;
};

function formatIntensity(value: number): string {
  const label =
    value < 0.6 ? "Easy" : value < 0.85 ? "Moderate" : value < 1.05 ? "Hard" : "Very hard";
  return `${label} · ${value.toFixed(2)}`;
}

export type TrainingPathLoadMetric = {
  label: "Common Load" | "Completed" | "Normalized intensity" | "Planned" | "Remaining" | "Target";
  value: string;
};

function formatLoad(value: number) {
  return String(Math.round(value));
}

function finiteLoad(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRemainingLoad(point: TrainingPathLoadMetricPoint) {
  return point.effectiveRemainingLoad === undefined
    ? finiteLoad(point.plannedLoad)
    : finiteLoad(point.effectiveRemainingLoad);
}

function formatRecommendedLoad(point: TrainingPathLoadMetricPoint) {
  if (point.recommendedLoadStatus === "known_zero") return "0";
  const value = finiteLoad(point.recommendedLoad);
  if (point.recommendedLoadStatus === "unavailable" || value === null) return "Unavailable";
  return `${formatLoad(value)}${point.recommendedLoadStatus === "partial" ? " incomplete" : ""}`;
}

export function buildTrainingPathLoadMetrics(
  point: TrainingPathLoadMetricPoint | null | undefined,
  _options: { includeCompleted?: boolean } = {},
): TrainingPathLoadMetric[] {
  const metrics: TrainingPathLoadMetric[] = [];
  if (point?.effectiveLoadStatus) {
    const incomplete = point.effectiveLoadStatus === "partial";
    metrics.push({
      label: "Common Load",
      value:
        point.effectiveLoadStatus === "unavailable" || point.effectiveLoad == null
          ? "Unavailable"
          : `${formatLoad(point.effectiveLoad)}${incomplete ? " incomplete" : ""}`,
    });
    metrics.push({
      label: "Normalized intensity",
      value:
        point.effectiveLoadStatus === "known_zero"
          ? "—"
          : point.effectiveIntensity == null
            ? "Unavailable"
            : `${formatIntensity(point.effectiveIntensity)}${incomplete ? " incomplete" : ""}`,
    });
  }
  if (point?.effectiveLoadStatus) {
    if (
      point.effectiveCompletedLoad != null ||
      point.effectiveCompletedLoadStatus === "unavailable" ||
      point.hasCompletedActivityWithoutLoad ||
      point.completedLoadUnavailable
    ) {
      metrics.push({
        label: "Completed",
        value:
          point.effectiveCompletedLoadStatus === "unavailable" ||
          point.effectiveCompletedLoad == null
            ? "Unavailable"
            : `${formatLoad(point.effectiveCompletedLoad)}${point.effectiveCompletedLoadStatus === "partial" ? " incomplete" : point.hasCompletedActivityWithoutLoad || point.completedLoadUnavailable ? " + unavailable" : ""}`,
      });
    }
    const remainingLoad = getRemainingLoad(point);
    const remainingLoadStatus =
      point.effectiveRemainingLoad === undefined
        ? (point.plannedLoadStatus ?? point.effectiveLoadStatus)
        : (point.effectiveRemainingLoadStatus ?? point.effectiveLoadStatus);
    metrics.push({
      label: "Remaining",
      value:
        remainingLoadStatus === "known_zero"
          ? "0"
          : remainingLoadStatus === "unavailable" || remainingLoad === null
            ? "Unavailable"
            : `${formatLoad(remainingLoad)}${remainingLoadStatus === "partial" ? " incomplete" : ""}`,
    });
    if (point.recommendedLoadStatus) {
      metrics.push({
        label: "Target",
        value: formatRecommendedLoad(point),
      });
    }
    return metrics;
  }
  return metrics;
}

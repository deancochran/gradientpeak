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
  return finiteLoad(point.effectiveRemainingLoad) ?? finiteLoad(point.plannedLoad);
}

function formatRecommendedLoad(point: TrainingPathLoadMetricPoint) {
  if (point.recommendedLoadStatus === "known_zero") return "0";
  const value = finiteLoad(point.recommendedLoad);
  if (point.recommendedLoadStatus === "unavailable" || value === null) {
    return "—";
  }
  return formatLoad(value);
}

export function buildTrainingPathLoadMetrics(
  point: TrainingPathLoadMetricPoint | null | undefined,
  _options: { includeCompleted?: boolean } = {},
): TrainingPathLoadMetric[] {
  const metrics: TrainingPathLoadMetric[] = [];
  if (point?.effectiveLoadStatus) {
    metrics.push({
      label: "Common Load",
      value:
        point.effectiveLoadStatus === "unavailable" || point.effectiveLoad == null
          ? "—"
          : formatLoad(point.effectiveLoad),
    });
    metrics.push({
      label: "Normalized intensity",
      value:
        point.effectiveLoadStatus === "known_zero"
          ? "—"
          : point.effectiveIntensity == null
            ? "—"
            : formatIntensity(point.effectiveIntensity),
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
            ? "—"
            : formatLoad(point.effectiveCompletedLoad),
      });
    }
    const remainingLoad = getRemainingLoad(point);
    const hasEffectiveRemainingLoad = finiteLoad(point.effectiveRemainingLoad) !== null;
    const remainingLoadStatus =
      hasEffectiveRemainingLoad || point.effectiveRemainingLoadStatus === "known_zero"
        ? (point.effectiveRemainingLoadStatus ?? point.effectiveLoadStatus)
        : (point.plannedLoadStatus ?? point.effectiveLoadStatus);
    metrics.push({
      label: "Remaining",
      value:
        remainingLoadStatus === "known_zero"
          ? "0"
          : remainingLoadStatus === "unavailable" || remainingLoad === null
            ? "—"
            : formatLoad(remainingLoad),
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

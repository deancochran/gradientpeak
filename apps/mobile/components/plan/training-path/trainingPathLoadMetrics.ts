type TrainingPathLoadMetricPoint = {
  completedLoadTss?: number | null;
  completedLoadUnavailable?: boolean;
  hasCompletedActivityWithoutLoad?: boolean;
  hasTargetLoad?: boolean;
  effectiveLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  effectiveLoad?: number | null;
  effectiveIntensity?: number | null;
  effectiveCompletedLoad?: number | null;
  effectiveRemainingLoad?: number | null;
  effectiveTentativeLoad?: number | null;
  plannedLoadTss?: number | null;
  targetLoadTss?: number | null;
  tentativePlannedLoadTss?: number | null;
};

function formatIntensity(value: number): string {
  const label =
    value < 0.6 ? "Easy" : value < 0.85 ? "Moderate" : value < 1.05 ? "Hard" : "Very hard";
  return `${label} · ${value.toFixed(2)}`;
}

export type TrainingPathLoadMetric = {
  label: "Completed" | "Intensity" | "Load" | "Planned" | "Remaining" | "Target" | "Tentative";
  value: string;
};

function formatLoad(value: number) {
  return String(Math.round(value));
}

export function buildTrainingPathLoadMetrics(
  point: TrainingPathLoadMetricPoint | null | undefined,
  _options: { includeCompleted?: boolean } = {},
): TrainingPathLoadMetric[] {
  const metrics: TrainingPathLoadMetric[] = [];
  if (point?.effectiveLoadStatus) {
    const incomplete = point.effectiveLoadStatus === "partial";
    metrics.push({
      label: "Load",
      value:
        point.effectiveLoadStatus === "unavailable" || point.effectiveLoad == null
          ? "Unavailable"
          : `${formatLoad(point.effectiveLoad)}${incomplete ? " incomplete" : ""}`,
    });
    metrics.push({
      label: "Intensity",
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
      point.hasCompletedActivityWithoutLoad ||
      point.completedLoadUnavailable
    ) {
      metrics.push({
        label: "Completed",
        value:
          point.effectiveCompletedLoad == null
            ? "Unavailable"
            : `${formatLoad(point.effectiveCompletedLoad)}${point.hasCompletedActivityWithoutLoad ? " + unavailable" : ""}`,
      });
    }
    if (point.effectiveRemainingLoad != null) {
      metrics.push({ label: "Remaining", value: formatLoad(point.effectiveRemainingLoad) });
    }
    if (point.effectiveTentativeLoad != null) {
      metrics.push({ label: "Tentative", value: formatLoad(point.effectiveTentativeLoad) });
    }
    return metrics;
  }
  return metrics;
}

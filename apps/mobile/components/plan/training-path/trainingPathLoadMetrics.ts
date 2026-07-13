type TrainingPathLoadMetricPoint = {
  completedLoadTss?: number | null;
  hasCompletedActivityWithoutLoad?: boolean;
  plannedLoadTss?: number | null;
  targetLoadTss?: number | null;
  tentativePlannedLoadTss?: number | null;
};

export type TrainingPathLoadMetric = {
  label: "Completed" | "Planned" | "Recommended" | "Tentative";
  value: string;
};

function finiteValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatTss(value: number) {
  return `${Math.round(value)} TSS`;
}

export function buildTrainingPathLoadMetrics(
  point: TrainingPathLoadMetricPoint | null | undefined,
  options: { includeCompleted?: boolean } = {},
): TrainingPathLoadMetric[] {
  const metrics: TrainingPathLoadMetric[] = [
    { label: "Recommended", value: formatTss(finiteValue(point?.targetLoadTss)) },
    { label: "Planned", value: formatTss(finiteValue(point?.plannedLoadTss)) },
  ];
  const tentative = finiteValue(point?.tentativePlannedLoadTss);
  if (tentative > 0) metrics.push({ label: "Tentative", value: formatTss(tentative) });

  if (options.includeCompleted !== false) {
    const completed = finiteValue(point?.completedLoadTss);
    if (completed > 0 || point?.hasCompletedActivityWithoutLoad) {
      metrics.push({
        label: "Completed",
        value:
          point?.hasCompletedActivityWithoutLoad && completed <= 0
            ? "Unavailable"
            : formatTss(completed),
      });
    }
  }

  return metrics;
}

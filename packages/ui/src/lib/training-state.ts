/**
 * Presentation-only training-state vocabulary shared by web and native renderers.
 * Callers provide authorized values; this module never derives, fills, or forecasts
 * training-state data.
 */
export const trainingStateMetricIds = ["fitness", "fatigue", "form"] as const;

export type TrainingStateMetricId = (typeof trainingStateMetricIds)[number];
export type TrainingStateSource = "recorded" | "projected";
export type TrainingStateSourceStatus = TrainingStateSource | "mixed" | "unavailable";
export type TrainingStateSeriesSelection = {
  metric: TrainingStateMetricId;
  source: TrainingStateSource;
};

export type TrainingStateMetricValues = Record<TrainingStateMetricId, number | null>;

export type TrainingStateVisualPoint = {
  date: string;
  index: number;
  projected: TrainingStateMetricValues;
  recorded: TrainingStateMetricValues;
};

export type TrainingStateVisualContract = {
  points: readonly TrainingStateVisualPoint[];
  sourceStatus: TrainingStateSourceStatus;
  timeZone: string;
  unitLabel: string;
};

export const trainingStateMetrics = {
  fatigue: {
    colorToken: "chart-3",
    id: "fatigue",
    label: "Fatigue",
    nativeColor: "#d97706",
    webColor: "var(--chart-3)",
  },
  fitness: {
    colorToken: "chart-1",
    id: "fitness",
    label: "Fitness",
    nativeColor: "#2563eb",
    webColor: "var(--chart-1)",
  },
  form: {
    colorToken: "chart-5",
    id: "form",
    label: "Form",
    nativeColor: "#7c3aed",
    webColor: "var(--chart-5)",
  },
} as const satisfies Record<
  TrainingStateMetricId,
  {
    colorToken: string;
    id: TrainingStateMetricId;
    label: string;
    nativeColor: string;
    webColor: string;
  }
>;

export const trainingStateSourceLabels = {
  projected: "Projected",
  recorded: "Recorded",
} as const satisfies Record<TrainingStateSource, string>;

export function getTrainingStateMetric(metric: TrainingStateMetricId) {
  return trainingStateMetrics[metric];
}

export function getTrainingStateSourceLabel(source: TrainingStateSource) {
  return trainingStateSourceLabels[source];
}

export function getTrainingStateSourceStatus(
  points: readonly TrainingStateVisualPoint[],
): TrainingStateSourceStatus {
  const recorded = points.some((point) =>
    trainingStateMetricIds.some((metric) => point.recorded[metric] !== null),
  );
  const projected = points.some((point) =>
    trainingStateMetricIds.some((metric) => point.projected[metric] !== null),
  );
  if (recorded && projected) return "mixed";
  if (recorded) return "recorded";
  if (projected) return "projected";
  return "unavailable";
}

export function formatTrainingStateDate(date: string, timeZone: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) return date;
  try {
    // Planning dates are date-only values. Validate the supplied zone, but format the
    // calendar date in UTC so an offset never silently moves a planning day.
    Intl.DateTimeFormat(undefined, { timeZone }).format(parsed);
    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
}

export function formatTrainingStateValue(value: number | null, unitLabel: string) {
  return value === null ? "Unavailable" : `${value.toFixed(1)} ${unitLabel}`;
}

export function trainingStateHasValues(
  points: readonly TrainingStateVisualPoint[],
  series: readonly TrainingStateSeriesSelection[],
) {
  return points.some((point) =>
    series.some(({ metric, source }) => point[source][metric] !== null),
  );
}

export function getTrainingStateAccessibilityLabel(
  visual: TrainingStateVisualContract,
  series: readonly TrainingStateSeriesSelection[],
) {
  const summaries = series.map(({ metric, source }) => {
    const definition = getTrainingStateMetric(metric);
    const values = visual.points
      .map((point) => point[source][metric])
      .filter((value): value is number => value !== null);
    const sourceLabel = getTrainingStateSourceLabel(source);
    if (!values.length) {
      return `${definition.label} ${sourceLabel}: no values available`;
    }
    return `${definition.label} ${sourceLabel}: ${values.length} values; first ${formatTrainingStateValue(values[0] ?? null, visual.unitLabel)}; latest ${formatTrainingStateValue(values.at(-1) ?? null, visual.unitLabel)}`;
  });

  return `Training state in ${visual.unitLabel}. Planning timezone ${visual.timeZone}. ${summaries.join(". ")}.`;
}

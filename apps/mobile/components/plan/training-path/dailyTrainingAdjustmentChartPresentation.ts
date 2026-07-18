import { useMemo } from "react";
import type { DailyTrainingAdjustmentPoint } from "./DailyTrainingAdjustmentChart";

export type DailyTrainingAdjustmentChartDatum = Record<string, unknown> & {
  index: number;
  completedLoad: number | null;
  plannedLoad: number | null;
  plannedLoadWithTentative: number | null;
  targetLoad: number | null;
  actualFitness: number | null;
  projectedFitness: number | null;
  recommendedFitness: number | null;
};

export type DailyTrainingAdjustmentChartYKey =
  | "completedLoad"
  | "plannedLoad"
  | "plannedLoadWithTentative"
  | "targetLoad"
  | "actualFitness"
  | "projectedFitness"
  | "recommendedFitness";

export const dailyTrainingAdjustmentChartYKeys: DailyTrainingAdjustmentChartYKey[] = [
  "completedLoad",
  "plannedLoad",
  "plannedLoadWithTentative",
  "targetLoad",
  "actualFitness",
  "projectedFitness",
  "recommendedFitness",
];

export const dailyTrainingAdjustmentLoadYKeys: DailyTrainingAdjustmentChartYKey[] = [
  "completedLoad",
  "plannedLoad",
  "plannedLoadWithTentative",
  "targetLoad",
];

export const dailyTrainingAdjustmentFitnessYKeys: DailyTrainingAdjustmentChartYKey[] = [
  "actualFitness",
  "projectedFitness",
  "recommendedFitness",
];

function valueOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function valueOrZero(value: number | null | undefined) {
  return valueOrNull(value) ?? 0;
}

export function hasCompletedActivityWithoutLoad(
  point: Pick<DailyTrainingAdjustmentPoint, "hasCompletedActivityWithoutLoad"> & {
    date?: string;
  },
) {
  return point.hasCompletedActivityWithoutLoad === true;
}

function formatMetric(label: string, value: number | null | undefined, unit = "") {
  const finiteValue = valueOrNull(value);
  return finiteValue === null ? null : `${label} ${Math.round(finiteValue)}${unit}`;
}

export function buildDailyTrainingAdjustmentAccessibilityValue(
  point: DailyTrainingAdjustmentPoint | null,
) {
  if (!point) return "No date selected";

  const completedLoad = formatMetric("Completed load", point.completedLoadTss, " TSS");
  const plannedLoad = formatMetric("Planned load", point.plannedLoadTss, " TSS");
  const tentativeLoad = formatMetric(
    "Tentative planned load",
    point.tentativePlannedLoadTss,
    " TSS",
  );
  const targetLoad =
    point.hasTargetLoad === false
      ? "Target load unavailable"
      : formatMetric("Target load", point.targetLoadTss, " TSS");
  const actualFitness = formatMetric("Actual fitness", point.fitnessCtl);
  const projectedFitness = formatMetric("Projected fitness", point.scheduledFitnessCtl);
  const targetFitness = formatMetric("Target fitness", point.targetFitnessCtl);
  const completedState = hasCompletedActivityWithoutLoad(point)
    ? "Completed activity, load unavailable"
    : null;

  return [
    `Selected date ${point.date}`,
    completedLoad,
    completedState,
    plannedLoad,
    tentativeLoad,
    targetLoad,
    actualFitness,
    projectedFitness,
    targetFitness,
  ]
    .filter((value): value is string => value !== null)
    .join(". ");
}

function formatDayLabel(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `${month}/${day}`;
}

function expandDomain(
  values: number[],
  fallback: [number, number],
  paddingRatio = 0.08,
): [number, number] {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return fallback;
  const minValue = Math.min(...finiteValues, fallback[0]);
  const maxValue = Math.max(...finiteValues, fallback[1]);
  const span = Math.max(1, maxValue - minValue);
  return [Math.max(0, minValue - span * paddingRatio), maxValue + span * paddingRatio];
}

export function useDailyTrainingAdjustmentChartPresentation({
  formatDateLabel,
  points,
}: {
  formatDateLabel?: (dateKey: string, index: number) => string;
  points: DailyTrainingAdjustmentPoint[];
}) {
  const chartData = useMemo<DailyTrainingAdjustmentChartDatum[]>(
    () =>
      points.map((point, index) => {
        const planned = valueOrZero(point.plannedLoadTss);
        const tentative = valueOrZero(point.tentativePlannedLoadTss);
        return {
          index,
          completedLoad: valueOrNull(point.completedLoadTss),
          plannedLoad: planned > 0 ? planned : null,
          plannedLoadWithTentative: planned + tentative > 0 ? planned + tentative : null,
          targetLoad: point.hasTargetLoad === false ? null : valueOrNull(point.targetLoadTss),
          actualFitness: valueOrNull(point.fitnessCtl),
          projectedFitness: valueOrNull(point.scheduledFitnessCtl),
          recommendedFitness: valueOrNull(point.targetFitnessCtl),
        };
      }),
    [points],
  );

  const loadDomain = useMemo(
    () =>
      expandDomain(
        chartData.flatMap((point) => [
          valueOrZero(point.completedLoad as number | null),
          valueOrZero(point.plannedLoad as number | null),
          valueOrZero(point.plannedLoadWithTentative as number | null),
          valueOrZero(point.targetLoad as number | null),
        ]),
        [0, 100],
        0.1,
      ),
    [chartData],
  );
  const fitnessDomain = useMemo(
    () =>
      expandDomain(
        chartData
          .flatMap((point) => [
            valueOrNull(point.actualFitness as number | null),
            valueOrNull(point.projectedFitness as number | null),
            valueOrNull(point.recommendedFitness as number | null),
          ])
          .filter((value): value is number => value !== null),
        [0, 100],
        0.12,
      ),
    [chartData],
  );
  const labels = useMemo(
    () =>
      points.map(
        (point, index) => formatDateLabel?.(point.date, index) ?? formatDayLabel(point.date),
      ),
    [formatDateLabel, points],
  );

  return {
    chartData,
    fitnessDomain,
    labels,
    loadDomain,
  };
}

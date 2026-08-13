import { useMemo } from "react";
import type { DailyTrainingAdjustmentPoint } from "./DailyTrainingAdjustmentChart";
import type { PlanTrainingChartRange } from "./trainingPathTypes";

export type DailyTrainingAdjustmentChartDatum = Record<string, unknown> & {
  x: number;
  completedLoad: number | null;
  plannedLoad: number | null;
  actualFitness: number | null;
  projectedFitness: number | null;
  actualFatigue: number | null;
  projectedFatigue: number | null;
};

export type DailyTrainingAdjustmentChartYKey =
  | "completedLoad"
  | "plannedLoad"
  | "actualFitness"
  | "projectedFitness"
  | "actualFatigue"
  | "projectedFatigue";

export const dailyTrainingAdjustmentChartYKeys: DailyTrainingAdjustmentChartYKey[] = [
  "completedLoad",
  "plannedLoad",
  "actualFitness",
  "projectedFitness",
  "actualFatigue",
  "projectedFatigue",
];

export const dailyTrainingAdjustmentLoadYKeys: DailyTrainingAdjustmentChartYKey[] = [
  "completedLoad",
  "plannedLoad",
];

export const dailyTrainingAdjustmentFitnessYKeys: DailyTrainingAdjustmentChartYKey[] = [
  "actualFitness",
  "projectedFitness",
  "actualFatigue",
  "projectedFatigue",
];

export function buildDailyTrainingAdjustmentCartesianContract(
  data: DailyTrainingAdjustmentChartDatum[],
) {
  return { data, xKey: "x" as const };
}

function valueOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function parseDateKey(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function toDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function getPlanChartBucketDate(dateKey: string, range: PlanTrainingChartRange) {
  if (range === "daily") return dateKey;
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  if (range === "monthly") {
    return `${dateKey.slice(0, 7)}-01`;
  }
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return toDateKey(date);
}

export function formatPlanChartDateLabel(dateKey: string, range: PlanTrainingChartRange) {
  if (range === "daily") return formatDayLabel(dateKey);
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  const month = monthLabels[date.getUTCMonth()];
  if (range === "weekly") return `${month} ${date.getUTCDate()}`;
  return `${month} ’${String(date.getUTCFullYear()).slice(-2)}`;
}

function sumAvailable(
  points: readonly DailyTrainingAdjustmentPoint[],
  select: (point: DailyTrainingAdjustmentPoint) => number | null | undefined,
) {
  const values = points.map(select).filter((value): value is number => valueOrNull(value) !== null);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

function lastAvailable(
  points: readonly DailyTrainingAdjustmentPoint[],
  select: (point: DailyTrainingAdjustmentPoint) => number | null | undefined,
) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = valueOrNull(select(points[index] as DailyTrainingAdjustmentPoint));
    if (value !== null) return value;
  }
  return null;
}

export function aggregateDailyTrainingAdjustmentPoints(
  points: readonly DailyTrainingAdjustmentPoint[],
  range: PlanTrainingChartRange,
) {
  if (range === "daily") return [...points];

  const buckets = new Map<string, DailyTrainingAdjustmentPoint[]>();
  for (const point of [...points].sort((left, right) => left.date.localeCompare(right.date))) {
    const bucketDate = getPlanChartBucketDate(point.date, range);
    const bucket = buckets.get(bucketDate);
    if (bucket) bucket.push(point);
    else buckets.set(bucketDate, [point]);
  }

  return [...buckets.entries()].map(([date, bucket]) => {
    const completedLoad = sumAvailable(bucket, (point) => point.effectiveCompletedLoad);
    const plannedLoad = sumAvailable(
      bucket,
      (point) => point.plannedLoad ?? point.effectiveRemainingLoad,
    );
    const hasLoad = completedLoad !== null || plannedLoad !== null;
    const allLoadComplete = bucket.every(
      (point) =>
        point.effectiveLoadStatus === "complete" || point.effectiveLoadStatus === "known_zero",
    );

    return {
      date,
      effectiveLoadStatus: allLoadComplete
        ? ("complete" as const)
        : hasLoad
          ? ("partial" as const)
          : ("unavailable" as const),
      effectiveCompletedLoad: completedLoad,
      effectiveRemainingLoad: plannedLoad,
      plannedLoad,
      effectiveLoad:
        completedLoad === null && plannedLoad === null
          ? null
          : (completedLoad ?? 0) + (plannedLoad ?? 0),
      effectiveIntensity: null,
      hasCompletedActivityWithoutLoad: bucket.some(hasCompletedActivityWithoutLoad),
      fitnessCtl: lastAvailable(bucket, (point) => point.fitnessCtl),
      scheduledFitnessCtl: lastAvailable(bucket, (point) => point.scheduledFitnessCtl),
      actualFatigueAtl: lastAvailable(bucket, (point) => point.actualFatigueAtl),
      scheduledFatigueAtl: lastAvailable(bucket, (point) => point.scheduledFatigueAtl),
    } satisfies DailyTrainingAdjustmentPoint;
  });
}

function positiveValue(value: number | null | undefined) {
  const finiteValue = valueOrNull(value);
  return finiteValue !== null && finiteValue > 0;
}

export function hasCompletedActivityWithoutLoad(
  point: Pick<DailyTrainingAdjustmentPoint, "hasCompletedActivityWithoutLoad"> & {
    date?: string;
  },
) {
  return point.hasCompletedActivityWithoutLoad === true;
}

export function hasRenderableDailyTrainingAdjustmentData(
  points: readonly DailyTrainingAdjustmentPoint[] | null | undefined,
) {
  return (
    points?.some(
      (point) =>
        hasCompletedActivityWithoutLoad(point) ||
        positiveValue(point.effectiveCompletedLoad) ||
        positiveValue(point.plannedLoad ?? point.effectiveRemainingLoad) ||
        valueOrNull(point.fitnessCtl) !== null ||
        valueOrNull(point.scheduledFitnessCtl) !== null ||
        valueOrNull(point.actualFatigueAtl) !== null ||
        valueOrNull(point.scheduledFatigueAtl) !== null,
    ) === true
  );
}

function formatMetric(label: string, value: number | null | undefined, unit = "") {
  const finiteValue = valueOrNull(value);
  return finiteValue === null ? null : `${label} ${Math.round(finiteValue)}${unit}`;
}

export function buildDailyTrainingAdjustmentAccessibilityValue(
  point: DailyTrainingAdjustmentPoint | null,
) {
  if (!point) return "No date selected";
  const completedLoad = formatMetric("Completed Common Load", point.effectiveCompletedLoad);
  const plannedLoad = formatMetric(
    "Planned Common Load",
    point.plannedLoad ?? point.effectiveRemainingLoad,
  );
  const actualFitness = formatMetric("Actual fitness", point.fitnessCtl);
  const projectedFitness = formatMetric("Planned fitness projection", point.scheduledFitnessCtl);
  const actualFatigue = formatMetric("Actual fatigue", point.actualFatigueAtl);
  const projectedFatigue = formatMetric("Planned fatigue projection", point.scheduledFatigueAtl);
  const completedState = hasCompletedActivityWithoutLoad(point)
    ? "Completed activity, Common Load unavailable"
    : null;

  return [
    `Selected date ${point.date}`,
    completedLoad,
    completedState,
    plannedLoad,
    actualFitness,
    projectedFitness,
    actualFatigue,
    projectedFatigue,
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

export function buildDailyTrainingAdjustmentChartData(
  points: DailyTrainingAdjustmentPoint[],
  options: { todayDate?: string | null; bucketCenters?: readonly number[] } = {},
) {
  const { todayDate = null, bucketCenters } = options;
  return points.map((point, index) => {
    const planned = valueOrNull(point.plannedLoad ?? point.effectiveRemainingLoad);
    return {
      x: bucketCenters?.[index] ?? index,
      completedLoad: valueOrNull(point.effectiveCompletedLoad),
      plannedLoad: planned,
      actualFitness: !todayDate || point.date <= todayDate ? valueOrNull(point.fitnessCtl) : null,
      projectedFitness:
        !todayDate || point.date >= todayDate ? valueOrNull(point.scheduledFitnessCtl) : null,
      actualFatigue:
        !todayDate || point.date <= todayDate ? valueOrNull(point.actualFatigueAtl) : null,
      projectedFatigue:
        !todayDate || point.date >= todayDate ? valueOrNull(point.scheduledFatigueAtl) : null,
    } satisfies DailyTrainingAdjustmentChartDatum;
  });
}

export function buildDailyTrainingAdjustmentChartDomains(
  chartData: readonly DailyTrainingAdjustmentChartDatum[],
) {
  const loadValues = chartData
    .flatMap((point) => [point.completedLoad, point.plannedLoad])
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const fitnessValues = chartData
    .flatMap((point) => [
      point.actualFitness,
      point.projectedFitness,
      point.actualFatigue,
      point.projectedFatigue,
    ])
    .filter((value): value is number => value !== null && Number.isFinite(value));

  return {
    loadDomain: expandDomain(loadValues, [0, 100], 0.1),
    fitnessDomain: expandDomain(fitnessValues, [0, 100], 0.12),
  };
}

export function useDailyTrainingAdjustmentChartPresentation({
  formatDateLabel,
  points,
  range = "daily",
  todayDate,
  bucketCenters,
}: {
  formatDateLabel?: (dateKey: string, index: number) => string;
  points: DailyTrainingAdjustmentPoint[];
  range?: PlanTrainingChartRange;
  todayDate?: string | null;
  bucketCenters?: readonly number[];
}) {
  const chartData = useMemo(
    () =>
      buildDailyTrainingAdjustmentChartData(points, {
        bucketCenters,
        todayDate: todayDate ?? null,
      }),
    [bucketCenters, points, todayDate],
  );

  const { fitnessDomain, loadDomain } = useMemo(
    () => buildDailyTrainingAdjustmentChartDomains(chartData),
    [chartData],
  );
  const labels = useMemo(
    () =>
      points.map(
        (point, index) =>
          formatDateLabel?.(point.date, index) ?? formatPlanChartDateLabel(point.date, range),
      ),
    [formatDateLabel, points, range],
  );

  return {
    chartData,
    fitnessDomain,
    labels,
    loadDomain,
  };
}

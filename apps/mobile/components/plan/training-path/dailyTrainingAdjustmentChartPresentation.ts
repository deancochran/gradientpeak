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
  form: number | null;
};

export type DailyTrainingAdjustmentChartYKey =
  | "completedLoad"
  | "plannedLoad"
  | "actualFitness"
  | "projectedFitness"
  | "actualFatigue"
  | "projectedFatigue"
  | "form";

export const dailyTrainingAdjustmentChartYKeys: DailyTrainingAdjustmentChartYKey[] = [
  "completedLoad",
  "plannedLoad",
  "actualFitness",
  "projectedFitness",
  "actualFatigue",
  "projectedFatigue",
  "form",
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

export const dailyTrainingAdjustmentFormYKeys: DailyTrainingAdjustmentChartYKey[] = ["form"];

export function buildDailyTrainingAdjustmentCartesianContract(
  data: DailyTrainingAdjustmentChartDatum[],
) {
  return { data, xKey: "x" as const };
}

function valueOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getDailyTrainingAdjustmentPlannedLoad(
  point: Pick<DailyTrainingAdjustmentPoint, "effectiveRemainingLoad" | "plannedLoad">,
) {
  return point.plannedLoad === undefined
    ? valueOrNull(point.effectiveRemainingLoad)
    : valueOrNull(point.plannedLoad);
}

type PlannedLoadStatus = NonNullable<DailyTrainingAdjustmentPoint["plannedLoadStatus"]>;

function inferredLoadStatus(value: number | null): PlannedLoadStatus {
  if (value === null) return "unavailable";
  return value === 0 ? "known_zero" : "complete";
}

export function getDailyTrainingAdjustmentPlannedLoadStatus(
  point: Pick<
    DailyTrainingAdjustmentPoint,
    "effectiveRemainingLoad" | "effectiveRemainingLoadStatus" | "plannedLoad" | "plannedLoadStatus"
  >,
) {
  const value = getDailyTrainingAdjustmentPlannedLoad(point);
  return point.plannedLoad === undefined
    ? (point.effectiveRemainingLoadStatus ?? inferredLoadStatus(value))
    : (point.plannedLoadStatus ?? inferredLoadStatus(value));
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

type CompletedLoadStatus = NonNullable<
  DailyTrainingAdjustmentPoint["effectiveCompletedLoadStatus"]
>;

function aggregateCompletedLoad(points: readonly DailyTrainingAdjustmentPoint[]): {
  status: CompletedLoadStatus;
  value: number | null;
} {
  const entries = points.map((point) => {
    const value = valueOrNull(point.effectiveCompletedLoad);
    const status =
      point.effectiveCompletedLoadStatus ??
      (value === null ? "unavailable" : value === 0 ? "known_zero" : "complete");
    return { status, value };
  });
  const known = entries.filter(
    (entry): entry is { status: CompletedLoadStatus; value: number } => entry.value !== null,
  );
  if (known.length === 0) return { status: "unavailable", value: null };
  const value = known.reduce((total, entry) => total + entry.value, 0);
  if (
    known.length !== entries.length ||
    entries.some((entry) => entry.status === "partial" || entry.status === "unavailable")
  ) {
    return { status: "partial", value };
  }
  return {
    status: entries.every((entry) => entry.status === "known_zero") ? "known_zero" : "complete",
    value,
  };
}

function aggregatePlannedLoad(
  points: readonly DailyTrainingAdjustmentPoint[],
  selectValue: (point: DailyTrainingAdjustmentPoint) => number | null,
  selectStatus: (point: DailyTrainingAdjustmentPoint) => PlannedLoadStatus,
): { status: PlannedLoadStatus; value: number | null } {
  const entries = points.map((point) => ({
    value: selectValue(point),
    status: selectStatus(point),
  }));
  const known = entries.filter(
    (entry): entry is { status: PlannedLoadStatus; value: number } => entry.value !== null,
  );
  if (known.length === 0) return { status: "unavailable", value: null };
  const value = known.reduce((total, entry) => total + entry.value, 0);
  if (
    known.length !== entries.length ||
    entries.some((entry) => entry.status === "partial" || entry.status === "unavailable")
  ) {
    return { status: "partial", value };
  }
  return {
    status: entries.every((entry) => entry.status === "known_zero") ? "known_zero" : "complete",
    value,
  };
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

function hasCompleteBucketCoverage(
  dateKey: string,
  points: readonly DailyTrainingAdjustmentPoint[],
  range: Exclude<PlanTrainingChartRange, "daily">,
) {
  const start = parseDateKey(dateKey);
  if (!start) return false;
  const expectedDays =
    range === "weekly"
      ? 7
      : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  if (points.length !== expectedDays) return false;
  return points.every((point, index) => {
    const expected = new Date(start);
    expected.setUTCDate(expected.getUTCDate() + index);
    return point.date === toDateKey(expected);
  });
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
    const completed = aggregateCompletedLoad(bucket);
    const scheduled = aggregatePlannedLoad(
      bucket,
      getDailyTrainingAdjustmentPlannedLoad,
      getDailyTrainingAdjustmentPlannedLoadStatus,
    );
    const remaining = aggregatePlannedLoad(
      bucket,
      (point) => valueOrNull(point.effectiveRemainingLoad),
      (point) =>
        point.effectiveRemainingLoadStatus ??
        inferredLoadStatus(valueOrNull(point.effectiveRemainingLoad)),
    );
    const completeBucketCoverage = hasCompleteBucketCoverage(date, bucket, range);
    const completedStatus =
      !completeBucketCoverage && completed.value !== null && completed.status !== "unavailable"
        ? ("partial" as const)
        : completed.status;
    const completedLoad = completed.value;
    const plannedLoad = scheduled.value;
    const plannedLoadStatus =
      !completeBucketCoverage && scheduled.value !== null && scheduled.status !== "unavailable"
        ? ("partial" as const)
        : scheduled.status;
    const remainingLoadStatus =
      !completeBucketCoverage && remaining.value !== null && remaining.status !== "unavailable"
        ? ("partial" as const)
        : remaining.status;
    const hasLoad = completedLoad !== null || plannedLoad !== null;
    const allLoadComplete =
      completeBucketCoverage &&
      (completedStatus === "complete" || completedStatus === "known_zero") &&
      bucket.every(
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
      effectiveCompletedLoadStatus: completedStatus,
      effectiveCompletedLoad: completedLoad,
      effectiveRemainingLoadStatus: remainingLoadStatus,
      effectiveRemainingLoad: remaining.value,
      plannedLoad,
      plannedLoadStatus,
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
      formTsb: lastAvailable(bucket, (point) => point.formTsb),
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
        positiveValue(getDailyTrainingAdjustmentPlannedLoad(point)) ||
        valueOrNull(point.fitnessCtl) !== null ||
        valueOrNull(point.scheduledFitnessCtl) !== null ||
        valueOrNull(point.actualFatigueAtl) !== null ||
        valueOrNull(point.scheduledFatigueAtl) !== null ||
        valueOrNull(point.formTsb) !== null,
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
  const completedLoadValue = formatMetric("Completed Common Load", point.effectiveCompletedLoad);
  const completedLoad =
    point.effectiveCompletedLoadStatus === "unavailable"
      ? "Completed Common Load unavailable"
      : point.effectiveCompletedLoadStatus === "partial" && completedLoadValue
        ? `${completedLoadValue} incomplete`
        : completedLoadValue;
  const plannedLoadStatus = getDailyTrainingAdjustmentPlannedLoadStatus(point);
  const plannedLoad =
    plannedLoadStatus === "known_zero"
      ? "Planned Common Load 0, no planned load"
      : plannedLoadStatus === "unavailable"
        ? "Planned Common Load unavailable"
        : (() => {
            const value = formatMetric(
              "Planned Common Load",
              getDailyTrainingAdjustmentPlannedLoad(point),
            );
            if (!value) return "Planned Common Load unavailable";
            return plannedLoadStatus === "partial" ? `${value} incomplete` : value;
          })();
  const actualFitness = formatMetric("Actual fitness", point.fitnessCtl);
  const projectedFitness = formatMetric("Planned fitness projection", point.scheduledFitnessCtl);
  const actualFatigue = formatMetric("Actual fatigue", point.actualFatigueAtl);
  const projectedFatigue = formatMetric("Planned fatigue projection", point.scheduledFatigueAtl);
  const form = formatMetric("Form", point.formTsb);
  const completedState =
    hasCompletedActivityWithoutLoad(point) && point.effectiveCompletedLoadStatus !== "unavailable"
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
    form,
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

function expandFocusedDomain(
  values: number[],
  fallback: [number, number],
  paddingRatio = 0.12,
): [number, number] {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return fallback;
  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);
  const span = Math.max(10, maxValue - minValue);
  const lower = minValue - span * paddingRatio;
  const upper = maxValue + span * paddingRatio;
  return minValue >= 0 ? [Math.max(0, lower), upper] : [lower, Math.max(0, upper)];
}

export function buildDailyTrainingAdjustmentChartData(
  points: DailyTrainingAdjustmentPoint[],
  options: { todayDate?: string | null; bucketCenters?: readonly number[] } = {},
) {
  const { todayDate = null, bucketCenters } = options;
  return points.map((point, index) => {
    const planned = getDailyTrainingAdjustmentPlannedLoad(point);
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
      form: valueOrNull(point.formTsb),
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
  const formValues = chartData
    .map((point) => point.form)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const formExtent = Math.max(10, ...formValues.map((value) => Math.abs(value)));
  const paddedFormExtent = Math.ceil(formExtent * 1.1);

  return {
    loadDomain: expandDomain(loadValues, [0, 100], 0.1),
    fitnessDomain: expandFocusedDomain(fitnessValues, [0, 100]),
    formDomain: [-paddedFormExtent, paddedFormExtent] as [number, number],
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
        ...(bucketCenters !== undefined ? { bucketCenters } : {}),
        todayDate: todayDate ?? null,
      }),
    [bucketCenters, points, todayDate],
  );

  const { fitnessDomain, formDomain, loadDomain } = useMemo(
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
    formDomain,
    labels,
    loadDomain,
  };
}

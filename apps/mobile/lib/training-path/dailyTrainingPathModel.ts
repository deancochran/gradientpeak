import { addDaysDateKey } from "@repo/core/plan/trainingLoadTimeline";
import type {
  CommonLoadIdentity,
  CompletedObservationState,
} from "./completedCommonLoadObservation";

type DailyTrainingLoadAdjustment = {
  date: string;
  plannedLoad: number | null;
  tentativePlannedLoad: number | null;
  completedLoad: number | null;
  targetLoad: number | null;
  actualOrScheduledLoad: number | null;
  loadDelta: number | null;
  plannedDelta: number | null;
};

type DailyTrainingLoadAdjustmentInput = Partial<
  Omit<DailyTrainingLoadAdjustment, "actualOrScheduledLoad" | "date" | "loadDelta" | "plannedDelta">
> & {
  actualOrScheduledLoad?: number | null;
  date: string;
  remainingScheduledLoad?: number | null;
};

type WeeklyTrainingLoadAdjustment = {
  weekStartDate: string;
  weekEndDate: string;
  points: DailyTrainingLoadAdjustment[];
  plannedLoad: number | null;
  tentativePlannedLoad: number | null;
  completedLoad: number | null;
  targetLoad: number | null;
  actualOrScheduledLoad: number | null;
  loadDelta: number | null;
  plannedDelta: number | null;
};

function finiteNonnegativeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function deriveLoad(
  values: readonly (number | null)[],
  calculation: (...knownValues: number[]) => number,
): number | null {
  return values.some((value) => value === null)
    ? null
    : calculation(...values.filter((value): value is number => value !== null));
}

function normalizeDailyTrainingLoadAdjustments(input: {
  startDate: string;
  endDate: string;
  points?: DailyTrainingLoadAdjustmentInput[];
}): DailyTrainingLoadAdjustment[] {
  const pointsByDate = new Map((input.points ?? []).map((point) => [point.date, point]));
  const dates: string[] = [];
  let cursor = input.startDate;
  for (let guard = 0; cursor <= input.endDate && guard < 3700; guard += 1) {
    dates.push(cursor);
    cursor = addDaysDateKey(cursor, 1);
  }

  return dates.map((date) => {
    const raw = pointsByDate.get(date);
    const plannedLoad = finiteNonnegativeNumber(raw?.plannedLoad);
    const tentativePlannedLoad = finiteNonnegativeNumber(raw?.tentativePlannedLoad);
    const completedLoad = finiteNonnegativeNumber(raw?.completedLoad);
    const targetLoad = finiteNonnegativeNumber(raw?.targetLoad);
    const remainingScheduledLoad =
      raw?.remainingScheduledLoad === undefined
        ? deriveLoad(
            [plannedLoad, tentativePlannedLoad, completedLoad],
            (planned, tentative, completed) => Math.max(0, planned + tentative - completed),
          )
        : finiteNonnegativeNumber(raw.remainingScheduledLoad);
    const actualOrScheduledLoad =
      raw?.actualOrScheduledLoad === undefined
        ? deriveLoad(
            [completedLoad, remainingScheduledLoad],
            (completed, remaining) => completed + remaining,
          )
        : finiteNonnegativeNumber(raw.actualOrScheduledLoad);

    return {
      date,
      plannedLoad,
      tentativePlannedLoad,
      completedLoad,
      targetLoad,
      actualOrScheduledLoad,
      loadDelta: deriveLoad(
        [actualOrScheduledLoad, targetLoad],
        (actual, target) => actual - target,
      ),
      plannedDelta: deriveLoad(
        [plannedLoad, tentativePlannedLoad, targetLoad],
        (planned, tentative, target) => planned + tentative - target,
      ),
    };
  });
}

function aggregateDailyTrainingLoadAdjustmentsToWeeks(
  points: DailyTrainingLoadAdjustment[],
): WeeklyTrainingLoadAdjustment[] {
  const buckets: WeeklyTrainingLoadAdjustment[] = [];
  for (let index = 0; index < points.length; index += 7) {
    const weekPoints = points.slice(index, index + 7);
    const weekStartDate = weekPoints[0]?.date;
    const weekEndDate = weekPoints.at(-1)?.date;
    if (!weekStartDate || !weekEndDate) continue;

    const sum = (selector: (point: DailyTrainingLoadAdjustment) => number | null) =>
      deriveLoad(weekPoints.map(selector), (...values) =>
        values.reduce((total, value) => total + value, 0),
      );
    const plannedLoad = sum((point) => point.plannedLoad);
    const tentativePlannedLoad = sum((point) => point.tentativePlannedLoad);
    const targetLoad = sum((point) => point.targetLoad);
    const actualOrScheduledLoad = sum((point) => point.actualOrScheduledLoad);

    buckets.push({
      weekStartDate,
      weekEndDate,
      points: weekPoints,
      plannedLoad,
      tentativePlannedLoad,
      completedLoad: sum((point) => point.completedLoad),
      targetLoad,
      actualOrScheduledLoad,
      loadDelta: deriveLoad(
        [actualOrScheduledLoad, targetLoad],
        (actual, target) => actual - target,
      ),
      plannedDelta: deriveLoad(
        [plannedLoad, tentativePlannedLoad, targetLoad],
        (planned, tentative, target) => planned + tentative - target,
      ),
    });
  }
  return buckets;
}

export type DailyTrainingAdjustmentSeverity = "info" | "warning" | "risk";

export type DailyTrainingAdjustmentAnnotation = {
  code: string;
  severity: DailyTrainingAdjustmentSeverity;
  message?: string;
};

type DailyTrainingAdjustmentPresentation = {
  completedObservationState?: CompletedObservationState;
  completedCommonLoadIdentity?: CommonLoadIdentity | null;
  hasCompletedActivityWithoutLoad?: boolean;
  hasTargetLoad?: boolean;
  fitnessCtl?: number | null;
  targetFitnessCtl?: number | null;
  scheduledFitnessCtl?: number | null;
  fatigueAtl?: number | null;
  formTsb?: number | null;
  readinessScore?: number | null;
  annotations: DailyTrainingAdjustmentAnnotation[];
};

export type DailyTrainingAdjustmentPoint = DailyTrainingLoadAdjustment &
  DailyTrainingAdjustmentPresentation;

export type DailyTrainingAdjustmentPointInput = DailyTrainingLoadAdjustmentInput &
  Partial<Omit<DailyTrainingAdjustmentPresentation, "annotations">> & {
    annotations?: DailyTrainingAdjustmentAnnotation[];
  };

export type DailyTrainingAdjustmentSummary = {
  date: string;
  point: DailyTrainingAdjustmentPoint;
  loadDeltaLabel: string | null;
  plannedDeltaLabel: string | null;
  loadDeltaTone: "neutral" | "increase" | "reduce" | null;
};

export type WeeklyTrainingAdjustmentBucket = Omit<WeeklyTrainingLoadAdjustment, "points"> & {
  points: DailyTrainingAdjustmentPoint[];
};

export type TrainingPathDailyLoadInput = {
  date: string;
  completed_common_load?: number | null;
  scheduled_common_load?: number | null;
  tentative_scheduled_common_load?: number | null;
  recommended_common_load?: number | null;
};

export type TrainingPathDailyFitnessInput = {
  date: string;
  longTermLoad?: number | null;
  recentLoad?: number | null;
  loadBalance?: number | null;
};

function normalizeLoad(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function formatSignedLoad(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) return "On target";
  return `${rounded > 0 ? "+" : ""}${rounded} Load`;
}

function getDeltaTone(value: number): DailyTrainingAdjustmentSummary["loadDeltaTone"] {
  if (Math.abs(value) < 1) return "neutral";
  return value > 0 ? "increase" : "reduce";
}

export function normalizeDailyTrainingAdjustmentPoints(input: {
  startDate: string;
  endDate: string;
  points?: DailyTrainingAdjustmentPointInput[];
}): DailyTrainingAdjustmentPoint[] {
  const pointsByDate = new Map((input.points ?? []).map((point) => [point.date, point]));

  return normalizeDailyTrainingLoadAdjustments(input).map((point) => {
    const raw = pointsByDate.get(point.date);
    return {
      ...point,
      completedObservationState: raw?.completedObservationState,
      completedCommonLoadIdentity: raw?.completedCommonLoadIdentity ?? null,
      hasCompletedActivityWithoutLoad: raw?.hasCompletedActivityWithoutLoad === true,
      hasTargetLoad: raw?.hasTargetLoad !== false,
      fitnessCtl: raw?.fitnessCtl ?? null,
      targetFitnessCtl: raw?.targetFitnessCtl ?? null,
      scheduledFitnessCtl: raw?.scheduledFitnessCtl ?? null,
      fatigueAtl: raw?.fatigueAtl ?? null,
      formTsb: raw?.formTsb ?? null,
      readinessScore: raw?.readinessScore ?? null,
      annotations: raw?.annotations ?? [],
    };
  });
}

export function getDailyTrainingAdjustmentSummary(input: {
  points: DailyTrainingAdjustmentPoint[];
  selectedDate?: string | null;
}): DailyTrainingAdjustmentSummary | null {
  const point =
    input.points.find((candidate) => candidate.date === input.selectedDate) ?? input.points[0];
  if (!point) return null;

  return {
    date: point.date,
    point,
    loadDeltaLabel:
      point.hasTargetLoad === false || point.loadDelta === null
        ? null
        : formatSignedLoad(point.loadDelta),
    plannedDeltaLabel:
      point.hasTargetLoad === false || point.plannedDelta === null
        ? null
        : formatSignedLoad(point.plannedDelta),
    loadDeltaTone:
      point.hasTargetLoad === false || point.loadDelta === null
        ? null
        : getDeltaTone(point.loadDelta),
  };
}

export function aggregateDailyTrainingAdjustmentsToWeeks(
  points: DailyTrainingAdjustmentPoint[],
): WeeklyTrainingAdjustmentBucket[] {
  const pointsByDate = new Map(points.map((point) => [point.date, point]));
  return aggregateDailyTrainingLoadAdjustmentsToWeeks(points).map((bucket) => ({
    ...bucket,
    points: bucket.points.map(
      (point) =>
        pointsByDate.get(point.date) ?? {
          ...point,
          annotations: [],
        },
    ),
  }));
}

export function buildDailyTrainingAdjustmentPointsFromTrainingPathData(input: {
  timeline?: TrainingPathDailyLoadInput[] | null;
  fitnessHistory?: TrainingPathDailyFitnessInput[] | null;
  idealFitnessCurve?: TrainingPathDailyFitnessInput[] | null;
  scheduledFitnessTrend?: TrainingPathDailyFitnessInput[] | null;
  startDate?: string | null;
  endDate?: string | null;
}): DailyTrainingAdjustmentPoint[] {
  const dates = new Set<string>();
  for (const point of input.timeline ?? []) dates.add(point.date);
  for (const point of input.fitnessHistory ?? []) dates.add(point.date);
  for (const point of input.idealFitnessCurve ?? []) dates.add(point.date);
  for (const point of input.scheduledFitnessTrend ?? []) dates.add(point.date);
  if (input.startDate) dates.add(input.startDate);
  if (input.endDate) dates.add(input.endDate);

  const sortedDates = [...dates].filter(Boolean).sort((left, right) => left.localeCompare(right));
  const startDate = input.startDate ?? sortedDates[0];
  const endDate = input.endDate ?? sortedDates[sortedDates.length - 1];
  if (!startDate || !endDate) return [];

  const timelineByDate = new Map((input.timeline ?? []).map((point) => [point.date, point]));
  const fitnessByDate = new Map((input.fitnessHistory ?? []).map((point) => [point.date, point]));
  const targetFitnessByDate = new Map(
    (input.idealFitnessCurve ?? []).map((point) => [point.date, point]),
  );
  const scheduledFitnessByDate = new Map(
    (input.scheduledFitnessTrend ?? []).map((point) => [point.date, point]),
  );

  return normalizeDailyTrainingAdjustmentPoints({
    startDate,
    endDate,
    points: sortedDates.map((date) => {
      const load = timelineByDate.get(date);
      const fitness = fitnessByDate.get(date);
      const targetFitness = targetFitnessByDate.get(date);
      const scheduledFitness = scheduledFitnessByDate.get(date);
      const plannedLoad = normalizeLoad(load?.scheduled_common_load);
      const tentativePlannedLoad = normalizeLoad(load?.tentative_scheduled_common_load);
      const completedLoad = normalizeLoad(load?.completed_common_load);
      const targetLoad = normalizeLoad(load?.recommended_common_load);

      return {
        date,
        plannedLoad,
        tentativePlannedLoad,
        completedLoad,
        targetLoad,
        fitnessCtl: fitness?.longTermLoad ?? null,
        targetFitnessCtl: targetFitness?.longTermLoad ?? null,
        scheduledFitnessCtl: scheduledFitness?.longTermLoad ?? null,
        fatigueAtl: scheduledFitness?.recentLoad ?? fitness?.recentLoad ?? null,
        formTsb: scheduledFitness?.loadBalance ?? fitness?.loadBalance ?? null,
      };
    }),
  });
}

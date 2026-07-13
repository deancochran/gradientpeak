import {
  aggregateDailyTrainingLoadAdjustmentsToWeeks,
  type DailyTrainingLoadAdjustment,
  type DailyTrainingLoadAdjustmentInput,
  normalizeDailyTrainingLoadAdjustments,
  type WeeklyTrainingLoadAdjustment,
} from "@repo/core/training-timeline";

export type DailyTrainingAdjustmentSeverity = "info" | "warning" | "risk";

export type DailyTrainingAdjustmentAnnotation = {
  code: string;
  severity: DailyTrainingAdjustmentSeverity;
  message?: string;
};

type DailyTrainingAdjustmentPresentation = {
  hasCompletedActivityWithoutLoad?: boolean;
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
  loadDeltaLabel: string;
  plannedDeltaLabel: string;
  loadDeltaTone: "neutral" | "increase" | "reduce";
};

export type WeeklyTrainingAdjustmentBucket = Omit<WeeklyTrainingLoadAdjustment, "points"> & {
  points: DailyTrainingAdjustmentPoint[];
};

export type TrainingPathDailyLoadInput = {
  date: string;
  completed_load_tss?: number | null;
  scheduled_load_tss?: number | null;
  tentative_scheduled_load_tss?: number | null;
  recommended_load_tss?: number | null;
  ideal_tss?: number | null;
  actual_tss?: number | null;
  scheduled_tss?: number | null;
};

export type TrainingPathDailyFitnessInput = {
  date: string;
  ctl?: number | null;
  atl?: number | null;
  tsb?: number | null;
};

function normalizeNumber(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatSignedTss(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) return "On target";
  return `${rounded > 0 ? "+" : ""}${rounded} TSS`;
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
      hasCompletedActivityWithoutLoad: raw?.hasCompletedActivityWithoutLoad === true,
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
    loadDeltaLabel: formatSignedTss(point.loadDeltaTss),
    plannedDeltaLabel: formatSignedTss(point.plannedDeltaTss),
    loadDeltaTone: getDeltaTone(point.loadDeltaTss),
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
      const plannedLoadTss = normalizeNumber(load?.scheduled_load_tss ?? load?.scheduled_tss);
      const tentativePlannedLoadTss = normalizeNumber(load?.tentative_scheduled_load_tss);
      const completedLoadTss = normalizeNumber(load?.completed_load_tss ?? load?.actual_tss);
      const targetLoadTss = normalizeNumber(load?.recommended_load_tss ?? load?.ideal_tss);

      return {
        date,
        plannedLoadTss,
        tentativePlannedLoadTss,
        completedLoadTss,
        targetLoadTss,
        fitnessCtl: fitness?.ctl ?? null,
        targetFitnessCtl: targetFitness?.ctl ?? null,
        scheduledFitnessCtl: scheduledFitness?.ctl ?? null,
        fatigueAtl: scheduledFitness?.atl ?? fitness?.atl ?? null,
        formTsb: scheduledFitness?.tsb ?? fitness?.tsb ?? null,
      };
    }),
  });
}

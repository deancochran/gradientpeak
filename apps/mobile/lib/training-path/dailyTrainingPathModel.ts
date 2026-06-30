const DAY_MS = 86_400_000;

export type DailyTrainingAdjustmentSeverity = "info" | "warning" | "risk";

export type DailyTrainingAdjustmentAnnotation = {
  code: string;
  severity: DailyTrainingAdjustmentSeverity;
  message?: string;
};

export type DailyTrainingAdjustmentPoint = {
  date: string;
  plannedLoadTss: number;
  tentativePlannedLoadTss: number;
  completedLoadTss: number;
  targetLoadTss: number;
  actualOrScheduledLoadTss: number;
  loadDeltaTss: number;
  plannedDeltaTss: number;
  fitnessCtl?: number | null;
  targetFitnessCtl?: number | null;
  scheduledFitnessCtl?: number | null;
  fatigueAtl?: number | null;
  formTsb?: number | null;
  readinessScore?: number | null;
  annotations: DailyTrainingAdjustmentAnnotation[];
};

export type DailyTrainingAdjustmentPointInput = Partial<
  Omit<
    DailyTrainingAdjustmentPoint,
    "actualOrScheduledLoadTss" | "annotations" | "date" | "loadDeltaTss" | "plannedDeltaTss"
  >
> & {
  actualOrScheduledLoadTss?: number | null;
  annotations?: DailyTrainingAdjustmentAnnotation[];
  date: string;
};

export type DailyTrainingAdjustmentSummary = {
  date: string;
  point: DailyTrainingAdjustmentPoint;
  loadDeltaLabel: string;
  plannedDeltaLabel: string;
  loadDeltaTone: "neutral" | "increase" | "reduce";
};

export type WeeklyTrainingAdjustmentBucket = {
  weekStartDate: string;
  weekEndDate: string;
  points: DailyTrainingAdjustmentPoint[];
  plannedLoadTss: number;
  completedLoadTss: number;
  targetLoadTss: number;
  actualOrScheduledLoadTss: number;
  loadDeltaTss: number;
  plannedDeltaTss: number;
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

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function diffDays(startDate: string, endDate: string) {
  return Math.round((parseDateKey(endDate).getTime() - parseDateKey(startDate).getTime()) / DAY_MS);
}

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
  const dayCount = diffDays(input.startDate, input.endDate) + 1;
  if (dayCount <= 0) return [];

  const pointsByDate = new Map((input.points ?? []).map((point) => [point.date, point]));

  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(input.startDate, index);
    const raw = pointsByDate.get(date);
    const plannedLoadTss = normalizeNumber(raw?.plannedLoadTss);
    const tentativePlannedLoadTss = normalizeNumber(raw?.tentativePlannedLoadTss);
    const completedLoadTss = normalizeNumber(raw?.completedLoadTss);
    const targetLoadTss = normalizeNumber(raw?.targetLoadTss);
    const actualOrScheduledLoadTss = normalizeNumber(
      raw?.actualOrScheduledLoadTss,
      completedLoadTss + plannedLoadTss,
    );

    return {
      date,
      plannedLoadTss,
      tentativePlannedLoadTss,
      completedLoadTss,
      targetLoadTss,
      actualOrScheduledLoadTss,
      loadDeltaTss: actualOrScheduledLoadTss - targetLoadTss,
      plannedDeltaTss: plannedLoadTss + tentativePlannedLoadTss - targetLoadTss,
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
  const buckets: WeeklyTrainingAdjustmentBucket[] = [];
  for (let index = 0; index < points.length; index += 7) {
    const weekPoints = points.slice(index, index + 7);
    const weekStartDate = weekPoints[0]?.date;
    const weekEndDate = weekPoints[weekPoints.length - 1]?.date;
    if (!weekStartDate || !weekEndDate) continue;

    const sum = (selector: (point: DailyTrainingAdjustmentPoint) => number) =>
      weekPoints.reduce((total, point) => total + selector(point), 0);
    const plannedLoadTss = sum((point) => point.plannedLoadTss);
    const tentativePlannedLoadTss = sum((point) => point.tentativePlannedLoadTss);
    const targetLoadTss = sum((point) => point.targetLoadTss);
    const actualOrScheduledLoadTss = sum((point) => point.actualOrScheduledLoadTss);

    buckets.push({
      weekStartDate,
      weekEndDate,
      points: weekPoints,
      plannedLoadTss,
      completedLoadTss: sum((point) => point.completedLoadTss),
      targetLoadTss,
      actualOrScheduledLoadTss,
      loadDeltaTss: actualOrScheduledLoadTss - targetLoadTss,
      plannedDeltaTss: plannedLoadTss + tentativePlannedLoadTss - targetLoadTss,
    });
  }
  return buckets;
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
        actualOrScheduledLoadTss: completedLoadTss + plannedLoadTss + tentativePlannedLoadTss,
        fitnessCtl: fitness?.ctl ?? null,
        targetFitnessCtl: targetFitness?.ctl ?? null,
        scheduledFitnessCtl: scheduledFitness?.ctl ?? null,
        fatigueAtl: scheduledFitness?.atl ?? fitness?.atl ?? null,
        formTsb: scheduledFitness?.tsb ?? fitness?.tsb ?? null,
      };
    }),
  });
}

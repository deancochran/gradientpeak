import {
  addDaysDateKey,
  getWeekStartDateKey,
  normalizeTrainingLoadTimelinePoint,
  type TrainingLoadTimelinePoint,
} from "../plan/trainingLoadTimeline";
import {
  type CompletedTrainingItem,
  completedTrainingItemSchema,
  type ScheduledTrainingItem,
  scheduledTrainingItemSchema,
  type TrainingDaySummary,
  type TrainingLoadComparison,
  type TrainingTimelineAnnotation,
  type TrainingTimelineConfidence,
  type TrainingTimelineWindow,
  type TrainingWeekSummary,
  trainingDaySummarySchema,
  trainingLoadComparisonSchema,
  trainingTimelineWindowSchema,
  trainingWeekSummarySchema,
} from "./schemas";

type TrainingTimelineLoadPoint = Partial<TrainingLoadTimelinePoint> & { date: string };

type TrainingTimelineDayMetadata = {
  annotations?: TrainingTimelineAnnotation[];
  confidence?: TrainingTimelineConfidence | null;
};

export type BuildTrainingTimelineWindowInput = {
  today: string;
  startDate: string;
  endDate: string;
  loadPoints?: TrainingTimelineLoadPoint[];
  scheduledItems?: ScheduledTrainingItem[];
  completedItems?: CompletedTrainingItem[];
  dayMetadata?: Record<string, TrainingTimelineDayMetadata>;
};

function roundLoad(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function roundSignedLoad(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function sumKnownItemLoads(values: readonly (number | null | undefined)[]): number | null {
  if (values.length === 0) return 0;
  if (values.some((value) => value == null)) return null;
  const knownValues = values.filter((value): value is number => typeof value === "number");
  return roundLoad(knownValues.reduce((sum, value) => sum + value, 0));
}

function sumAvailableLoads(values: readonly (number | null)[]): number | null {
  if (values.some((value) => value === null)) return null;
  const knownValues = values.filter((value): value is number => value !== null);
  return roundLoad(knownValues.reduce((sum, value) => sum + value, 0));
}

function deriveExpectedLoad(input: {
  plannedLoad: number | null;
  scheduledLoad: number | null;
}): number | null {
  return input.scheduledLoad;
}

function hasExplicitLoad(point: TrainingTimelineLoadPoint | undefined, key: string): boolean {
  return (
    point !== undefined &&
    Object.hasOwn(point, key) &&
    point[key as keyof typeof point] !== undefined
  );
}

function dateKeyRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = startDate;
  for (let guard = 0; cursor <= endDate && guard < 3700; guard += 1) {
    dates.push(cursor);
    cursor = addDaysDateKey(cursor, 1);
  }
  return dates;
}

function bucketByDate<Item extends { date: string }>(items: Item[]) {
  const buckets = new Map<string, Item[]>();
  for (const item of items) {
    const bucket = buckets.get(item.date) ?? [];
    bucket.push(item);
    buckets.set(item.date, bucket);
  }
  return buckets;
}

export function compareTrainingLoad(input: {
  plannedLoad?: number | null;
  scheduledLoad?: number | null;
  completedLoad?: number | null;
  recommendedLoad?: number | null;
}): TrainingLoadComparison {
  const recommendedLoad = roundLoad(input.recommendedLoad);
  const plannedLoad = roundLoad(
    input.plannedLoad === undefined ? input.recommendedLoad : input.plannedLoad,
  );
  const scheduledLoad = roundLoad(input.scheduledLoad);
  const completedLoad = roundLoad(input.completedLoad);
  const expectedLoad = deriveExpectedLoad({ plannedLoad, scheduledLoad });
  return trainingLoadComparisonSchema.parse({
    plannedLoad,
    scheduledLoad,
    completedLoad,
    remainingLoad:
      expectedLoad === null || completedLoad === null
        ? null
        : roundLoad(Math.max(0, expectedLoad - completedLoad)),
    recommendedLoad,
    deltaLoad:
      expectedLoad === null || completedLoad === null
        ? null
        : roundSignedLoad(completedLoad - expectedLoad),
  });
}

export function buildTrainingDaySummary(input: {
  date: string;
  loadPoint?: TrainingTimelineLoadPoint;
  scheduledItems?: ScheduledTrainingItem[];
  completedItems?: CompletedTrainingItem[];
  annotations?: TrainingTimelineAnnotation[];
  confidence?: TrainingTimelineConfidence | null;
}): TrainingDaySummary {
  const normalizedLoad = input.loadPoint
    ? normalizeTrainingLoadTimelinePoint(input.loadPoint)
    : normalizeTrainingLoadTimelinePoint({ date: input.date });
  const scheduledItems = (input.scheduledItems ?? []).map((item) =>
    scheduledTrainingItemSchema.parse(item),
  );
  const completedItems = (input.completedItems ?? []).map((item) =>
    completedTrainingItemSchema.parse(item),
  );
  const scheduledItemLoad = sumKnownItemLoads(scheduledItems.map((item) => item.plannedLoad));
  const completedItemLoad = sumKnownItemLoads(completedItems.map((item) => item.completedLoad));
  return trainingDaySummarySchema.parse({
    date: input.date,
    load: compareTrainingLoad({
      plannedLoad: normalizedLoad.recommended_common_load,
      scheduledLoad: hasExplicitLoad(input.loadPoint, "scheduled_common_load")
        ? normalizedLoad.scheduled_common_load
        : scheduledItemLoad,
      completedLoad: hasExplicitLoad(input.loadPoint, "completed_common_load")
        ? normalizedLoad.completed_common_load
        : completedItemLoad,
      recommendedLoad: normalizedLoad.recommended_common_load,
    }),
    scheduledItems,
    completedItems,
    annotations: input.annotations ?? [],
    confidence: input.confidence ?? null,
  });
}

export function buildTrainingWeekSummaries(days: TrainingDaySummary[]): TrainingWeekSummary[] {
  const buckets = new Map<string, TrainingDaySummary[]>();
  for (const day of days) {
    const weekStart = getWeekStartDateKey(day.date);
    const bucket = buckets.get(weekStart) ?? [];
    bucket.push(day);
    buckets.set(weekStart, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, weekDays]) =>
      trainingWeekSummarySchema.parse({
        weekStart,
        weekEnd: addDaysDateKey(weekStart, 6),
        dayCount: weekDays.length,
        trainingDayCount: weekDays.filter(
          (day) =>
            (day.load.plannedLoad !== null && day.load.plannedLoad > 0) ||
            (day.load.scheduledLoad !== null && day.load.scheduledLoad > 0) ||
            (day.load.completedLoad !== null && day.load.completedLoad > 0),
        ).length,
        load: compareTrainingLoad({
          plannedLoad: sumAvailableLoads(weekDays.map((day) => day.load.plannedLoad)),
          scheduledLoad: sumAvailableLoads(weekDays.map((day) => day.load.scheduledLoad)),
          completedLoad: sumAvailableLoads(weekDays.map((day) => day.load.completedLoad)),
          recommendedLoad: sumAvailableLoads(weekDays.map((day) => day.load.recommendedLoad)),
        }),
      }),
    );
}

export function buildTrainingTimelineWindow(
  input: BuildTrainingTimelineWindowInput,
): TrainingTimelineWindow {
  const loadByDate = new Map((input.loadPoints ?? []).map((point) => [point.date, point]));
  const scheduledByDate = bucketByDate(input.scheduledItems ?? []);
  const completedByDate = bucketByDate(input.completedItems ?? []);
  const days = dateKeyRange(input.startDate, input.endDate).map((date) =>
    buildTrainingDaySummary({
      date,
      loadPoint: loadByDate.get(date),
      scheduledItems: scheduledByDate.get(date),
      completedItems: completedByDate.get(date),
      annotations: input.dayMetadata?.[date]?.annotations,
      confidence: input.dayMetadata?.[date]?.confidence,
    }),
  );
  return trainingTimelineWindowSchema.parse({
    startDate: input.startDate,
    endDate: input.endDate,
    today: input.today,
    days,
    weeks: buildTrainingWeekSummaries(days),
  });
}

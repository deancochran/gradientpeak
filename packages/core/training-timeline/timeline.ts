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

/**
 * Compatibility input for the legacy TSS planning timeline. Its *_tss fields
 * are not a Common Load transport; Common Load stays in effective-composition.
 */
type TrainingTimelineLoadPoint = Partial<TrainingLoadTimelinePoint> & {
  date: string;
  ideal_tss?: number | null;
  scheduled_tss?: number | null;
  actual_tss?: number | null;
};

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

function roundTss(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.round(Math.max(0, value ?? 0) * 10) / 10 : 0;
}

function roundSignedTss(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.round((value ?? 0) * 10) / 10 : 0;
}

function sumTss(values: Array<number | null | undefined>) {
  return roundTss(values.reduce<number>((sum, value) => sum + roundTss(value), 0));
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
  plannedTss?: number | null;
  scheduledTss?: number | null;
  tentativeScheduledTss?: number | null;
  completedTss?: number | null;
  recommendedTss?: number | null;
}): TrainingLoadComparison {
  const plannedTss = roundTss(input.plannedTss ?? input.recommendedTss);
  const scheduledTss = roundTss(input.scheduledTss);
  const tentativeScheduledTss = roundTss(input.tentativeScheduledTss);
  const completedTss = roundTss(input.completedTss);
  const recommendedTss = input.recommendedTss == null ? null : roundTss(input.recommendedTss);
  const expectedTss = scheduledTss + tentativeScheduledTss || plannedTss;
  return trainingLoadComparisonSchema.parse({
    plannedTss,
    scheduledTss,
    tentativeScheduledTss,
    completedTss,
    remainingTss: roundTss(Math.max(0, expectedTss - completedTss)),
    recommendedTss,
    deltaTss: roundSignedTss(completedTss - expectedTss),
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
  const scheduledItemLoad = sumTss(scheduledItems.map((item) => item.plannedLoadTss));
  const completedItemLoad = sumTss(completedItems.map((item) => item.completedLoadTss));
  return trainingDaySummarySchema.parse({
    date: input.date,
    load: compareTrainingLoad({
      plannedTss: normalizedLoad.recommended_load_tss,
      scheduledTss: normalizedLoad.scheduled_load_tss || scheduledItemLoad,
      tentativeScheduledTss: normalizedLoad.tentative_scheduled_load_tss,
      completedTss: normalizedLoad.completed_load_tss || completedItemLoad,
      recommendedTss: normalizedLoad.recommended_load_tss,
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
            day.load.plannedTss > 0 || day.load.scheduledTss > 0 || day.load.completedTss > 0,
        ).length,
        load: compareTrainingLoad({
          plannedTss: sumTss(weekDays.map((day) => day.load.plannedTss)),
          scheduledTss: sumTss(weekDays.map((day) => day.load.scheduledTss)),
          tentativeScheduledTss: sumTss(weekDays.map((day) => day.load.tentativeScheduledTss)),
          completedTss: sumTss(weekDays.map((day) => day.load.completedTss)),
          recommendedTss: sumTss(weekDays.map((day) => day.load.recommendedTss)),
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

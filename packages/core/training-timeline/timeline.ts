import {
  addDaysDateKey,
  getWeekStartDateKey,
  normalizeTrainingLoadTimelinePoint,
  type TrainingLoadTimelineInputPoint,
  type TrainingLoadValueStatus,
} from "../plan/trainingLoadTimeline";
import {
  type CompletedTrainingItem,
  completedTrainingItemSchema,
  type ParsedCompletedTrainingItem,
  type ParsedScheduledTrainingItem,
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

type TrainingTimelineLoadPoint = TrainingLoadTimelineInputPoint;

type TrainingTimelineDayMetadata = {
  annotations?: TrainingTimelineAnnotation[];
  confidence?: TrainingTimelineConfidence | null;
};

type TrainingTimelineSourceStatus = "complete" | "partial" | "unavailable";

export type BuildTrainingTimelineWindowInput = {
  today: string;
  startDate: string;
  endDate: string;
  loadPoints?: TrainingTimelineLoadPoint[];
  scheduledItems?: ScheduledTrainingItem[];
  scheduledSourceStatus?: TrainingTimelineSourceStatus;
  completedItems?: CompletedTrainingItem[];
  completedSourceStatus?: TrainingTimelineSourceStatus;
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

function hasExplicitLoad(point: TrainingTimelineLoadPoint | undefined, key: string): boolean {
  return (
    point !== undefined &&
    ((Object.hasOwn(point, key) && point[key as keyof typeof point] !== undefined) ||
      Object.hasOwn(point, `${key}_status`))
  );
}

type StatusAwareLoad = { load: number | null; status: TrainingLoadValueStatus };

function normalizeStatusAwareLoad(
  load: number | null | undefined,
  status?: TrainingLoadValueStatus,
): StatusAwareLoad {
  const rounded = roundLoad(load);
  if (status !== undefined) return { load: rounded, status };
  if (rounded === null) return { load: null, status: "unavailable" };
  return { load: rounded, status: rounded === 0 ? "known_zero" : "complete" };
}

function aggregateStatusAwareLoads(
  values: readonly StatusAwareLoad[],
  emptyStatus: "known_zero" | "unavailable",
): StatusAwareLoad {
  if (values.length === 0) {
    return emptyStatus === "known_zero"
      ? { load: 0, status: "known_zero" }
      : { load: null, status: "unavailable" };
  }
  const known = values.filter(
    (value): value is { load: number; status: TrainingLoadValueStatus } => value.load !== null,
  );
  if (known.length === 0) return { load: null, status: "unavailable" };
  const load = roundLoad(known.reduce((sum, value) => sum + value.load, 0));
  if (load === null) return { load: null, status: "unavailable" };
  if (
    known.length !== values.length ||
    values.some((value) => value.status === "partial" || value.status === "unavailable")
  ) {
    return { load, status: "partial" };
  }
  if (values.every((value) => value.status === "known_zero")) {
    return { load: 0, status: "known_zero" };
  }
  return { load, status: "complete" };
}

function scheduledItemLoad(
  items: readonly ParsedScheduledTrainingItem[],
  sourceStatus: TrainingTimelineSourceStatus,
): StatusAwareLoad {
  const aggregate = aggregateStatusAwareLoads(
    items.map((item) => ({ load: item.plannedLoad, status: item.plannedLoadStatus })),
    sourceStatus === "complete" ? "known_zero" : "unavailable",
  );
  if (sourceStatus === "complete" || aggregate.status === "unavailable") return aggregate;
  return { ...aggregate, status: "partial" };
}

function completedItemLoad(
  items: readonly ParsedCompletedTrainingItem[],
  sourceStatus: TrainingTimelineSourceStatus,
): StatusAwareLoad {
  const aggregate = aggregateStatusAwareLoads(
    items.map((item) => ({ load: item.completedLoad, status: item.completedLoadStatus })),
    sourceStatus === "complete" ? "known_zero" : "unavailable",
  );
  if (sourceStatus === "complete" || aggregate.status === "unavailable") return aggregate;
  return { ...aggregate, status: "partial" };
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
  plannedLoadStatus?: TrainingLoadValueStatus;
  scheduledLoad?: number | null;
  scheduledLoadStatus?: TrainingLoadValueStatus;
  completedLoad?: number | null;
  completedLoadStatus?: TrainingLoadValueStatus;
  recommendedLoad?: number | null;
  recommendedLoadStatus?: TrainingLoadValueStatus;
}): TrainingLoadComparison {
  const recommended = normalizeStatusAwareLoad(input.recommendedLoad, input.recommendedLoadStatus);
  const planned = normalizeStatusAwareLoad(
    input.plannedLoad === undefined ? recommended.load : input.plannedLoad,
    input.plannedLoadStatus ?? (input.plannedLoad === undefined ? recommended.status : undefined),
  );
  const scheduled = normalizeStatusAwareLoad(input.scheduledLoad, input.scheduledLoadStatus);
  const completed = normalizeStatusAwareLoad(input.completedLoad, input.completedLoadStatus);
  const remaining =
    scheduled.status === "known_zero"
      ? ({ load: 0, status: "known_zero" } as const)
      : scheduled.load === null || completed.load === null
        ? ({ load: null, status: "unavailable" } as const)
        : {
            load: roundLoad(Math.max(0, scheduled.load - completed.load)),
            status:
              scheduled.status === "partial" || completed.status === "partial"
                ? ("partial" as const)
                : scheduled.load - completed.load <= 0
                  ? ("known_zero" as const)
                  : ("complete" as const),
          };
  return trainingLoadComparisonSchema.parse({
    plannedLoad: planned.load,
    plannedLoadStatus: planned.status,
    scheduledLoad: scheduled.load,
    scheduledLoadStatus: scheduled.status,
    completedLoad: completed.load,
    completedLoadStatus: completed.status,
    remainingLoad: remaining.load,
    remainingLoadStatus: remaining.status,
    recommendedLoad: recommended.load,
    recommendedLoadStatus: recommended.status,
    deltaLoad:
      scheduled.load === null || completed.load === null
        ? null
        : roundSignedLoad(completed.load - scheduled.load),
  });
}

export function buildTrainingDaySummary(input: {
  date: string;
  loadPoint?: TrainingTimelineLoadPoint;
  scheduledItems?: ScheduledTrainingItem[];
  scheduledSourceStatus?: TrainingTimelineSourceStatus;
  completedItems?: CompletedTrainingItem[];
  completedSourceStatus?: TrainingTimelineSourceStatus;
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
  const scheduledFallback = scheduledItemLoad(
    scheduledItems,
    input.scheduledSourceStatus ??
      (input.scheduledItems === undefined ? "unavailable" : "complete"),
  );
  const completedFallback = completedItemLoad(
    completedItems,
    input.completedSourceStatus ??
      (input.completedItems === undefined ? "unavailable" : "complete"),
  );
  return trainingDaySummarySchema.parse({
    date: input.date,
    load: compareTrainingLoad({
      plannedLoad: normalizedLoad.recommended_common_load,
      plannedLoadStatus: normalizedLoad.recommended_common_load_status,
      scheduledLoad: hasExplicitLoad(input.loadPoint, "scheduled_common_load")
        ? normalizedLoad.scheduled_common_load
        : scheduledFallback.load,
      scheduledLoadStatus: hasExplicitLoad(input.loadPoint, "scheduled_common_load")
        ? normalizedLoad.scheduled_common_load_status
        : scheduledFallback.status,
      completedLoad: hasExplicitLoad(input.loadPoint, "completed_common_load")
        ? normalizedLoad.completed_common_load
        : completedFallback.load,
      completedLoadStatus: hasExplicitLoad(input.loadPoint, "completed_common_load")
        ? normalizedLoad.completed_common_load_status
        : completedFallback.status,
      recommendedLoad: normalizedLoad.recommended_common_load,
      recommendedLoadStatus: normalizedLoad.recommended_common_load_status,
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
        load: (() => {
          const planned = aggregateStatusAwareLoads(
            weekDays.map((day) => ({
              load: day.load.plannedLoad,
              status: day.load.plannedLoadStatus,
            })),
            "unavailable",
          );
          const scheduled = aggregateStatusAwareLoads(
            weekDays.map((day) => ({
              load: day.load.scheduledLoad,
              status: day.load.scheduledLoadStatus,
            })),
            "unavailable",
          );
          const completed = aggregateStatusAwareLoads(
            weekDays.map((day) => ({
              load: day.load.completedLoad,
              status: day.load.completedLoadStatus,
            })),
            "unavailable",
          );
          const recommended = aggregateStatusAwareLoads(
            weekDays.map((day) => ({
              load: day.load.recommendedLoad,
              status: day.load.recommendedLoadStatus,
            })),
            "unavailable",
          );
          return compareTrainingLoad({
            plannedLoad: planned.load,
            plannedLoadStatus: planned.status,
            scheduledLoad: scheduled.load,
            scheduledLoadStatus: scheduled.status,
            completedLoad: completed.load,
            completedLoadStatus: completed.status,
            recommendedLoad: recommended.load,
            recommendedLoadStatus: recommended.status,
          });
        })(),
      }),
    );
}

export function buildTrainingTimelineWindow(
  input: BuildTrainingTimelineWindowInput,
): TrainingTimelineWindow {
  const loadByDate = new Map((input.loadPoints ?? []).map((point) => [point.date, point]));
  const scheduledByDate = bucketByDate(input.scheduledItems ?? []);
  const completedByDate = bucketByDate(input.completedItems ?? []);
  const scheduledSourceStatus =
    input.scheduledSourceStatus ??
    (input.scheduledItems === undefined ? "unavailable" : "complete");
  const completedSourceStatus =
    input.completedSourceStatus ??
    (input.completedItems === undefined ? "unavailable" : "complete");
  const days = dateKeyRange(input.startDate, input.endDate).map((date) => {
    const metadata = input.dayMetadata?.[date];
    const loadPoint = loadByDate.get(date);
    const scheduledItems = scheduledByDate.get(date);
    const completedItems = completedByDate.get(date);
    return buildTrainingDaySummary({
      date,
      ...(loadPoint === undefined ? {} : { loadPoint }),
      ...(scheduledItems === undefined ? {} : { scheduledItems }),
      scheduledSourceStatus,
      ...(completedItems === undefined ? {} : { completedItems }),
      completedSourceStatus,
      ...(metadata?.annotations === undefined ? {} : { annotations: metadata.annotations }),
      ...(metadata?.confidence === undefined ? {} : { confidence: metadata.confidence }),
    });
  });
  return trainingTimelineWindowSchema.parse({
    startDate: input.startDate,
    endDate: input.endDate,
    today: input.today,
    days,
    weeks: buildTrainingWeekSummaries(days),
  });
}

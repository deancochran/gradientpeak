import { buildDailyTssByDateSeries, replayTrainingLoadByDate } from "@repo/core";
import type {
  TrainingPathEmptyState,
  TrainingPathFitnessPoint,
  TrainingPathGoalMarker,
  TrainingPathLoadPoint,
  TrainingPathRange,
  TrainingPathRiskZone,
  TrainingPathSourceGoalMarker,
  TrainingPathViewModel,
  TrainingPathWeek,
  TrainingPathWeekSummary,
  TrainingPathWeekWindow,
} from "./trainingPathTypes";

type BuildTrainingPathInput = {
  timeline?: TrainingPathLoadPoint[] | null;
  fitnessHistory?: TrainingPathFitnessPoint[] | null;
  projectedFitness?: TrainingPathFitnessPoint[] | null;
  idealFitnessCurve?: TrainingPathFitnessPoint[] | null;
  goalMarkers?: TrainingPathSourceGoalMarker[] | null;
  selectedWeekStart?: string | null;
  range: TrainingPathRange;
  weekWindow?: TrainingPathWeekWindow | null;
  todayKey: string;
};

type WeekBucket = {
  completedLoad: number;
  plannedLoad: number;
  tentativePlannedLoad: number;
  targetLoad: number;
};

type NormalizedTrainingPathInput = {
  timeline: TrainingPathLoadPoint[];
  fitnessHistory: TrainingPathFitnessPoint[];
  projectedFitness: TrainingPathFitnessPoint[];
  idealFitnessCurve: TrainingPathFitnessPoint[];
  goalMarkers: TrainingPathSourceGoalMarker[];
  selectedWeekStart?: string | null;
  range: TrainingPathRange;
  weekWindow?: TrainingPathWeekWindow | null;
  todayKey: string;
};

type TrainingPathSourceMaps = {
  loadByWeek: Map<string, WeekBucket>;
  actualFitnessByWeek: Map<string, TrainingPathFitnessPoint>;
  scheduledFitnessByWeek: Map<string, TrainingPathFitnessPoint>;
  idealFitnessByWeek: Map<string, TrainingPathFitnessPoint>;
  goalMarkers: TrainingPathGoalMarker[];
};

export const trainingPathRangeOptions: { label: string; value: TrainingPathRange }[] = [
  { label: "Next Goal", value: "goal" },
  { label: "Season", value: "season" },
  { label: "All", value: "all" },
];

export function getWeekStartDateKey(value: string) {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  const day = parsed.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - daysFromMonday);
  return parsed.toISOString().split("T")[0] ?? value;
}

export function addDays(value: string, days: number) {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().split("T")[0] ?? value;
}

function compactDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatTrainingPathDateRange(start: string, end: string) {
  return `${compactDateLabel(start)} - ${compactDateLabel(end)}`;
}

function getNumericLoad(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getRangeBounds(
  range: TrainingPathRange,
  todayKey: string,
  goalMarkers: TrainingPathGoalMarker[],
) {
  if (range === "all") return null;
  const weekStart = getWeekStartDateKey(todayKey);
  const upcomingGoals = goalMarkers.filter((goal) => goal.targetDate >= todayKey);
  const selectedGoal = upcomingGoals[0] ?? goalMarkers[0] ?? null;

  if (range === "goal" && selectedGoal) {
    return {
      start: addDays(weekStart, -56),
      end: addDays(selectedGoal.weekStart, 14),
    };
  }

  const lastGoal =
    upcomingGoals[upcomingGoals.length - 1] ?? goalMarkers[goalMarkers.length - 1] ?? null;
  return {
    start: addDays(weekStart, -84),
    end: lastGoal ? addDays(lastGoal.weekStart, 28) : addDays(weekStart, 180),
  };
}

export function resolveTrainingPathRiskZone(form: number | null): TrainingPathRiskZone | null {
  if (typeof form !== "number" || !Number.isFinite(form)) return null;
  if (form >= 5) return "fresh";
  if (form >= -10) return "moderate";
  if (form >= -25) return "high";
  return "veryHigh";
}

function freshnessCopy(form: number | null) {
  const zone = resolveTrainingPathRiskZone(form);
  switch (zone) {
    case "fresh":
      return "Fresh";
    case "moderate":
      return "Productive load";
    case "high":
      return "High strain";
    case "veryHigh":
      return "Very high strain";
    default:
      return null;
  }
}

function aggregateLoadByWeek(timeline: TrainingPathLoadPoint[]) {
  const buckets = new Map<string, WeekBucket>();
  for (const point of timeline) {
    if (!point.date) continue;
    const weekStart = getWeekStartDateKey(point.date);
    const bucket = buckets.get(weekStart) ?? {
      completedLoad: 0,
      plannedLoad: 0,
      tentativePlannedLoad: 0,
      targetLoad: 0,
    };
    bucket.completedLoad += getNumericLoad(point.completed_load_tss ?? point.actual_tss);
    bucket.plannedLoad += getNumericLoad(point.scheduled_load_tss ?? point.scheduled_tss);
    bucket.tentativePlannedLoad += getNumericLoad(point.tentative_scheduled_load_tss);
    bucket.targetLoad += getNumericLoad(point.recommended_load_tss ?? point.ideal_tss);
    buckets.set(weekStart, bucket);
  }
  return buckets;
}

function latestFitnessByWeek(points: TrainingPathFitnessPoint[]) {
  const byWeek = new Map<string, TrainingPathFitnessPoint>();
  for (const point of points) {
    if (!point.date || typeof point.ctl !== "number") continue;
    const weekStart = getWeekStartDateKey(point.date);
    const existing = byWeek.get(weekStart);
    if (!existing || point.date >= existing.date) {
      byWeek.set(weekStart, point);
    }
  }
  return byWeek;
}

function scheduledFitnessByWeek(points: TrainingPathFitnessPoint[], todayKey: string) {
  const byWeek = latestFitnessByWeek(points);
  const todayPoint = points.find((point) => point.date === todayKey);
  if (todayPoint) {
    byWeek.set(getWeekStartDateKey(todayKey), todayPoint);
  }
  return byWeek;
}

function actualFitnessByWeek(points: TrainingPathFitnessPoint[], todayKey: string) {
  const byWeek = latestFitnessByWeek(points);
  const todayPoint = resolveTodayFitnessState(points, todayKey);
  if (todayPoint) {
    byWeek.set(getWeekStartDateKey(todayKey), todayPoint);
  }
  return byWeek;
}

function latestFitnessAtOrBefore(points: TrainingPathFitnessPoint[], date: string) {
  return (
    points
      .filter((point) => point.date <= date && typeof point.ctl === "number")
      .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null
  );
}

function resolveTodayFitnessState(points: TrainingPathFitnessPoint[], todayKey: string) {
  const currentFitness = latestFitnessAtOrBefore(points, todayKey);
  if (!currentFitness) return null;
  if (currentFitness.date === todayKey) return currentFitness;

  const replayed = replayTrainingLoadByDate({
    dailyTss: buildDailyTssByDateSeries({
      startDate: addDays(currentFitness.date, 1),
      endDate: todayKey,
      tssByDate: new Map<string, number>(),
    }),
    initialATL: currentFitness.atl ?? currentFitness.ctl,
    initialCTL: currentFitness.ctl,
  });
  const todayFitness = replayed.at(-1);

  return todayFitness
    ? {
        date: todayKey,
        ctl: Math.round(todayFitness.ctl * 10) / 10,
        atl: Math.round(todayFitness.atl * 10) / 10,
        tsb: Math.round(todayFitness.tsb * 10) / 10,
      }
    : {
        date: todayKey,
        ctl: currentFitness.ctl,
        atl: currentFitness.atl ?? null,
        tsb: currentFitness.tsb ?? null,
      };
}

export function buildScheduledFitnessTrend(input: {
  fitnessHistory?: TrainingPathFitnessPoint[] | null;
  idealFitnessCurve?: TrainingPathFitnessPoint[] | null;
  timeline?: TrainingPathLoadPoint[] | null;
  todayKey: string;
}) {
  const currentFitness = resolveTodayFitnessState(input.fitnessHistory ?? [], input.todayKey);
  const idealEndDate = (input.idealFitnessCurve ?? [])
    .map((point) => point.date)
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))[0];

  if (!currentFitness || !idealEndDate || idealEndDate < input.todayKey) return [];

  const scheduledTssByDate = new Map<string, number>();
  for (const point of input.timeline ?? []) {
    if (!point.date) continue;
    const scheduledLoad =
      getNumericLoad(point.scheduled_load_tss ?? point.scheduled_tss) +
      getNumericLoad(point.tentative_scheduled_load_tss);
    if (scheduledLoad <= 0) continue;
    scheduledTssByDate.set(point.date, (scheduledTssByDate.get(point.date) ?? 0) + scheduledLoad);
  }

  const tomorrow = addDays(input.todayKey, 1);
  const replayed =
    tomorrow <= idealEndDate
      ? replayTrainingLoadByDate({
          dailyTss: buildDailyTssByDateSeries({
            startDate: tomorrow,
            endDate: idealEndDate,
            tssByDate: scheduledTssByDate,
          }),
          initialATL: currentFitness.atl ?? currentFitness.ctl,
          initialCTL: currentFitness.ctl,
        })
      : [];

  return [
    currentFitness,
    ...replayed.map((point) => ({
      date: point.date,
      ctl: Math.round(point.ctl * 10) / 10,
      atl: Math.round(point.atl * 10) / 10,
      tsb: Math.round(point.tsb * 10) / 10,
    })),
  ];
}

export function buildTrainingPathGoalMarkers(
  goalMarkers: TrainingPathSourceGoalMarker[],
): TrainingPathGoalMarker[] {
  return goalMarkers
    .filter((marker) => marker.id && marker.targetDate)
    .map((marker) => ({
      id: marker.id,
      label: marker.label ?? "Goal",
      targetDate: marker.targetDate,
      weekStart: getWeekStartDateKey(marker.targetDate),
    }))
    .sort((left, right) => left.targetDate.localeCompare(right.targetDate));
}

export function buildScrollableTrainingPathWindow(input: {
  goalMarkers?: TrainingPathSourceGoalMarker[] | TrainingPathGoalMarker[] | null;
  todayKey: string;
  pastWeeks?: number;
  futureWeeksAfterLastGoal?: number;
  fallbackFutureWeeks?: number;
}): TrainingPathWeekWindow {
  const currentWeekStart = getWeekStartDateKey(input.todayKey);
  const markers = buildTrainingPathGoalMarkers(input.goalMarkers ?? []);
  const lastGoal = markers[markers.length - 1] ?? null;
  return {
    start: addDays(currentWeekStart, -(input.pastWeeks ?? 4) * 7),
    end: lastGoal
      ? addDays(lastGoal.weekStart, (input.futureWeeksAfterLastGoal ?? 4) * 7)
      : addDays(currentWeekStart, (input.fallbackFutureWeeks ?? 26) * 7),
  };
}

function chooseSelectedWeek(
  weeks: TrainingPathWeek[],
  selectedWeekStart: string | null | undefined,
) {
  return (
    weeks.find((week) => week.weekStart === selectedWeekStart) ??
    weeks.find((week) => week.isCurrent) ??
    weeks[0] ??
    null
  );
}

export function buildTrainingPathWeekSummary(input: {
  week: TrainingPathWeek;
  goalMarkers: TrainingPathGoalMarker[];
  projectedFitnessByWeek: Map<string, TrainingPathFitnessPoint>;
  targetFitnessByWeek: Map<string, TrainingPathFitnessPoint>;
}): TrainingPathWeekSummary {
  const completedLoad = Math.round(input.week.completedLoad ?? 0);
  const plannedLoad = Math.round(input.week.plannedLoad ?? 0);
  const tentativePlannedLoad = Math.round(input.week.tentativePlannedLoad ?? 0);
  const targetLoad = Math.round(input.week.targetLoad ?? 0);
  const loadDelta = Math.round(completedLoad + plannedLoad + tentativePlannedLoad - targetLoad);
  const fitnessGapToIdeal =
    typeof input.week.fitness === "number" && typeof input.week.targetFitness === "number"
      ? Math.round(input.week.fitness - input.week.targetFitness)
      : null;
  const absDelta = Math.abs(loadDelta);
  const headline =
    absDelta < 10
      ? "On target"
      : loadDelta < 0
        ? `${absDelta} TSS below target`
        : `${absDelta} TSS above target`;
  const body =
    absDelta < 10
      ? "This week is aligned with the target path."
      : loadDelta < 0
        ? ""
        : "This week is above the target path, so watch freshness before adding more load.";
  const nextGoal = input.goalMarkers.find((goal) => goal.weekStart >= input.week.weekStart);
  const projectedFitnessAtGoal = nextGoal
    ? (input.projectedFitnessByWeek.get(nextGoal.weekStart)?.ctl ?? null)
    : null;
  const targetFitnessAtGoal = nextGoal
    ? (input.targetFitnessByWeek.get(nextGoal.weekStart)?.ctl ?? null)
    : null;

  return {
    weekStart: input.week.weekStart,
    weekEnd: input.week.weekEnd,
    dateLabel: formatTrainingPathDateRange(input.week.weekStart, input.week.weekEnd),
    loadDelta,
    headline,
    body,
    completedLoad,
    plannedLoad,
    tentativePlannedLoad,
    targetLoad,
    fitness: input.week.fitness,
    targetFitness: input.week.targetFitness,
    fitnessGapToIdeal,
    fatigue: input.week.fatigue,
    form: input.week.form,
    freshnessLabel: freshnessCopy(input.week.form),
    projectedFitnessAtGoal,
    targetFitnessAtGoal,
  };
}

function computeDomain(values: Array<number | null>, fallback: [number, number]) {
  const observed = values.filter((value): value is number => typeof value === "number");
  if (observed.length === 0) return fallback;
  const min = Math.min(...observed);
  const max = Math.max(...observed);
  const padding = Math.max(10, (max - min) * 0.12);
  return [
    Math.max(0, Math.floor((min - padding) / 10) * 10),
    Math.ceil((max + padding) / 10) * 10,
  ] as [number, number];
}

function computePositiveDomain(values: Array<number | null>, fallback: [number, number]) {
  const observed = values.filter((value): value is number => typeof value === "number");
  if (observed.length === 0) return fallback;
  const max = Math.max(...observed);
  const padding = Math.max(10, max * 0.12);
  return [0, Math.ceil((max + padding) / 10) * 10] as [number, number];
}

function resolveEmptyState(
  input: BuildTrainingPathInput,
  weeks: TrainingPathWeek[],
): TrainingPathEmptyState | null {
  if ((input.goalMarkers ?? []).length === 0) return "noGoal";
  if ((input.fitnessHistory ?? []).length === 0) return "noActivityHistory";
  if (!weeks.some((week) => (week.plannedLoad ?? 0) > 0)) return "noPlannedSessions";
  if (weeks.length === 0) return "noProjection";
  return null;
}

function normalizeTrainingPathInput(input: BuildTrainingPathInput): NormalizedTrainingPathInput {
  return {
    timeline: input.timeline ?? [],
    fitnessHistory: input.fitnessHistory ?? [],
    projectedFitness: input.projectedFitness ?? [],
    idealFitnessCurve: input.idealFitnessCurve ?? [],
    goalMarkers: input.goalMarkers ?? [],
    selectedWeekStart: input.selectedWeekStart,
    range: input.range,
    weekWindow: input.weekWindow,
    todayKey: input.todayKey,
  };
}

function buildSourceMaps(input: NormalizedTrainingPathInput): TrainingPathSourceMaps {
  return {
    loadByWeek: aggregateLoadByWeek(input.timeline),
    actualFitnessByWeek: actualFitnessByWeek(input.fitnessHistory, input.todayKey),
    scheduledFitnessByWeek: scheduledFitnessByWeek(
      input.projectedFitness.length > 0
        ? input.projectedFitness
        : buildScheduledFitnessTrend({
            fitnessHistory: input.fitnessHistory,
            idealFitnessCurve: input.idealFitnessCurve,
            timeline: input.timeline,
            todayKey: input.todayKey,
          }),
      input.todayKey,
    ),
    idealFitnessByWeek: latestFitnessByWeek(input.idealFitnessCurve),
    goalMarkers: buildTrainingPathGoalMarkers(input.goalMarkers),
  };
}

function collectVisibleWeekStarts(
  input: NormalizedTrainingPathInput,
  sources: TrainingPathSourceMaps,
) {
  const currentWeekStart = getWeekStartDateKey(input.todayKey);
  const weekStarts = new Set<string>([currentWeekStart]);

  for (const weekStart of sources.loadByWeek.keys()) weekStarts.add(weekStart);
  for (const weekStart of sources.actualFitnessByWeek.keys()) weekStarts.add(weekStart);
  for (const weekStart of sources.scheduledFitnessByWeek.keys()) weekStarts.add(weekStart);
  for (const weekStart of sources.idealFitnessByWeek.keys()) weekStarts.add(weekStart);
  for (const marker of sources.goalMarkers) weekStarts.add(marker.weekStart);

  const rangeBounds =
    input.weekWindow ?? getRangeBounds(input.range, input.todayKey, sources.goalMarkers);
  if (rangeBounds) {
    let cursor = getWeekStartDateKey(rangeBounds.start);
    const end = getWeekStartDateKey(rangeBounds.end);
    for (let weekCount = 0; cursor <= end && weekCount < 260; weekCount += 1) {
      weekStarts.add(cursor);
      cursor = addDays(cursor, 7);
    }
  }

  return [...weekStarts]
    .filter(
      (weekStart) =>
        !rangeBounds || (weekStart >= rangeBounds.start && weekStart <= rangeBounds.end),
    )
    .sort((left, right) => left.localeCompare(right));
}

function pickFitnessPoint(
  weekStart: string,
  sources: Pick<TrainingPathSourceMaps, "actualFitnessByWeek">,
) {
  return sources.actualFitnessByWeek.get(weekStart) ?? null;
}

function buildWeeks(input: NormalizedTrainingPathInput, sources: TrainingPathSourceMaps) {
  const currentWeekStart = getWeekStartDateKey(input.todayKey);
  const sortedWeekStarts = collectVisibleWeekStarts(input, sources);

  const selectedCandidate =
    input.selectedWeekStart && sortedWeekStarts.includes(input.selectedWeekStart)
      ? input.selectedWeekStart
      : currentWeekStart;

  return sortedWeekStarts.map<TrainingPathWeek>((weekStart) => {
    const load = sources.loadByWeek.get(weekStart);
    const fitnessPoint = pickFitnessPoint(weekStart, sources);
    const scheduledFitnessPoint = sources.scheduledFitnessByWeek.get(weekStart);
    const idealFitnessPoint = sources.idealFitnessByWeek.get(weekStart);
    const weekEnd = addDays(weekStart, 6);
    const form = fitnessPoint?.tsb ?? null;
    return {
      weekStart,
      weekEnd,
      label: compactDateLabel(weekStart),
      completedLoad: load ? Math.round(load.completedLoad) : null,
      plannedLoad: load ? Math.round(load.plannedLoad) : null,
      tentativePlannedLoad: load ? Math.round(load.tentativePlannedLoad) : null,
      targetLoad: load ? Math.round(load.targetLoad) : null,
      fitness: typeof fitnessPoint?.ctl === "number" ? Math.round(fitnessPoint.ctl) : null,
      scheduledFitness:
        typeof scheduledFitnessPoint?.ctl === "number"
          ? Math.round(scheduledFitnessPoint.ctl)
          : null,
      targetFitness:
        typeof idealFitnessPoint?.ctl === "number" ? Math.round(idealFitnessPoint.ctl) : null,
      fatigue: typeof fitnessPoint?.atl === "number" ? Math.round(fitnessPoint.atl) : null,
      form,
      riskZone: resolveTrainingPathRiskZone(form),
      isCurrent: weekStart === currentWeekStart,
      isSelected: weekStart === selectedCandidate,
    };
  });
}

export function buildTrainingPathViewModel(input: BuildTrainingPathInput): TrainingPathViewModel {
  const normalizedInput = normalizeTrainingPathInput(input);
  const sources = buildSourceMaps(normalizedInput);
  const weeks = buildWeeks(normalizedInput, sources);

  const selectedWeek = chooseSelectedWeek(weeks, normalizedInput.selectedWeekStart);
  const selectedWeekSummary = selectedWeek
    ? buildTrainingPathWeekSummary({
        week: selectedWeek,
        goalMarkers: sources.goalMarkers,
        projectedFitnessByWeek: sources.scheduledFitnessByWeek,
        targetFitnessByWeek: sources.idealFitnessByWeek,
      })
    : null;

  return {
    weeks: weeks.map((week) => ({
      ...week,
      isSelected: week.weekStart === selectedWeek?.weekStart,
    })),
    selectedWeekSummary,
    goalMarkers: sources.goalMarkers.filter((marker) =>
      weeks.some((week) => week.weekStart === marker.weekStart),
    ),
    todayKey: normalizedInput.todayKey,
    domains: {
      load: computePositiveDomain(
        weeks.flatMap((week) => [
          week.completedLoad,
          typeof week.plannedLoad === "number" || typeof week.tentativePlannedLoad === "number"
            ? (week.plannedLoad ?? 0) + (week.tentativePlannedLoad ?? 0)
            : null,
          week.targetLoad,
        ]),
        [0, 200],
      ),
      fitness: computeDomain(
        weeks.flatMap((week) => [week.fitness, week.scheduledFitness, week.targetFitness]),
        [0, 100],
      ),
    },
    emptyState: resolveEmptyState(normalizedInput, weeks),
  };
}

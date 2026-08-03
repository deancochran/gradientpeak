import { buildDailyLoadByDateSeries, replayCommonLoadFitnessByDate } from "@repo/core/load";
import { isCanonicalDateKey } from "@/lib/calendar/dateMath";
import {
  type CommonLoadIdentity,
  sameCommonLoadIdentity,
} from "@/lib/training-path/completedCommonLoadObservation";
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
  completedAggregateUnavailable: boolean;
  completedIdentity: CommonLoadIdentity | null;
  completedLoad: number;
  hasCompletedObservation: boolean;
  plannedLoad: number;
  plannedLoadUnavailable: boolean;
  tentativePlannedLoad: number;
  tentativePlannedLoadUnavailable: boolean;
  targetLoad: number | null;
  targetLoadDates: Set<string>;
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

export function getWeekStartDateKey(value: string) {
  if (!isCanonicalDateKey(value)) return value;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  const day = parsed.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - daysFromMonday);
  return parsed.toISOString().split("T")[0] ?? value;
}

export function addDays(value: string, days: number) {
  if (!isCanonicalDateKey(value)) return value;
  const parsed = new Date(`${value}T12:00:00.000Z`);
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

function isFiniteLoad(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
    if (!point.date || !isCanonicalDateKey(point.date)) continue;
    const weekStart = getWeekStartDateKey(point.date);
    const bucket = buckets.get(weekStart) ?? {
      completedAggregateUnavailable: false,
      completedIdentity: null,
      completedLoad: 0,
      hasCompletedObservation: false,
      plannedLoad: 0,
      plannedLoadUnavailable: false,
      tentativePlannedLoad: 0,
      tentativePlannedLoadUnavailable: false,
      targetLoad: null,
      targetLoadDates: new Set<string>(),
    };
    const completedLoad = point.completed_common_load;
    const completedState = point.completed_observation_state;
    if (completedState === "observed") {
      bucket.hasCompletedObservation = true;
      if (
        point.has_unavailable_completed_activity ||
        !point.completed_common_load_identity ||
        !isFiniteLoad(completedLoad) ||
        (bucket.completedIdentity &&
          !sameCommonLoadIdentity(bucket.completedIdentity, point.completed_common_load_identity))
      ) {
        bucket.completedAggregateUnavailable = true;
      } else {
        bucket.completedIdentity ??= point.completed_common_load_identity;
        bucket.completedLoad += completedLoad;
      }
    } else if (completedState === "known_zero") {
      bucket.hasCompletedObservation = true;
    } else if (completedState === "unavailable" || completedState === "uncovered") {
      bucket.completedAggregateUnavailable = true;
    } else if (isFiniteLoad(completedLoad) && completedLoad > 0) {
      bucket.completedAggregateUnavailable = true;
    }
    if (isFiniteLoad(point.scheduled_common_load)) {
      bucket.plannedLoad += point.scheduled_common_load;
    } else {
      bucket.plannedLoadUnavailable = true;
    }
    if (isFiniteLoad(point.tentative_scheduled_common_load)) {
      bucket.tentativePlannedLoad += point.tentative_scheduled_common_load;
    } else {
      bucket.tentativePlannedLoadUnavailable = true;
    }
    const targetLoad = point.recommended_common_load;
    if (typeof targetLoad === "number" && Number.isFinite(targetLoad)) {
      bucket.targetLoad = bucket.targetLoad === null ? targetLoad : bucket.targetLoad + targetLoad;
      bucket.targetLoadDates.add(point.date);
    }
    buckets.set(weekStart, bucket);
  }
  return buckets;
}

function latestFitnessByWeek(points: TrainingPathFitnessPoint[]) {
  const byWeek = new Map<string, TrainingPathFitnessPoint>();
  for (const point of points) {
    if (!point.date || !isCanonicalDateKey(point.date) || typeof point.longTermLoad !== "number")
      continue;
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
  if (!isCanonicalDateKey(date)) return null;
  return (
    points
      .filter(
        (point) =>
          isCanonicalDateKey(point.date) &&
          point.date <= date &&
          typeof point.longTermLoad === "number",
      )
      .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null
  );
}

function resolveTodayFitnessState(points: TrainingPathFitnessPoint[], todayKey: string) {
  const currentFitness = latestFitnessAtOrBefore(points, todayKey);
  if (!currentFitness) return null;
  if (currentFitness.date === todayKey) return currentFitness;

  const replayed = replayCommonLoadFitnessByDate({
    dailyLoad: buildDailyLoadByDateSeries({
      startDate: addDays(currentFitness.date, 1),
      endDate: todayKey,
      loadByDate: new Map<string, number>(),
    }),
    initialRecentLoad: currentFitness.recentLoad ?? currentFitness.longTermLoad,
    initialLongTermLoad: currentFitness.longTermLoad,
  });
  const todayFitness = replayed.at(-1);

  return todayFitness
    ? {
        date: todayKey,
        longTermLoad: Math.round(todayFitness.longTermLoad * 10) / 10,
        recentLoad: Math.round(todayFitness.recentLoad * 10) / 10,
        loadBalance: Math.round(todayFitness.loadBalance * 10) / 10,
      }
    : {
        date: todayKey,
        longTermLoad: currentFitness.longTermLoad,
        recentLoad: currentFitness.recentLoad ?? null,
        loadBalance: currentFitness.loadBalance ?? null,
      };
}

export function buildTrainingPathGoalMarkers(
  goalMarkers: TrainingPathSourceGoalMarker[],
): TrainingPathGoalMarker[] {
  return goalMarkers
    .filter((marker) => marker.id && marker.targetDate && isCanonicalDateKey(marker.targetDate))
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
    start: addDays(currentWeekStart, -(input.pastWeeks ?? 12) * 7),
    end: lastGoal
      ? addDays(lastGoal.weekStart, (input.futureWeeksAfterLastGoal ?? 8) * 7)
      : addDays(currentWeekStart, (input.fallbackFutureWeeks ?? 52) * 7),
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
  const completedLoad =
    typeof input.week.completedLoad === "number" ? Math.round(input.week.completedLoad) : null;
  const plannedLoad =
    typeof input.week.plannedLoad === "number" ? Math.round(input.week.plannedLoad) : null;
  const tentativePlannedLoad =
    typeof input.week.tentativePlannedLoad === "number"
      ? Math.round(input.week.tentativePlannedLoad)
      : null;
  const targetLoad =
    typeof input.week.targetLoad === "number" ? Math.round(input.week.targetLoad) : null;
  const loadDelta =
    targetLoad == null ||
    completedLoad == null ||
    plannedLoad == null ||
    tentativePlannedLoad == null
      ? null
      : Math.round(completedLoad + plannedLoad + tentativePlannedLoad - targetLoad);
  const fitnessGapToIdeal =
    typeof input.week.fitness === "number" && typeof input.week.targetFitness === "number"
      ? Math.round(input.week.fitness - input.week.targetFitness)
      : null;
  const absDelta = loadDelta == null ? null : Math.abs(loadDelta);
  const headline =
    absDelta == null || loadDelta == null
      ? null
      : absDelta < 10
        ? "On target"
        : loadDelta < 0
          ? `${absDelta} Common Load below target`
          : `${absDelta} Common Load above target`;
  const body = input.week.completedLoadUnavailable
    ? "Completed Common Load is unavailable for this week."
    : absDelta == null || loadDelta == null
      ? null
      : absDelta < 10
        ? "This week is aligned with the target path."
        : loadDelta < 0
          ? ""
          : "This week is above the target path, so watch freshness before adding more load.";
  const nextGoal = input.goalMarkers.find((goal) => goal.weekStart >= input.week.weekStart);
  const projectedFitnessAtGoal = nextGoal
    ? (input.projectedFitnessByWeek.get(nextGoal.weekStart)?.longTermLoad ?? null)
    : null;
  const targetFitnessAtGoal = nextGoal
    ? (input.targetFitnessByWeek.get(nextGoal.weekStart)?.longTermLoad ?? null)
    : null;

  return {
    weekStart: input.week.weekStart,
    weekEnd: input.week.weekEnd,
    dateLabel: formatTrainingPathDateRange(input.week.weekStart, input.week.weekEnd),
    loadDelta,
    headline,
    body,
    completedLoad,
    completedLoadUnavailable: input.week.completedLoadUnavailable,
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
  input: NormalizedTrainingPathInput,
  weeks: TrainingPathWeek[],
): TrainingPathEmptyState | null {
  if (weeks.length === 0) return "noProjection";
  const hasRenderablePathData = weeks.some(
    (week) =>
      week.completedLoadUnavailable === true ||
      (typeof week.completedLoad === "number" && week.completedLoad > 0) ||
      (typeof week.plannedLoad === "number" && week.plannedLoad > 0) ||
      (typeof week.tentativePlannedLoad === "number" && week.tentativePlannedLoad > 0) ||
      typeof week.fitness === "number" ||
      typeof week.scheduledFitness === "number" ||
      typeof week.targetFitness === "number",
  );
  if (hasRenderablePathData) return null;
  if (input.goalMarkers.length === 0) return "noGoal";
  if (input.fitnessHistory.length === 0) return "noActivityHistory";
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
    scheduledFitnessByWeek: scheduledFitnessByWeek(input.projectedFitness, input.todayKey),
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

  const requestedWeekWindow =
    input.weekWindow &&
    isCanonicalDateKey(input.weekWindow.start) &&
    isCanonicalDateKey(input.weekWindow.end)
      ? input.weekWindow
      : null;
  const rangeBounds =
    requestedWeekWindow ?? getRangeBounds(input.range, input.todayKey, sources.goalMarkers);
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
    const hasCompleteTargetCoverage = Array.from({ length: 7 }, (_, index) =>
      load?.targetLoadDates.has(addDays(weekStart, index)),
    ).every(Boolean);
    const form = fitnessPoint?.loadBalance ?? null;
    return {
      weekStart,
      weekEnd,
      label: compactDateLabel(weekStart),
      completedLoad:
        load?.hasCompletedObservation && !load.completedAggregateUnavailable
          ? Math.round(load.completedLoad)
          : null,
      completedLoadUnavailable: load?.completedAggregateUnavailable === true,
      plannedLoad: load && !load.plannedLoadUnavailable ? Math.round(load.plannedLoad) : null,
      tentativePlannedLoad:
        load && !load.tentativePlannedLoadUnavailable
          ? Math.round(load.tentativePlannedLoad)
          : null,
      targetLoad:
        hasCompleteTargetCoverage && typeof load?.targetLoad === "number"
          ? Math.round(load.targetLoad)
          : null,
      fitness:
        typeof fitnessPoint?.longTermLoad === "number"
          ? Math.round(fitnessPoint.longTermLoad)
          : null,
      scheduledFitness:
        typeof scheduledFitnessPoint?.longTermLoad === "number"
          ? Math.round(scheduledFitnessPoint.longTermLoad)
          : null,
      targetFitness:
        typeof idealFitnessPoint?.longTermLoad === "number"
          ? Math.round(idealFitnessPoint.longTermLoad)
          : null,
      fatigue:
        typeof fitnessPoint?.recentLoad === "number" ? Math.round(fitnessPoint.recentLoad) : null,
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
          typeof week.plannedLoad === "number" && typeof week.tentativePlannedLoad === "number"
            ? week.plannedLoad + week.tentativePlannedLoad
            : null,
        ]),
        [0, 10],
      ),
      fitness: computeDomain(
        weeks.flatMap((week) => [week.fitness, week.scheduledFitness, week.targetFitness]),
        [0, 100],
      ),
    },
    emptyState: resolveEmptyState(normalizedInput, weeks),
  };
}

import { addDaysDateOnlyUtc, formatDateOnlyUtc, parseDateOnlyUtc } from "@repo/core";
import type {
  BackendPreviewProjection,
  BuilderDailyTrainingPathChartViewModel,
  TrainingPathChartProjectionResult,
} from "./types";

function getMondayWeekStart(dateKey: string) {
  const date = parseDateOnlyUtc(dateKey);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return formatDateOnlyUtc(date);
}

function emptyChart(startDate: string): BuilderDailyTrainingPathChartViewModel {
  return {
    dailyPoints: [],
    weeks: [],
    selectedWeekSummary: null,
    goalMarkers: [],
    todayKey: startDate,
    domains: { load: [0, 1], fitness: [0, 1] },
    emptyState: "noActivityHistory",
  };
}

export function deriveTrainingPathChartFromBackendProjection(input: {
  backendPreview: BackendPreviewProjection | null;
  startDate: string;
}): TrainingPathChartProjectionResult {
  if (!input.backendPreview) return { chart: emptyChart(input.startDate), source: "none" };
  const transitions = [...input.backendPreview.projectionChart.transitions].sort((left, right) =>
    left.toAsOf.localeCompare(right.toAsOf),
  );
  if (transitions.length === 0) return { chart: emptyChart(input.startDate), source: "none" };

  const dailyPoints = transitions.map((transition) => {
    const date = transition.sourceId?.startsWith("plan-day:")
      ? transition.sourceId.slice("plan-day:".length)
      : transition.toAsOf.slice(0, 10);
    return {
      date,
      plannedLoad: 0,
      completedLoad: null,
      targetLoad: 0,
      actualOrScheduledLoad: 0,
      loadDelta: null,
      plannedDelta: null,
      completedCommonLoadIdentity: null,
      hasCompletedActivityWithoutLoad: false,
      hasTargetLoad: false,
      fitnessCtl: transition.state.longTermLoad,
      scheduledFitnessCtl: transition.state.longTermLoad,
      targetFitnessCtl: null,
      fatigueAtl: transition.state.recentLoad,
      formTsb: transition.state.loadBalance,
      readinessScore: null,
      annotations: [],
    };
  });
  const buckets = new Map<string, typeof dailyPoints>();
  for (const point of dailyPoints) {
    const key = getMondayWeekStart(point.date);
    buckets.set(key, [...(buckets.get(key) ?? []), point]);
  }
  const weeks = [...buckets.entries()].map(([weekStart, weekPoints], index) => {
    const finalPoint = weekPoints.at(-1);
    const plannedValues = weekPoints.map((point) => point.plannedLoad);
    return {
      weekStart,
      weekEnd: addDaysDateOnlyUtc(weekStart, 6),
      label: `Week ${index + 1}`,
      completedLoad: null,
      plannedLoad: plannedValues.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      targetLoad: 0,
      fitness: finalPoint?.fitnessCtl ?? null,
      scheduledFitness: finalPoint?.scheduledFitnessCtl ?? null,
      targetFitness: null,
      fatigue: finalPoint?.fatigueAtl ?? null,
      form: finalPoint?.formTsb ?? null,
      riskZone: null,
      isCurrent: false,
      isSelected: index === 0,
    };
  });
  const loadMax = Math.max(
    1,
    ...weeks.flatMap((week) => [week.plannedLoad ?? 0, week.targetLoad ?? 0]),
  );
  const fitnessMax = Math.max(
    1,
    ...weeks.flatMap((week) => [week.fitness ?? 0, week.fatigue ?? 0, week.targetFitness ?? 0]),
  );
  return {
    source: "backend",
    chart: {
      dailyPoints,
      weeks,
      selectedWeekSummary: null,
      goalMarkers: [],
      todayKey: input.startDate,
      domains: { load: [0, Math.ceil(loadMax * 1.15)], fitness: [0, Math.ceil(fitnessMax * 1.15)] },
      emptyState: null,
    },
  };
}

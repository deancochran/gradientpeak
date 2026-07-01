import { addDaysDateOnlyUtc, formatDateOnlyUtc, parseDateOnlyUtc } from "@repo/core";
import type { BuilderDailyTrainingPathChartViewModel } from "../view-model";
import type { ActiveTrainingPlanProjection, TrainingPathChartProjectionResult } from "./types";

export function deriveTrainingPathChartFromActiveProjection({
  activeProjection,
  localChart,
}: {
  activeProjection: ActiveTrainingPlanProjection;
  localChart: BuilderDailyTrainingPathChartViewModel;
}): TrainingPathChartProjectionResult {
  if (activeProjection.source !== "backend") return { chart: localChart, source: "local" };
  const backendChart = mapBackendProjectionChartToTrainingPathChart(
    activeProjection.projectionChart,
    localChart,
  );
  return backendChart
    ? { chart: backendChart, source: "backend" }
    : { chart: localChart, source: "local" };
}

function mapBackendProjectionChartToTrainingPathChart(
  projectionChart: unknown,
  localChart: BuilderDailyTrainingPathChartViewModel,
): BuilderDailyTrainingPathChartViewModel | null {
  if (!projectionChart || typeof projectionChart !== "object") return null;
  const chart = projectionChart as Record<string, any>;
  const points = Array.isArray(chart.display_points)
    ? chart.display_points
    : Array.isArray(chart.points)
      ? chart.points
      : [];
  const validPoints = points.filter(isBackendProjectionPoint);
  if (validPoints.length === 0) return null;

  const weeks = aggregateBackendPointsToWeeks(validPoints, localChart);
  if (weeks.length === 0) return null;

  const loadMax = Math.max(
    1,
    ...weeks.flatMap((week) => [
      week.plannedLoad ?? 0,
      week.targetLoad ?? 0,
      week.completedLoad ?? 0,
      week.tentativePlannedLoad ?? 0,
    ]),
  );
  const fitnessValues = weeks
    .flatMap((week) => [week.fitness, week.scheduledFitness, week.targetFitness, week.fatigue])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const fitnessMax = Math.max(1, ...fitnessValues);

  return {
    ...localChart,
    weeks,
    domains: { load: [0, Math.ceil(loadMax * 1.15)], fitness: [0, Math.ceil(fitnessMax * 1.15)] },
  };
}

type BackendProjectionPoint = {
  date: string;
  predicted_load_tss: number;
  predicted_fitness_ctl: number;
  predicted_fatigue_atl: number;
  predicted_form_tsb: number;
};

function isBackendProjectionPoint(value: unknown): value is BackendProjectionPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.date === "string" &&
    typeof point.predicted_load_tss === "number" &&
    typeof point.predicted_fitness_ctl === "number" &&
    typeof point.predicted_fatigue_atl === "number" &&
    typeof point.predicted_form_tsb === "number"
  );
}

function aggregateBackendPointsToWeeks(
  points: BackendProjectionPoint[],
  localChart: BuilderDailyTrainingPathChartViewModel,
): BuilderDailyTrainingPathChartViewModel["weeks"] {
  const buckets = new Map<string, BackendProjectionPoint[]>();
  for (const point of points) {
    const weekStart = getMondayWeekStart(point.date);
    const bucket = buckets.get(weekStart) ?? [];
    bucket.push(point);
    buckets.set(weekStart, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, weekPoints], index) => {
      const sortedPoints = [...weekPoints].sort((left, right) =>
        left.date.localeCompare(right.date),
      );
      const finalPoint = sortedPoints[sortedPoints.length - 1] ?? sortedPoints[0];
      const localWeek =
        localChart.weeks.find((week) => week.weekStart === weekStart) ?? localChart.weeks[index];
      const plannedLoad = sortedPoints.reduce(
        (total, point) =>
          total + (Number.isFinite(point.predicted_load_tss) ? point.predicted_load_tss : 0),
        0,
      );
      return {
        weekStart,
        weekEnd: addDaysDateOnlyUtc(weekStart, 6),
        label: localWeek?.label ?? `Week ${index + 1}`,
        completedLoad: localWeek?.completedLoad ?? null,
        plannedLoad,
        tentativePlannedLoad: plannedLoad,
        targetLoad: localWeek?.targetLoad ?? null,
        fitness: finalPoint.predicted_fitness_ctl,
        scheduledFitness: finalPoint.predicted_fitness_ctl,
        targetFitness: localWeek?.targetFitness ?? finalPoint.predicted_fitness_ctl,
        fatigue: finalPoint.predicted_fatigue_atl,
        form: finalPoint.predicted_form_tsb,
        riskZone: null,
        isCurrent: localWeek?.isCurrent ?? false,
        isSelected: localWeek?.isSelected ?? index === 0,
      };
    });
}

function getMondayWeekStart(dateKey: string) {
  const date = parseDateOnlyUtc(dateKey);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return formatDateOnlyUtc(date);
}

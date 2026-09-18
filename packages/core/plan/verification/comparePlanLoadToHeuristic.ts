import type { DeterministicProjectionPayload } from "../projection/engine";
import type {
  AggregatedWeeklyPlannedLoad,
  WeeklyLoadAggregationStatus,
} from "./aggregateWeeklyPlannedLoad";

export type HeuristicComparisonToleranceClass = "tight" | "moderate" | "flexible";

export interface HeuristicComparisonToleranceConfig {
  weekly_absolute_load_floor: number;
  weekly_relative_pct: number;
  block_absolute_load_floor: number;
  block_relative_pct: number;
}

export interface HeuristicComparisonTarget {
  recommended_weekly_load?: number | null;
  recommended_baseline_load_range?: { min: number; max: number } | null;
  microcycles?: Array<{
    week_start_date?: string;
    planned_weekly_load: number | null;
  }>;
}

export interface PlanToHeuristicWeekComparison {
  week_index: number;
  week_start_date: string;
  plan_load: number | null;
  plan_load_status: WeeklyLoadAggregationStatus;
  heuristic_load: number | null;
  absolute_error_load: number | null;
  relative_error_pct: number | null;
  weekly_tolerance_load: number | null;
  within_tolerance: boolean | null;
}

export interface PlanToHeuristicBlockComparison {
  start_week_index: number;
  end_week_index: number;
  start_week_date: string;
  end_week_date: string;
  plan_load: number;
  heuristic_load: number;
  absolute_error_load: number;
  relative_error_pct: number;
  block_tolerance_load: number;
  within_tolerance: boolean;
}

export interface ComparePlanLoadToHeuristicResult {
  tolerance: HeuristicComparisonToleranceConfig;
  compared_week_count: number;
  average_plan_weekly_load: number | null;
  average_heuristic_weekly_load: number | null;
  average_absolute_weekly_error_load: number | null;
  mean_relative_weekly_error_pct: number | null;
  recommended_weekly_load_error_load: number | null;
  average_within_baseline_range: boolean | null;
  per_week: PlanToHeuristicWeekComparison[];
  rolling_blocks: PlanToHeuristicBlockComparison[];
}

const TOLERANCE_BY_CLASS: Record<
  HeuristicComparisonToleranceClass,
  HeuristicComparisonToleranceConfig
> = {
  tight: {
    weekly_absolute_load_floor: 20,
    weekly_relative_pct: 0.08,
    block_absolute_load_floor: 32,
    block_relative_pct: 0.08,
  },
  moderate: {
    weekly_absolute_load_floor: 25,
    weekly_relative_pct: 0.12,
    block_absolute_load_floor: 40,
    block_relative_pct: 0.1,
  },
  flexible: {
    weekly_absolute_load_floor: 30,
    weekly_relative_pct: 0.15,
    block_absolute_load_floor: 48,
    block_relative_pct: 0.12,
  },
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveTolerance(
  toleranceClass: HeuristicComparisonToleranceClass,
  overrides?: Partial<HeuristicComparisonToleranceConfig>,
): HeuristicComparisonToleranceConfig {
  return {
    ...TOLERANCE_BY_CLASS[toleranceClass],
    ...overrides,
  };
}

function normalizeHeuristicTarget(
  heuristic: HeuristicComparisonTarget | DeterministicProjectionPayload,
): HeuristicComparisonTarget {
  const projectionLike = heuristic as Partial<DeterministicProjectionPayload>;
  const targetLike = heuristic as HeuristicComparisonTarget;

  return {
    recommended_weekly_load:
      projectionLike.dose_recommendation?.recommended_weekly_load ??
      targetLike.recommended_weekly_load ??
      null,
    recommended_baseline_load_range: targetLike.recommended_baseline_load_range ?? null,
    ...(heuristic.microcycles === undefined
      ? {}
      : {
          microcycles: heuristic.microcycles.map((microcycle) => ({
            ...(microcycle.week_start_date === undefined
              ? {}
              : { week_start_date: microcycle.week_start_date }),
            planned_weekly_load: microcycle.planned_weekly_load,
          })),
        }),
  };
}

function getWeeklyTolerance(
  heuristicLoad: number,
  tolerance: HeuristicComparisonToleranceConfig,
): number {
  return Math.max(
    tolerance.weekly_absolute_load_floor,
    heuristicLoad * tolerance.weekly_relative_pct,
  );
}

function getBlockTolerance(
  heuristicLoad: number,
  tolerance: HeuristicComparisonToleranceConfig,
): number {
  return Math.max(
    tolerance.block_absolute_load_floor,
    heuristicLoad * tolerance.block_relative_pct,
  );
}

/**
 * Compares weekly planned load against heuristic weekly targets and scalar dose guidance.
 *
 * The helper deliberately normalizes both sides to a small comparison artifact so contract
 * tests can assert alignment without snapshotting the full heuristic payload.
 *
 * @param input - Plan weeks, heuristic target payload, and tolerance settings
 * @returns Per-week and rolling-block error metrics suitable for invariant tests
 */
export function comparePlanLoadToHeuristic(input: {
  planWeeks: ReadonlyArray<AggregatedWeeklyPlannedLoad>;
  heuristic: HeuristicComparisonTarget | DeterministicProjectionPayload;
  toleranceClass?: HeuristicComparisonToleranceClass;
  toleranceOverrides?: Partial<HeuristicComparisonToleranceConfig>;
}): ComparePlanLoadToHeuristicResult {
  const normalizedHeuristic = normalizeHeuristicTarget(input.heuristic);
  const tolerance = resolveTolerance(input.toleranceClass ?? "moderate", input.toleranceOverrides);
  const heuristicWeeks =
    normalizedHeuristic.microcycles && normalizedHeuristic.microcycles.length > 0
      ? normalizedHeuristic.microcycles
      : input.planWeeks.map((week) => ({
          week_start_date: week.week_start_date,
          planned_weekly_load: normalizedHeuristic.recommended_weekly_load ?? null,
        }));

  const perWeek = Array.from(
    { length: Math.max(input.planWeeks.length, heuristicWeeks.length) },
    (_, index) => {
      const planWeek = input.planWeeks[index];
      const heuristicWeek = heuristicWeeks[index];

      if (!planWeek || !heuristicWeek) {
        return {
          week_index: index,
          week_start_date: planWeek?.week_start_date ?? heuristicWeek?.week_start_date ?? "",
          plan_load: planWeek?.planned_weekly_load ?? null,
          plan_load_status:
            planWeek?.planned_weekly_load_status ??
            (planWeek?.planned_weekly_load === null || planWeek === undefined
              ? "unavailable"
              : "complete"),
          heuristic_load: heuristicWeek?.planned_weekly_load ?? null,
          absolute_error_load: null,
          relative_error_pct: null,
          weekly_tolerance_load: null,
          within_tolerance: null,
        } satisfies PlanToHeuristicWeekComparison;
      }

      const planLoadStatus =
        planWeek.planned_weekly_load_status ??
        (planWeek.planned_weekly_load === null ? "unavailable" : "complete");
      if (
        planWeek.planned_weekly_load === null ||
        planLoadStatus !== "complete" ||
        heuristicWeek.planned_weekly_load === null
      ) {
        return {
          week_index: index,
          week_start_date: planWeek.week_start_date,
          plan_load: planWeek.planned_weekly_load,
          plan_load_status: planLoadStatus,
          heuristic_load: heuristicWeek.planned_weekly_load,
          absolute_error_load: null,
          relative_error_pct: null,
          weekly_tolerance_load: null,
          within_tolerance: null,
        } satisfies PlanToHeuristicWeekComparison;
      }

      const absoluteErrorLoad = Math.abs(
        planWeek.planned_weekly_load - heuristicWeek.planned_weekly_load,
      );
      const weeklyToleranceLoad = getWeeklyTolerance(heuristicWeek.planned_weekly_load, tolerance);
      const relativeErrorPct =
        heuristicWeek.planned_weekly_load <= 0
          ? 0
          : (absoluteErrorLoad / heuristicWeek.planned_weekly_load) * 100;

      return {
        week_index: index,
        week_start_date: planWeek.week_start_date,
        plan_load: planWeek.planned_weekly_load,
        plan_load_status: planLoadStatus,
        heuristic_load: heuristicWeek.planned_weekly_load,
        absolute_error_load: round1(absoluteErrorLoad),
        relative_error_pct: round1(relativeErrorPct),
        weekly_tolerance_load: round1(weeklyToleranceLoad),
        within_tolerance: absoluteErrorLoad <= weeklyToleranceLoad,
      } satisfies PlanToHeuristicWeekComparison;
    },
  );

  const pairedWeeks = perWeek.filter(
    (
      week,
    ): week is PlanToHeuristicWeekComparison & {
      plan_load: number;
      plan_load_status: "complete";
      heuristic_load: number;
      absolute_error_load: number;
      relative_error_pct: number;
      weekly_tolerance_load: number;
      within_tolerance: boolean;
    } =>
      week.plan_load_status === "complete" &&
      week.plan_load !== null &&
      week.heuristic_load !== null &&
      week.absolute_error_load !== null &&
      week.relative_error_pct !== null &&
      week.weekly_tolerance_load !== null &&
      week.within_tolerance !== null,
  );
  const pairCount = pairedWeeks.length;

  const rollingBlocks: PlanToHeuristicBlockComparison[] = [];
  for (let startIndex = 0; startIndex + 4 <= pairedWeeks.length; startIndex += 1) {
    const window = pairedWeeks.slice(startIndex, startIndex + 4);
    const firstWeek = window[0];
    const lastWeek = window[3];
    if (!firstWeek || !lastWeek) continue;
    const planLoad = window.reduce((sum, week) => sum + week.plan_load, 0);
    const heuristicLoad = window.reduce((sum, week) => sum + week.heuristic_load, 0);
    const absoluteErrorLoad = Math.abs(planLoad - heuristicLoad);
    const relativeErrorPct = heuristicLoad <= 0 ? 0 : (absoluteErrorLoad / heuristicLoad) * 100;
    const blockToleranceLoad = getBlockTolerance(heuristicLoad, tolerance);

    rollingBlocks.push({
      start_week_index: firstWeek.week_index,
      end_week_index: lastWeek.week_index,
      start_week_date: firstWeek.week_start_date,
      end_week_date: lastWeek.week_start_date,
      plan_load: round1(planLoad),
      heuristic_load: round1(heuristicLoad),
      absolute_error_load: round1(absoluteErrorLoad),
      relative_error_pct: round1(relativeErrorPct),
      block_tolerance_load: round1(blockToleranceLoad),
      within_tolerance: absoluteErrorLoad <= blockToleranceLoad,
    });
  }

  const averagePlanWeeklyLoad =
    pairCount === 0
      ? null
      : round1(pairedWeeks.reduce((sum, week) => sum + week.plan_load, 0) / pairCount);
  const averageHeuristicWeeklyLoad =
    pairCount === 0
      ? null
      : round1(pairedWeeks.reduce((sum, week) => sum + week.heuristic_load, 0) / pairCount);
  const averageAbsoluteWeeklyErrorLoad =
    pairCount === 0
      ? null
      : round1(pairedWeeks.reduce((sum, week) => sum + week.absolute_error_load, 0) / pairCount);
  const meanRelativeWeeklyErrorPct =
    pairCount === 0
      ? null
      : round1(pairedWeeks.reduce((sum, week) => sum + week.relative_error_pct, 0) / pairCount);

  const recommendedWeeklyLoad = normalizedHeuristic.recommended_weekly_load;
  const recommendedWeeklyLoadErrorLoad =
    recommendedWeeklyLoad === null ||
    recommendedWeeklyLoad === undefined ||
    averagePlanWeeklyLoad === null
      ? null
      : round1(Math.abs(averagePlanWeeklyLoad - recommendedWeeklyLoad));
  const baselineRange = normalizedHeuristic.recommended_baseline_load_range;

  return {
    tolerance,
    compared_week_count: pairCount,
    average_plan_weekly_load: averagePlanWeeklyLoad,
    average_heuristic_weekly_load: averageHeuristicWeeklyLoad,
    average_absolute_weekly_error_load: averageAbsoluteWeeklyErrorLoad,
    mean_relative_weekly_error_pct: meanRelativeWeeklyErrorPct,
    recommended_weekly_load_error_load: recommendedWeeklyLoadErrorLoad,
    average_within_baseline_range:
      baselineRange && averagePlanWeeklyLoad !== null
        ? averagePlanWeeklyLoad >= baselineRange.min && averagePlanWeeklyLoad <= baselineRange.max
        : null,
    per_week: perWeek,
    rolling_blocks: rollingBlocks,
  };
}

import type { DeterministicProjectionPayload } from "../projection/engine";
import type { AggregatedWeeklyPlannedLoad } from "./aggregateWeeklyPlannedLoad";

export type HeuristicComparisonToleranceClass = "tight" | "moderate" | "flexible";

export interface HeuristicComparisonToleranceConfig {
  weekly_absolute_tss_floor: number;
  weekly_relative_pct: number;
  block_absolute_tss_floor: number;
  block_relative_pct: number;
}

export interface HeuristicComparisonTarget {
  recommended_weekly_load?: number | null;
  recommended_baseline_tss_range?: { min: number; max: number } | null;
  microcycles?: Array<{
    week_start_date?: string;
    planned_weekly_tss: number;
  }>;
}

export interface PlanToHeuristicWeekComparison {
  week_index: number;
  week_start_date: string;
  plan_tss: number | null;
  heuristic_tss: number | null;
  absolute_error_tss: number | null;
  relative_error_pct: number | null;
  weekly_tolerance_tss: number | null;
  within_tolerance: boolean | null;
}

export interface PlanToHeuristicBlockComparison {
  start_week_index: number;
  end_week_index: number;
  start_week_date: string;
  end_week_date: string;
  plan_tss: number;
  heuristic_tss: number;
  absolute_error_tss: number;
  relative_error_pct: number;
  block_tolerance_tss: number;
  within_tolerance: boolean;
}

export interface ComparePlanLoadToHeuristicResult {
  tolerance: HeuristicComparisonToleranceConfig;
  compared_week_count: number;
  average_plan_weekly_tss: number;
  average_heuristic_weekly_tss: number;
  average_absolute_weekly_error_tss: number;
  mean_relative_weekly_error_pct: number;
  recommended_weekly_load_error_tss: number | null;
  average_within_baseline_range: boolean | null;
  per_week: PlanToHeuristicWeekComparison[];
  rolling_blocks: PlanToHeuristicBlockComparison[];
}

const TOLERANCE_BY_CLASS: Record<
  HeuristicComparisonToleranceClass,
  HeuristicComparisonToleranceConfig
> = {
  tight: {
    weekly_absolute_tss_floor: 20,
    weekly_relative_pct: 0.08,
    block_absolute_tss_floor: 32,
    block_relative_pct: 0.08,
  },
  moderate: {
    weekly_absolute_tss_floor: 25,
    weekly_relative_pct: 0.12,
    block_absolute_tss_floor: 40,
    block_relative_pct: 0.1,
  },
  flexible: {
    weekly_absolute_tss_floor: 30,
    weekly_relative_pct: 0.15,
    block_absolute_tss_floor: 48,
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
    recommended_baseline_tss_range: targetLike.recommended_baseline_tss_range ?? null,
    microcycles: heuristic.microcycles?.map((microcycle) => ({
      week_start_date: microcycle.week_start_date,
      planned_weekly_tss: microcycle.planned_weekly_tss,
    })),
  };
}

function getWeeklyTolerance(
  heuristicTss: number,
  tolerance: HeuristicComparisonToleranceConfig,
): number {
  return Math.max(
    tolerance.weekly_absolute_tss_floor,
    heuristicTss * tolerance.weekly_relative_pct,
  );
}

function getBlockTolerance(
  heuristicTss: number,
  tolerance: HeuristicComparisonToleranceConfig,
): number {
  return Math.max(tolerance.block_absolute_tss_floor, heuristicTss * tolerance.block_relative_pct);
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
          planned_weekly_tss: normalizedHeuristic.recommended_weekly_load ?? 0,
        }));

  const pairCount = Math.min(input.planWeeks.length, heuristicWeeks.length);
  const perWeek = Array.from(
    { length: Math.max(input.planWeeks.length, heuristicWeeks.length) },
    (_, index) => {
      const planWeek = input.planWeeks[index];
      const heuristicWeek = heuristicWeeks[index];

      if (!planWeek || !heuristicWeek) {
        return {
          week_index: index,
          week_start_date: planWeek?.week_start_date ?? heuristicWeek?.week_start_date ?? "",
          plan_tss: planWeek?.planned_weekly_tss ?? null,
          heuristic_tss: heuristicWeek?.planned_weekly_tss ?? null,
          absolute_error_tss: null,
          relative_error_pct: null,
          weekly_tolerance_tss: null,
          within_tolerance: null,
        } satisfies PlanToHeuristicWeekComparison;
      }

      const absoluteErrorTss = Math.abs(
        planWeek.planned_weekly_tss - heuristicWeek.planned_weekly_tss,
      );
      const weeklyToleranceTss = getWeeklyTolerance(heuristicWeek.planned_weekly_tss, tolerance);
      const relativeErrorPct =
        heuristicWeek.planned_weekly_tss <= 0
          ? 0
          : (absoluteErrorTss / heuristicWeek.planned_weekly_tss) * 100;

      return {
        week_index: index,
        week_start_date: planWeek.week_start_date,
        plan_tss: planWeek.planned_weekly_tss,
        heuristic_tss: heuristicWeek.planned_weekly_tss,
        absolute_error_tss: round1(absoluteErrorTss),
        relative_error_pct: round1(relativeErrorPct),
        weekly_tolerance_tss: round1(weeklyToleranceTss),
        within_tolerance: absoluteErrorTss <= weeklyToleranceTss,
      } satisfies PlanToHeuristicWeekComparison;
    },
  );

  const pairedWeeks = perWeek.filter(
    (
      week,
    ): week is PlanToHeuristicWeekComparison & {
      plan_tss: number;
      heuristic_tss: number;
      absolute_error_tss: number;
      relative_error_pct: number;
      weekly_tolerance_tss: number;
      within_tolerance: boolean;
    } => week.plan_tss !== null && week.heuristic_tss !== null,
  );

  const rollingBlocks: PlanToHeuristicBlockComparison[] = [];
  for (let startIndex = 0; startIndex + 4 <= pairedWeeks.length; startIndex += 1) {
    const window = pairedWeeks.slice(startIndex, startIndex + 4);
    const planTss = window.reduce((sum, week) => sum + week.plan_tss, 0);
    const heuristicTss = window.reduce((sum, week) => sum + week.heuristic_tss, 0);
    const absoluteErrorTss = Math.abs(planTss - heuristicTss);
    const relativeErrorPct = heuristicTss <= 0 ? 0 : (absoluteErrorTss / heuristicTss) * 100;
    const blockToleranceTss = getBlockTolerance(heuristicTss, tolerance);

    rollingBlocks.push({
      start_week_index: window[0]!.week_index,
      end_week_index: window[3]!.week_index,
      start_week_date: window[0]!.week_start_date,
      end_week_date: window[3]!.week_start_date,
      plan_tss: round1(planTss),
      heuristic_tss: round1(heuristicTss),
      absolute_error_tss: round1(absoluteErrorTss),
      relative_error_pct: round1(relativeErrorPct),
      block_tolerance_tss: round1(blockToleranceTss),
      within_tolerance: absoluteErrorTss <= blockToleranceTss,
    });
  }

  const averagePlanWeeklyTss =
    pairCount === 0
      ? 0
      : round1(pairedWeeks.reduce((sum, week) => sum + week.plan_tss, 0) / pairCount);
  const averageHeuristicWeeklyTss =
    pairCount === 0
      ? 0
      : round1(pairedWeeks.reduce((sum, week) => sum + week.heuristic_tss, 0) / pairCount);
  const averageAbsoluteWeeklyErrorTss =
    pairCount === 0
      ? 0
      : round1(pairedWeeks.reduce((sum, week) => sum + week.absolute_error_tss, 0) / pairCount);
  const meanRelativeWeeklyErrorPct =
    pairCount === 0
      ? 0
      : round1(pairedWeeks.reduce((sum, week) => sum + week.relative_error_pct, 0) / pairCount);

  const recommendedWeeklyLoad = normalizedHeuristic.recommended_weekly_load;
  const recommendedWeeklyLoadErrorTss =
    recommendedWeeklyLoad === null || recommendedWeeklyLoad === undefined
      ? null
      : round1(Math.abs(averagePlanWeeklyTss - recommendedWeeklyLoad));
  const baselineRange = normalizedHeuristic.recommended_baseline_tss_range;

  return {
    tolerance,
    compared_week_count: pairCount,
    average_plan_weekly_tss: averagePlanWeeklyTss,
    average_heuristic_weekly_tss: averageHeuristicWeeklyTss,
    average_absolute_weekly_error_tss: averageAbsoluteWeeklyErrorTss,
    mean_relative_weekly_error_pct: meanRelativeWeeklyErrorPct,
    recommended_weekly_load_error_tss: recommendedWeeklyLoadErrorTss,
    average_within_baseline_range: baselineRange
      ? averagePlanWeeklyTss >= baselineRange.min && averagePlanWeeklyTss <= baselineRange.max
      : null,
    per_week: perWeek,
    rolling_blocks: rollingBlocks,
  };
}

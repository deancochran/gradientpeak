import {
  type CanonicalActivityCategory,
  canonicalActivityCategorySchema,
} from "../../../schemas/activity-category";
import type { ActivityCategoryLoadState } from "../activity-categories";
import {
  advanceActivityCategoryLoadState,
  applyLoadDecay,
  calculateMechanicalFatigueScore,
} from "./peripheralLoad";
import {
  calculateSystemicLoadMetrics,
  type DailyActivityCategoryLoadInput,
  type HistoricalDailyActivityCategoryLoad,
} from "./systemicLoad";

const SYSTEMIC_LongTermLoad_TAU_DAYS = 42;
const SYSTEMIC_RecentLoad_TAU_DAYS = 7;

export interface DailyLoadState {
  longTermLoad: number;
  recentLoad: number;
  loadBalance: number;
  systemic_load_7d: number;
  systemic_load_28d: number;
  activity_category_load_states: Partial<
    Record<CanonicalActivityCategory, ActivityCategoryLoadState>
  >;
  mechanical_fatigue_score: number;
  readiness_score: number;
}

export interface BuildDailyLoadStateInput {
  dailyActivityCategoryLoads: DailyActivityCategoryLoadInput[];
  history?: HistoricalDailyActivityCategoryLoad[];
  previousState?: Partial<
    Pick<DailyLoadState, "longTermLoad" | "recentLoad" | "activity_category_load_states">
  >;
  activityCategoryLoadHistory?: Partial<Record<CanonicalActivityCategory, number[]>>;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDailyLoadForActivityCategory(
  activity_category: CanonicalActivityCategory,
  dailyActivityCategoryLoads: DailyActivityCategoryLoadInput[],
): number {
  return dailyActivityCategoryLoads
    .filter((entry) => entry.activity_category === activity_category)
    .reduce((sum, entry) => sum + entry.load, 0);
}

export function buildDailyLoadState(input: BuildDailyLoadStateInput): DailyLoadState {
  const systemic = calculateSystemicLoadMetrics({
    dailyActivityCategoryLoads: input.dailyActivityCategoryLoads,
    history: input.history,
  });
  const nextLongTermLoad = applyLoadDecay(
    input.previousState?.longTermLoad ?? 0,
    systemic.daily_systemic_load,
    SYSTEMIC_LongTermLoad_TAU_DAYS,
  );
  const nextRecentLoad = applyLoadDecay(
    input.previousState?.recentLoad ?? 0,
    systemic.daily_systemic_load,
    SYSTEMIC_RecentLoad_TAU_DAYS,
  );
  const activityCategoryLoadStates: Partial<
    Record<CanonicalActivityCategory, ActivityCategoryLoadState>
  > = {};

  for (const activity_category of canonicalActivityCategorySchema.options) {
    const dailyLoad = getDailyLoadForActivityCategory(
      activity_category,
      input.dailyActivityCategoryLoads,
    );
    const previousActivityCategoryState =
      input.previousState?.activity_category_load_states?.[activity_category];
    const recentLoads = input.activityCategoryLoadHistory?.[activity_category] ?? [];

    activityCategoryLoadStates[activity_category] = advanceActivityCategoryLoadState({
      activity_category,
      dailyLoad,
      previousState: previousActivityCategoryState,
      recentLoads,
    });
  }

  const loadBalance = nextLongTermLoad - nextRecentLoad;
  const mechanicalFatigueScore = calculateMechanicalFatigueScore({
    dailyActivityCategoryLoads: input.dailyActivityCategoryLoads,
    history: input.history,
  });
  const readinessScore = clamp(0.5 + loadBalance / 50 - mechanicalFatigueScore / 250, 0, 1);

  return {
    longTermLoad: round(nextLongTermLoad),
    recentLoad: round(nextRecentLoad),
    loadBalance: round(loadBalance),
    systemic_load_7d: systemic.systemic_load_7d,
    systemic_load_28d: systemic.systemic_load_28d,
    activity_category_load_states: activityCategoryLoadStates,
    mechanical_fatigue_score: round(mechanicalFatigueScore),
    readiness_score: round(readinessScore),
  };
}

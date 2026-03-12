import {
  canonicalSportSchema,
  type CanonicalSport,
} from "../../../schemas/sport";
import type { SportLoadState } from "../sports";
import {
  applyLoadDecay,
  advanceSportLoadState,
  calculateMechanicalFatigueScore,
} from "./peripheralLoad";
import {
  calculateSystemicLoadMetrics,
  type DailySportLoadInput,
  type HistoricalDailySportLoad,
} from "./systemicLoad";

const SYSTEMIC_CTL_TAU_DAYS = 42;
const SYSTEMIC_ATL_TAU_DAYS = 7;

export interface DailyLoadState {
  ctl: number;
  atl: number;
  tsb: number;
  systemic_load_7d: number;
  systemic_load_28d: number;
  sport_load_states: Partial<Record<CanonicalSport, SportLoadState>>;
  mechanical_fatigue_score: number;
  readiness_score: number;
}

export interface BuildDailyLoadStateInput {
  dailySportLoads: DailySportLoadInput[];
  history?: HistoricalDailySportLoad[];
  previousState?: Partial<
    Pick<DailyLoadState, "ctl" | "atl" | "sport_load_states">
  >;
  sportLoadHistory?: Partial<Record<CanonicalSport, number[]>>;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDailyLoadForSport(
  sport: CanonicalSport,
  dailySportLoads: DailySportLoadInput[],
): number {
  return dailySportLoads
    .filter((entry) => entry.sport === sport)
    .reduce((sum, entry) => sum + entry.load, 0);
}

export function buildDailyLoadState(
  input: BuildDailyLoadStateInput,
): DailyLoadState {
  const systemic = calculateSystemicLoadMetrics({
    dailySportLoads: input.dailySportLoads,
    history: input.history,
  });
  const nextCtl = applyLoadDecay(
    input.previousState?.ctl ?? 0,
    systemic.daily_systemic_load,
    SYSTEMIC_CTL_TAU_DAYS,
  );
  const nextAtl = applyLoadDecay(
    input.previousState?.atl ?? 0,
    systemic.daily_systemic_load,
    SYSTEMIC_ATL_TAU_DAYS,
  );
  const sportLoadStates: Partial<Record<CanonicalSport, SportLoadState>> = {};

  for (const sport of canonicalSportSchema.options) {
    const dailyLoad = getDailyLoadForSport(sport, input.dailySportLoads);
    const previousSportState = input.previousState?.sport_load_states?.[sport];
    const recentLoads = input.sportLoadHistory?.[sport] ?? [];

    sportLoadStates[sport] = advanceSportLoadState({
      sport,
      dailyLoad,
      previousState: previousSportState,
      recentLoads,
    });
  }

  const tsb = nextCtl - nextAtl;
  const mechanicalFatigueScore = calculateMechanicalFatigueScore({
    dailySportLoads: input.dailySportLoads,
    history: input.history,
  });
  const readinessScore = clamp(
    0.5 + tsb / 50 - mechanicalFatigueScore / 250,
    0,
    1,
  );

  return {
    ctl: round(nextCtl),
    atl: round(nextAtl),
    tsb: round(tsb),
    systemic_load_7d: systemic.systemic_load_7d,
    systemic_load_28d: systemic.systemic_load_28d,
    sport_load_states: sportLoadStates,
    mechanical_fatigue_score: round(mechanicalFatigueScore),
    readiness_score: round(readinessScore),
  };
}

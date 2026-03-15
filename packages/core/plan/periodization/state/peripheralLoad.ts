import type { CanonicalSport } from "../../../schemas/sport";
import { getSportModelConfig, type SportLoadState } from "../sports";
import type { DailySportLoadInput } from "./systemicLoad";

const DEFAULT_CTL_TAU_DAYS = 42;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function averageWindow(values: number[], windowSize: number): number {
  const window = values.slice(-windowSize);

  if (window.length === 0) {
    return 0;
  }

  return window.reduce((sum, value) => sum + value, 0) / window.length;
}

export function applyLoadDecay(
  previousLoad: number,
  incomingLoad: number,
  tauDays: number,
): number {
  const decayFactor = Math.exp(-1 / tauDays);
  return previousLoad * decayFactor + incomingLoad * (1 - decayFactor);
}

export function advanceSportLoadState(input: {
  sport: CanonicalSport;
  dailyLoad: number;
  previousState?: Pick<SportLoadState, "ctl" | "atl">;
  recentLoads?: number[];
}): SportLoadState {
  const config = getSportModelConfig(input.sport);
  const loadSeries = [...(input.recentLoads ?? []), input.dailyLoad];
  const nextCtl = applyLoadDecay(
    input.previousState?.ctl ?? 0,
    input.dailyLoad,
    config.ctl_tau_days || DEFAULT_CTL_TAU_DAYS,
  );
  const nextAtl = applyLoadDecay(
    input.previousState?.atl ?? 0,
    input.dailyLoad,
    config.atl_tau_days,
  );
  const acuteLoadAverage = averageWindow(loadSeries, 7);
  const chronicLoadAverage = averageWindow(loadSeries, 28);
  const acwr =
    chronicLoadAverage > 0
      ? acuteLoadAverage / chronicLoadAverage
      : acuteLoadAverage > 0
        ? acuteLoadAverage
        : 0;

  return {
    sport: input.sport,
    ctl: round(nextCtl),
    atl: round(nextAtl),
    tsb: round(nextCtl - nextAtl),
    daily_load: round(input.dailyLoad),
    acute_load_average_7d: round(acuteLoadAverage),
    chronic_load_average_28d: round(chronicLoadAverage),
    acwr: round(acwr),
    impact_load: round(input.dailyLoad * config.impact_factor),
    mechanical_load: round(input.dailyLoad * config.mechanical_multiplier),
  };
}

export function calculateMechanicalFatigueScore(input: {
  dailySportLoads: DailySportLoadInput[];
  history?: Array<{ sport_loads: DailySportLoadInput[] }>;
}): number {
  const mechanicalSeries = [
    ...(input.history ?? []),
    { sport_loads: input.dailySportLoads },
  ].map((day) =>
    day.sport_loads.reduce((sum, load) => {
      const config = getSportModelConfig(load.sport);
      return sum + load.load * config.mechanical_multiplier;
    }, 0),
  );

  return round(averageWindow(mechanicalSeries, 7));
}

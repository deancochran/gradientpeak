import type { CanonicalSport } from "../../../schemas/sport";
import { getSportModelConfig } from "../sports";

export interface DailySportLoadInput {
  sport: CanonicalSport;
  load: number;
}

export interface HistoricalDailySportLoad {
  sport_loads: DailySportLoadInput[];
}

export interface SystemicLoadMetrics {
  daily_systemic_load: number;
  systemic_load_7d: number;
  systemic_load_28d: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sumWindow(values: number[], windowSize: number): number {
  return values.slice(-windowSize).reduce((sum, value) => sum + value, 0);
}

function sumSystemicLoad(loads: DailySportLoadInput[]): number {
  return loads.reduce((sum, load) => {
    const config = getSportModelConfig(load.sport);
    return sum + load.load * config.impact_factor;
  }, 0);
}

export function calculateSystemicLoadMetrics(input: {
  dailySportLoads: DailySportLoadInput[];
  history?: HistoricalDailySportLoad[];
}): SystemicLoadMetrics {
  const systemicSeries = [...(input.history ?? []), { sport_loads: input.dailySportLoads }].map(
    (day) => sumSystemicLoad(day.sport_loads),
  );
  const dailySystemicLoad = systemicSeries.at(-1) ?? 0;

  return {
    daily_systemic_load: round(dailySystemicLoad),
    systemic_load_7d: round(sumWindow(systemicSeries, 7)),
    systemic_load_28d: round(sumWindow(systemicSeries, 28)),
  };
}

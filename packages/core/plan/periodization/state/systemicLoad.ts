import type { CanonicalActivityCategory } from "../../../schemas/activity-category";
import { getActivityCategoryModelConfig } from "../activity-categories";

export interface DailyActivityCategoryLoadInput {
  activity_category: CanonicalActivityCategory;
  load: number;
}

export interface HistoricalDailyActivityCategoryLoad {
  activity_category_loads: DailyActivityCategoryLoadInput[];
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

function sumSystemicLoad(loads: DailyActivityCategoryLoadInput[]): number {
  return loads.reduce((sum, load) => {
    const config = getActivityCategoryModelConfig(load.activity_category);
    return sum + load.load * config.impact_factor;
  }, 0);
}

export function calculateSystemicLoadMetrics(input: {
  dailyActivityCategoryLoads: DailyActivityCategoryLoadInput[];
  history?: HistoricalDailyActivityCategoryLoad[];
}): SystemicLoadMetrics {
  const systemicSeries = [
    ...(input.history ?? []),
    { activity_category_loads: input.dailyActivityCategoryLoads },
  ].map((day) => sumSystemicLoad(day.activity_category_loads));
  const dailySystemicLoad = systemicSeries.at(-1) ?? 0;

  return {
    daily_systemic_load: round(dailySystemicLoad),
    systemic_load_7d: round(sumWindow(systemicSeries, 7)),
    systemic_load_28d: round(sumWindow(systemicSeries, 28)),
  };
}

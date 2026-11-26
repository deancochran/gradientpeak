import type { ActivityCategoryModelConfig } from "./contracts";

export const runActivityCategoryModelConfig: ActivityCategoryModelConfig = {
  activity_category: "run",
  longTermLoad_tau_days: 42,
  recentLoad_tau_days: 10,
  acwr_ceiling: 1.2,
  impact_factor: 1,
  mechanical_multiplier: 1,
  taper_days: {
    min: 7,
    max: 28,
  },
  weekly_load_per_hour: 65,
};

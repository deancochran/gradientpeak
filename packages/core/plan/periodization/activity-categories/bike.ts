import type { ActivityCategoryModelConfig } from "./contracts";

export const bikeActivityCategoryModelConfig: ActivityCategoryModelConfig = {
  activity_category: "bike",
  longTermLoad_tau_days: 42,
  recentLoad_tau_days: 7,
  acwr_ceiling: 1.4,
  impact_factor: 0.35,
  mechanical_multiplier: 0.35,
  taper_days: {
    min: 5,
    max: 28,
  },
  weekly_load_per_hour: 70,
};

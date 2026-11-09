import type { ActivityCategoryModelConfig } from "./contracts";

export const swimActivityCategoryModelConfig: ActivityCategoryModelConfig = {
  activity_category: "swim",
  longTermLoad_tau_days: 42,
  recentLoad_tau_days: 6,
  acwr_ceiling: 1.5,
  impact_factor: 0.2,
  mechanical_multiplier: 0.2,
  taper_days: {
    min: 5,
    max: 21,
  },
  weekly_load_per_hour: 55,
};

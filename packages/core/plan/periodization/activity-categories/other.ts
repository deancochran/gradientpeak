import type { ActivityCategoryModelConfig } from "./contracts";

export const otherActivityCategoryModelConfig: ActivityCategoryModelConfig = {
  activity_category: "other",
  longTermLoad_tau_days: 42,
  recentLoad_tau_days: 7,
  acwr_ceiling: 1.25,
  impact_factor: 0.6,
  mechanical_multiplier: 0.6,
  taper_days: {
    min: 5,
    max: 21,
  },
  weekly_load_per_hour: 60,
};

import type { ActivityCategoryModelConfig } from "./contracts";

export const runActivityCategoryModelConfig: ActivityCategoryModelConfig = {
  activity_category: "run",
  ctl_tau_days: 42,
  atl_tau_days: 10,
  acwr_ceiling: 1.2,
  impact_factor: 1,
  mechanical_multiplier: 1,
  taper_days: {
    min: 7,
    max: 28,
  },
  weekly_tss_per_hour: 65,
};

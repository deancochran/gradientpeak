import type { ActivityCategoryModelConfig } from "./contracts";

export const otherActivityCategoryModelConfig: ActivityCategoryModelConfig = {
  activity_category: "other",
  ctl_tau_days: 42,
  atl_tau_days: 7,
  acwr_ceiling: 1.25,
  impact_factor: 0.6,
  mechanical_multiplier: 0.6,
  taper_days: {
    min: 5,
    max: 21,
  },
  weekly_tss_per_hour: 60,
};

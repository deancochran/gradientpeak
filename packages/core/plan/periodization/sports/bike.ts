import type { SportModelConfig } from "./contracts";

export const bikeSportModelConfig: SportModelConfig = {
  sport: "bike",
  ctl_tau_days: 42,
  atl_tau_days: 7,
  acwr_ceiling: 1.4,
  impact_factor: 0.35,
  mechanical_multiplier: 0.35,
  taper_days: {
    min: 5,
    max: 28,
  },
  weekly_tss_per_hour: 70,
};

import type { SportModelConfig } from "./contracts";

export const swimSportModelConfig: SportModelConfig = {
  sport: "swim",
  ctl_tau_days: 42,
  atl_tau_days: 6,
  acwr_ceiling: 1.5,
  impact_factor: 0.2,
  mechanical_multiplier: 0.2,
  taper_days: {
    min: 5,
    max: 21,
  },
  weekly_tss_per_hour: 55,
};

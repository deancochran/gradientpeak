import type { SportModelConfig } from "./contracts";

export const strengthSportModelConfig: SportModelConfig = {
  sport: "strength",
  ctl_tau_days: 42,
  atl_tau_days: 8,
  acwr_ceiling: 1.15,
  impact_factor: 0.8,
  mechanical_multiplier: 1.25,
  taper_days: {
    min: 3,
    max: 10,
  },
  weekly_tss_per_hour: 50,
};

import type { SportModelConfig } from "./contracts";

export const runSportModelConfig: SportModelConfig = {
  sport: "run",
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

import type { CanonicalSport } from "../../../schemas/sport";

export interface SportModelConfig {
  sport: CanonicalSport;
  ctl_tau_days: number;
  atl_tau_days: number;
  acwr_ceiling: number;
  impact_factor: number;
  mechanical_multiplier: number;
  taper_days: {
    min: number;
    max: number;
  };
  weekly_tss_per_hour: number;
}

export interface SportLoadState {
  sport: CanonicalSport;
  ctl: number;
  atl: number;
  tsb: number;
  daily_load: number;
  acute_load_average_7d: number;
  chronic_load_average_28d: number;
  acwr: number;
  impact_load: number;
  mechanical_load: number;
}

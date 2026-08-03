import type { CanonicalActivityCategory } from "../../../schemas/activity-category";

export interface ActivityCategoryModelConfig {
  activity_category: CanonicalActivityCategory;
  longTermLoad_tau_days: number;
  recentLoad_tau_days: number;
  acwr_ceiling: number;
  impact_factor: number;
  mechanical_multiplier: number;
  taper_days: {
    min: number;
    max: number;
  };
  weekly_load_per_hour: number;
}

export interface ActivityCategoryLoadState {
  activity_category: CanonicalActivityCategory;
  longTermLoad: number;
  recentLoad: number;
  loadBalance: number;
  daily_load: number;
  acute_load_average_7d: number;
  chronic_load_average_28d: number;
  acwr: number;
  impact_load: number;
  mechanical_load: number;
}

export interface ProjectionChartPoint {
  date: string;
  predicted_load_tss: number;
  predicted_fitness_ctl: number;
}

export type OptimizationProfile = "outcome_first" | "balanced" | "sustainable";

export interface ProjectionGoalMarker {
  id: string;
  name: string;
  target_date: string;
  priority: number;
}

export interface ProjectionPeriodizationPhase {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  target_weekly_tss_min: number;
  target_weekly_tss_max: number;
}

export interface ProjectionMicrocycle {
  id?: string;
  week_start_date: string;
  week_end_date: string;
  phase: string;
  pattern: "ramp" | "deload" | "taper" | "event" | "recovery";
  planned_weekly_tss: number;
  projected_ctl: number;
  metadata?: ProjectionWeekMetadata;
}

export interface ProjectionWeekMetadata {
  recovery: {
    active: boolean;
    goal_ids: string[];
    reduction_factor: number;
  };
  tss_ramp: {
    previous_week_tss: number;
    requested_weekly_tss: number;
    applied_weekly_tss: number;
    max_weekly_tss_ramp_pct: number;
    clamped: boolean;
  };
  ctl_ramp: {
    requested_ctl_ramp: number;
    applied_ctl_ramp: number;
    max_ctl_ramp_per_week: number;
    clamped: boolean;
  };
}

export interface ProjectionConstraintSummary {
  normalized_creation_config: {
    optimization_profile: OptimizationProfile;
    post_goal_recovery_days: number;
    max_weekly_tss_ramp_pct: number;
    max_ctl_ramp_per_week: number;
  };
  tss_ramp_clamp_weeks: number;
  ctl_ramp_clamp_weeks: number;
  recovery_weeks: number;
}

export interface ProjectionRecoverySegment {
  goal_id: string;
  goal_name: string;
  start_date: string;
  end_date: string;
}

export interface ProjectionChartPayload {
  start_date: string;
  end_date: string;
  points: ProjectionChartPoint[];
  goal_markers: ProjectionGoalMarker[];
  periodization_phases: ProjectionPeriodizationPhase[];
  microcycles: ProjectionMicrocycle[];
  recovery_segments?: ProjectionRecoverySegment[];
  constraint_summary?: ProjectionConstraintSummary;
}

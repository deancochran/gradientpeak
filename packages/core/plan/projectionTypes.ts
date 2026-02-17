import type {
  DeterministicProjectionMicrocycle,
  ProjectionDiagnostics,
  DeterministicProjectionPoint,
  ProjectionRecoverySegment,
  ProjectionSafetyConfig,
} from "./projectionCalculations";

export interface ProjectionPeriodizationPhase {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  target_weekly_tss_min: number;
  target_weekly_tss_max: number;
}

export interface ProjectionGoalMarker {
  id: string;
  name: string;
  target_date: string;
  priority: number;
}

export type ReadinessBand = "low" | "medium" | "high";
export type DemandConfidence = "high" | "medium" | "low";

export interface DemandBand {
  min: number;
  target: number;
  stretch: number;
}

export interface ProjectionDemandGap {
  required_weekly_tss_target: number;
  feasible_weekly_tss_applied: number;
  unmet_weekly_tss: number;
  unmet_ratio: number;
}

export interface ProjectionFeasibilityMetadata {
  demand_gap: ProjectionDemandGap;
  readiness_band: ReadinessBand;
  dominant_limiters: string[];
  readiness_score?: number;
  readiness_components?: {
    load_state: number;
    intensity_balance: number;
    specificity: number;
    execution_confidence: number;
  };
  projection_uncertainty?: {
    tss_low: number;
    tss_likely: number;
    tss_high: number;
    confidence: number;
  };
  readiness_rationale_codes?: string[];
}

export interface NoHistoryProjectionMetadata {
  projection_floor_applied: boolean;
  projection_floor_values: {
    start_ctl: number;
    start_weekly_tss: number;
  } | null;
  fitness_level: "weak" | "strong" | null;
  fitness_inference_reasons: string[];
  projection_floor_confidence: "high" | "medium" | "low" | null;
  floor_clamped_by_availability: boolean;
  starting_ctl_for_projection?: number | null;
  starting_weekly_tss_for_projection?: number | null;
  required_event_demand_range?: DemandBand | null;
  required_peak_weekly_tss?: DemandBand | null;
  demand_confidence?: DemandConfidence | null;
  projection_feasibility?: ProjectionFeasibilityMetadata | null;
  evidence_confidence?: {
    score: number;
    state: "none" | "sparse" | "stale" | "rich";
    reasons: string[];
  } | null;
}

export interface ProjectionConstraintSummary {
  normalized_creation_config: ProjectionSafetyConfig;
  tss_ramp_clamp_weeks: number;
  ctl_ramp_clamp_weeks: number;
  recovery_weeks: number;
  starting_state?: {
    starting_ctl: number;
    starting_atl: number;
    starting_tsb: number;
    starting_state_is_prior: boolean;
  };
}

export interface ProjectionChartPayload {
  start_date: string;
  end_date: string;
  points: DeterministicProjectionPoint[];
  display_points?: DeterministicProjectionPoint[];
  goal_markers: ProjectionGoalMarker[];
  periodization_phases: ProjectionPeriodizationPhase[];
  microcycles: DeterministicProjectionMicrocycle[];
  recovery_segments?: ProjectionRecoverySegment[];
  constraint_summary?: ProjectionConstraintSummary;
  no_history?: NoHistoryProjectionMetadata;
  readiness_score?: number;
  readiness_confidence?: number;
  readiness_rationale_codes?: string[];
  capacity_envelope?: {
    envelope_score: number;
    envelope_state: "inside" | "edge" | "outside";
    limiting_factors: string[];
  };
  feasibility_band?:
    | "feasible"
    | "stretch"
    | "aggressive"
    | "nearly_impossible"
    | "infeasible";
  risk_level?: "low" | "moderate" | "high" | "extreme";
  risk_flags?: string[];
  caps_applied?: string[];
  projection_diagnostics?: ProjectionDiagnostics;
  goal_assessments?: Array<{
    goal_id: string;
    priority: number;
    feasibility_band:
      | "feasible"
      | "stretch"
      | "aggressive"
      | "nearly_impossible"
      | "infeasible";
    target_scores: Array<{
      kind: string;
      score_0_100: number;
      unmet_gap?: number;
      rationale_codes: string[];
    }>;
    conflict_notes: string[];
  }>;
}

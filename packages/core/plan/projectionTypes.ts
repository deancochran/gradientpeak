import type {
  FeasibilityAssessment,
  ReferenceTrajectory,
  TrajectoryMode,
} from "../schemas/planning";
import type { DailyLoadDistributionPoint } from "./dailyLoadDistribution";
import { deterministicUuidFromSeed } from "./normalizeGoalInput";
import type {
  DeterministicProjectionMicrocycle,
  DeterministicProjectionPayload,
  DeterministicProjectionPoint,
  ProjectionActivityCategoryLoadState,
  ProjectionDiagnostics,
  ProjectionDoseRecommendation,
  ProjectionLoadResolutionSummary,
  ProjectionRecoverySegment,
  ProjectionSafetyConfig,
} from "./projectionCalculations";
import type { TrainingPrescription } from "./trainingPrescription";
import type { WeeklyAllocation } from "./weeklyAllocation";

export interface ProjectionPeriodizationPhase {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  target_weekly_load_min: number;
  target_weekly_load_max: number;
}

export type ProjectionMicrocycleWithDeterministicId = DeterministicProjectionMicrocycle & {
  id: string;
};

export interface ProjectionChartAssemblyPlan {
  start_date: string;
  end_date: string;
  blocks: Array<{
    name: string;
    start_date: string;
    end_date: string;
    target_weekly_load_range?: {
      min: number;
      max: number;
    };
  }>;
}

export interface ProjectionGoalMarker {
  id: string;
  name: string;
  target_date: string;
  priority: number;
}

export type ReadinessBand = "low" | "medium" | "high";
export type DemandConfidence = "high" | "medium" | "low";
export type LowReadinessLimiterMode = "timeline_limited" | "capacity_limited" | "mixed_limiters";

export interface DemandBand {
  min: number;
  target: number;
  stretch: number;
}

export interface ProjectionDemandGap {
  required_weekly_load_target: number;
  feasible_weekly_load_applied: number;
  unmet_weekly_load: number;
  unmet_ratio: number;
}

export interface ProjectionFeasibilityMetadata {
  demand_gap: ProjectionDemandGap;
  readiness_band: ReadinessBand;
  dominant_limiters: string[];
  low_readiness_limiter_mode?: LowReadinessLimiterMode | null;
  readiness_score?: number;
  readiness_components?: {
    load_state: number;
    intensity_balance: number;
    specificity: number;
    execution_confidence: number;
  };
  projection_uncertainty?: {
    load_low: number;
    load_likely: number;
    load_high: number;
    confidence: number;
  };
  readiness_rationale_codes?: string[];
}

export interface NoHistoryProjectionMetadata {
  projection_floor_applied: boolean;
  projection_floor_values: {
    start_longTermLoad: number;
    start_weekly_load: number;
  } | null;
  fitness_level: "weak" | "strong" | null;
  fitness_signal_0_1?: number | null;
  fitness_inference_reasons: string[];
  projection_floor_confidence: "high" | "medium" | "low" | null;
  floor_clamped_by_availability: boolean;
  starting_longTermLoad_for_projection?: number | null;
  starting_weekly_load_for_projection?: number | null;
  goal_demand_score_0_1?: number;
  required_event_demand_range?: DemandBand | null;
  required_peak_weekly_load?: DemandBand | null;
  demand_confidence?: DemandConfidence | null;
  projection_feasibility?: ProjectionFeasibilityMetadata | null;
  evidence_confidence?: {
    score: number;
    state: "none" | "sparse" | "stale" | "rich";
    support_signal: number;
    evidence_recency_days: number;
    reasons: string[];
  } | null;
  capability_factors?: {
    aerobic_base: number;
    durability: number;
    recovery_speed: number;
    intensity_support: number;
    evidence_quality: number;
  } | null;
}

export interface ProjectionConstraintSummary {
  normalized_creation_config: ProjectionSafetyConfig;
  load_ramp_clamp_weeks: number;
  longTermLoad_ramp_clamp_weeks: number;
  recovery_weeks: number;
  starting_state?: {
    starting_longTermLoad: number;
    starting_recentLoad: number;
    starting_loadBalance: number;
    starting_state_is_prior: boolean;
  };
}

export interface ProjectionInferredCurrentState {
  mean: {
    longTermLoad: number;
    recentLoad: number;
    loadBalance: number;
    slb: number;
    durability: number;
    readiness: number;
  };
  uncertainty: {
    state_variance: number;
    confidence: number;
  };
  evidence_quality: {
    score: number;
    missingness_ratio: number;
  };
  as_of: string;
  metadata: {
    updated_at: string;
    missingness_counter: number;
    evidence_counter: number;
  };
}

export type ProjectionPredictionUncertainty = Record<string, unknown>;

export type ProjectionGoalTargetDistribution = Record<string, unknown>;

export interface ProjectionChartPayload {
  start_date: string;
  end_date: string;
  points: DeterministicProjectionPoint[];
  /** Daily recommended load suitable for day-level charts. */
  daily_load_points?: DailyLoadDistributionPoint[];
  goal_markers: ProjectionGoalMarker[];
  periodization_phases: ProjectionPeriodizationPhase[];
  microcycles: DeterministicProjectionMicrocycle[];
  recovery_segments?: ProjectionRecoverySegment[];
  constraint_summary?: ProjectionConstraintSummary;
  inferred_current_state?: ProjectionInferredCurrentState;
  no_history?: NoHistoryProjectionMetadata;
  readiness_score?: number;
  physiological_readiness_score?: number;
  readiness_confidence?: number;
  planning_confidence?: number;
  planning_confidence_reasons?: string[];
  readiness_rationale_codes?: string[];
  capacity_envelope?: {
    envelope_score: number;
    envelope_state: "inside" | "edge" | "outside";
    limiting_factors: string[];
    limiting_factor_scores?: {
      over_high: number;
      under_low: number;
      over_ramp: number;
    };
  };
  feasibility_band?: "feasible" | "stretch" | "aggressive" | "nearly_impossible" | "infeasible";
  risk_score?: number;
  risk_level?: "low" | "moderate" | "high" | "extreme";
  risk_flags?: string[];
  caps_applied?: string[];
  load_resolution_summary?: ProjectionLoadResolutionSummary;
  projection_diagnostics?: ProjectionDiagnostics;
  prediction_uncertainty?: ProjectionPredictionUncertainty;
  goal_target_distributions?: ProjectionGoalTargetDistribution[];
  optimization_tradeoff_summary?: ProjectionDiagnostics["optimization_tradeoff_summary"];
  training_prescription?: TrainingPrescription;
  weekly_allocation?: WeeklyAllocation;
  reference_trajectory?: ReferenceTrajectory;
  trajectory_mode?: TrajectoryMode;
  feasibility_assessment?: FeasibilityAssessment;
  activity_category_load_states?: ProjectionActivityCategoryLoadState[];
  dose_recommendation?: ProjectionDoseRecommendation;
  goal_assessments?: Array<{
    goal_id: string;
    priority: number;
    goal_readiness_target?: number;
    goal_readiness_score?: number;
    state_readiness_score?: number;
    goal_alignment_loss_0_100?: number;
    feasibility_band: "feasible" | "stretch" | "aggressive" | "nearly_impossible" | "infeasible";
    limiter_shares?: {
      timeline_pressure: number;
      capacity_pressure: number;
      evidence_weakness: number;
      recovery_strain: number;
      mechanical_stress: number;
      goal_interference: number;
    };
    interference_notes?: string[];
    target_scores: Array<{
      kind: string;
      score_0_100: number;
      target_weight?: number;
      unmet_gap?: number;
      rationale_codes: string[];
      effective_target?: {
        raw_target: number;
        effective_scoring_target: number;
        applied_surplus_pct: number;
        surplus_support_factor: number;
        surplus_applied: boolean;
        rationale_code: string;
      };
    }>;
    conflict_notes: string[];
  }>;
}

export type ProjectionChartPayloadWithDeterministicIds = Omit<
  ProjectionChartPayload,
  "constraint_summary" | "microcycles" | "recovery_segments"
> & {
  constraint_summary: ProjectionConstraintSummary;
  microcycles: ProjectionMicrocycleWithDeterministicId[];
  recovery_segments: ProjectionRecoverySegment[];
};

export function buildProjectionChartPayloadFromDeterministicProjection(input: {
  expandedPlan: ProjectionChartAssemblyPlan;
  deterministicProjection: DeterministicProjectionPayload;
}): ProjectionChartPayloadWithDeterministicIds {
  const { deterministicProjection, expandedPlan } = input;
  const deterministicProjectionCompat =
    deterministicProjection as typeof deterministicProjection & {
      prediction_uncertainty?: ProjectionChartPayload["prediction_uncertainty"];
      goal_target_distributions?: ProjectionChartPayload["goal_target_distributions"];
    };
  const noHistory = toNoHistoryMetadataOrUndefined(deterministicProjection.no_history);

  return {
    start_date: expandedPlan.start_date,
    end_date: expandedPlan.end_date,
    points: deterministicProjection.points ?? [],
    daily_load_points: deterministicProjection.daily_load_points ?? [],
    goal_markers: deterministicProjection.goal_markers ?? [],
    periodization_phases: expandedPlan.blocks.map((block, index) => ({
      id: deterministicUuidFromSeed(
        `projection-phase|${expandedPlan.start_date}|${expandedPlan.end_date}|${index}|${block.name}|${block.start_date}|${block.end_date}`,
      ),
      name: block.name,
      start_date: block.start_date,
      end_date: block.end_date,
      target_weekly_load_min: Math.round((block.target_weekly_load_range?.min ?? 0) * 10) / 10,
      target_weekly_load_max: Math.round((block.target_weekly_load_range?.max ?? 0) * 10) / 10,
    })),
    microcycles: deterministicProjection.microcycles.map((microcycle) => ({
      id: deterministicUuidFromSeed(
        `projection-microcycle|${expandedPlan.start_date}|${microcycle.week_start_date}|${microcycle.week_end_date}`,
      ),
      ...microcycle,
    })),
    recovery_segments: deterministicProjection.recovery_segments,
    constraint_summary: deterministicProjection.constraint_summary,
    ...(deterministicProjection.inferred_current_state === undefined
      ? {}
      : { inferred_current_state: deterministicProjection.inferred_current_state }),
    ...(noHistory === undefined ? {} : { no_history: noHistory }),
    ...(deterministicProjection.readiness_score === undefined
      ? {}
      : { readiness_score: deterministicProjection.readiness_score }),
    ...(deterministicProjection.physiological_readiness_score === undefined
      ? {}
      : { physiological_readiness_score: deterministicProjection.physiological_readiness_score }),
    ...(deterministicProjection.readiness_confidence === undefined
      ? {}
      : { readiness_confidence: deterministicProjection.readiness_confidence }),
    ...(deterministicProjection.planning_confidence === undefined
      ? {}
      : { planning_confidence: deterministicProjection.planning_confidence }),
    ...(deterministicProjection.planning_confidence_reasons === undefined
      ? {}
      : { planning_confidence_reasons: deterministicProjection.planning_confidence_reasons }),
    ...(deterministicProjection.readiness_rationale_codes === undefined
      ? {}
      : { readiness_rationale_codes: deterministicProjection.readiness_rationale_codes }),
    ...(deterministicProjection.capacity_envelope === undefined
      ? {}
      : { capacity_envelope: deterministicProjection.capacity_envelope }),
    ...(deterministicProjection.feasibility_band === undefined
      ? {}
      : { feasibility_band: deterministicProjection.feasibility_band }),
    ...(deterministicProjection.risk_score === undefined
      ? {}
      : { risk_score: deterministicProjection.risk_score }),
    ...(deterministicProjection.risk_level === undefined
      ? {}
      : { risk_level: deterministicProjection.risk_level }),
    ...(deterministicProjection.risk_flags === undefined
      ? {}
      : { risk_flags: deterministicProjection.risk_flags }),
    ...(deterministicProjection.caps_applied === undefined
      ? {}
      : { caps_applied: deterministicProjection.caps_applied }),
    ...(deterministicProjection.load_resolution_summary === undefined
      ? {}
      : { load_resolution_summary: deterministicProjection.load_resolution_summary }),
    ...(deterministicProjection.projection_diagnostics === undefined
      ? {}
      : { projection_diagnostics: deterministicProjection.projection_diagnostics }),
    ...(deterministicProjectionCompat.prediction_uncertainty === undefined
      ? {}
      : { prediction_uncertainty: deterministicProjectionCompat.prediction_uncertainty }),
    ...(deterministicProjectionCompat.goal_target_distributions === undefined
      ? {}
      : { goal_target_distributions: deterministicProjectionCompat.goal_target_distributions }),
    ...(deterministicProjection.optimization_tradeoff_summary === undefined
      ? {}
      : { optimization_tradeoff_summary: deterministicProjection.optimization_tradeoff_summary }),
    ...(deterministicProjection.training_prescription === undefined
      ? {}
      : { training_prescription: deterministicProjection.training_prescription }),
    ...(deterministicProjection.weekly_allocation === undefined
      ? {}
      : { weekly_allocation: deterministicProjection.weekly_allocation }),
    ...(deterministicProjection.reference_trajectory === undefined
      ? {}
      : { reference_trajectory: deterministicProjection.reference_trajectory }),
    ...(deterministicProjection.trajectory_mode === undefined
      ? {}
      : { trajectory_mode: deterministicProjection.trajectory_mode }),
    ...(deterministicProjection.feasibility_assessment === undefined
      ? {}
      : { feasibility_assessment: deterministicProjection.feasibility_assessment }),
    ...(deterministicProjection.activity_category_load_states === undefined
      ? {}
      : { activity_category_load_states: deterministicProjection.activity_category_load_states }),
    ...(deterministicProjection.dose_recommendation === undefined
      ? {}
      : { dose_recommendation: deterministicProjection.dose_recommendation }),
    ...(deterministicProjection.goal_assessments === undefined
      ? {}
      : { goal_assessments: deterministicProjection.goal_assessments }),
  };
}

export function toNoHistoryMetadataOrUndefined(
  metadata: NoHistoryProjectionMetadata,
): NoHistoryProjectionMetadata | undefined {
  if (
    !metadata.projection_floor_applied &&
    !metadata.evidence_confidence &&
    !metadata.projection_feasibility
  ) {
    return undefined;
  }

  return metadata;
}

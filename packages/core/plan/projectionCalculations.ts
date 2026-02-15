import { calculateATL, calculateCTL } from "../calculations";
import type { CreationContextSummary } from "../schemas/training_plan_structure";
import { countAvailableTrainingDays } from "./availabilityUtils";
import { addDaysDateOnlyUtc, diffDateOnlyUtcDays } from "./dateOnlyUtc";
import {
  getOptimizationProfileBehavior,
  normalizeProjectionSafetyConfig,
  type ProjectionSafetyConfig,
  type ProjectionSafetyConfigInput,
} from "./projection/safety-caps";
import {
  blendDemandWithConfidence,
  computeProjectionFeasibilityMetadata,
  computeProjectionPointReadinessScores,
  getDemandRhythmMultiplier,
  type ProjectionFeasibilityMetadata as ReadinessProjectionFeasibilityMetadata,
} from "./projection/readiness";

export {
  getOptimizationProfileBehavior,
  normalizeProjectionSafetyConfig,
  type ProjectionSafetyConfig,
  type ProjectionSafetyConfigInput,
} from "./projection/safety-caps";
export {
  blendDemandWithConfidence,
  computeProjectionFeasibilityMetadata,
  computeProjectionPointReadinessScores,
  getDemandRhythmMultiplier,
} from "./projection/readiness";

export type ProjectionWeekPattern = "ramp" | "deload" | "taper" | "event";
export type ProjectionMicrocyclePattern = ProjectionWeekPattern | "recovery";

export interface ProjectionGoalDateLike {
  target_date: string;
  priority?: number;
}

export interface ProjectionWeekPatternInput {
  blockPhase: string;
  weekIndexWithinBlock: number;
  weekStartDate: string;
  weekEndDate: string;
  goals: ProjectionGoalDateLike[];
}

export interface ProjectionWeekPatternResult {
  pattern: ProjectionWeekPattern;
  multiplier: number;
}

type GoalDrivenPattern = "event" | "taper";

interface GoalPatternInfluence {
  pattern: GoalDrivenPattern;
  multiplier: number;
  influenceScore: number;
  goalTargetDate: string;
}

const MIN_GOAL_PRIORITY = 1;
const MAX_GOAL_PRIORITY = 10;

export type NoHistoryFitnessLevel = "weak" | "strong";
export type NoHistoryGoalTier = "low" | "medium" | "high";
export type BuildTimeFeasibility = "full" | "limited" | "insufficient";
export type ProjectionFloorConfidence = "high" | "medium" | "low";

interface DemandBand {
  min: number;
  target: number;
  stretch: number;
}

export interface EvidenceWeightingResult {
  score: number;
  state: "none" | "sparse" | "stale" | "rich";
  reasons: string[];
}

export interface NoHistoryAvailabilityContext {
  availability_days: Array<{
    day: string;
    windows: Array<{
      start_minute_of_day: number;
      end_minute_of_day: number;
    }>;
    max_sessions?: number;
  }>;
  hard_rest_days?: string[];
  max_single_session_duration_minutes?: number;
}

export interface NoHistoryIntensityModel {
  version: string;
  weak_if: number;
  strong_if: number;
  conservative_if: number;
}

export interface NoHistoryAnchorContext {
  history_availability_state: "none" | "sparse" | "rich";
  goal_tier: NoHistoryGoalTier;
  weeks_to_event: number;
  goal_targets?: NoHistoryGoalTargetInput[];
  total_horizon_weeks?: number;
  goal_count?: number;
  starting_ctl_override?: number;
  context_summary?: CreationContextSummary;
  availability_context?: NoHistoryAvailabilityContext;
  intensity_model?: Partial<NoHistoryIntensityModel>;
}

export type NoHistoryGoalTargetInput =
  | {
      target_type: "race_performance";
      distance_m: number;
      target_time_s?: number;
    }
  | {
      target_type: "pace_threshold";
    }
  | {
      target_type: "power_threshold";
    }
  | {
      target_type: "hr_threshold";
    };

export interface NoHistoryEvidence {
  strong_signal_tokens: string[];
  rationale_codes: string[];
}

export interface NoHistoryFitnessInference {
  fitnessLevel: NoHistoryFitnessLevel;
  reasons: string[];
}

export interface NoHistoryProjectionFloor {
  goalTier: NoHistoryGoalTier;
  fitnessLevel: NoHistoryFitnessLevel;
  start_ctl_floor: number;
  start_weekly_tss_floor: number;
  target_event_ctl: number;
}

export interface NoHistoryProjectionFloorClampResult {
  start_ctl: number;
  start_weekly_tss: number;
  floor_clamped_by_availability: boolean;
  reasons: string[];
  assumed_intensity_model_version: string;
}

export interface NoHistoryAnchorResolution {
  projection_floor_applied: boolean;
  projection_floor_values: {
    start_ctl: number;
    start_weekly_tss: number;
  } | null;
  fitness_level: NoHistoryFitnessLevel | null;
  fitness_inference_reasons: string[];
  projection_floor_confidence: ProjectionFloorConfidence | null;
  floor_clamped_by_availability: boolean;
  projection_floor_tier: NoHistoryGoalTier | null;
  starting_state_is_prior: boolean;
  target_event_ctl: number | null;
  weeks_to_event: number | null;
  periodization_feasibility: BuildTimeFeasibility | null;
  build_phase_warnings: string[];
  assumed_intensity_model_version: string | null;
  starting_ctl_for_projection: number | null;
  starting_weekly_tss_for_projection: number | null;
  required_event_demand_range: DemandBand | null;
  required_peak_weekly_tss: DemandBand | null;
  evidence_confidence: EvidenceWeightingResult | null;
  demand_confidence: ProjectionFloorConfidence | null;
  projection_feasibility: ReadinessProjectionFeasibilityMetadata | null;
}

const NO_HISTORY_DEFAULT_INTENSITY_MODEL: NoHistoryIntensityModel = {
  version: "no_history_intensity_v1",
  weak_if: 0.68,
  strong_if: 0.75,
  conservative_if: 0.65,
};

const NO_HISTORY_DAYS_UNTIL_RELIABLE_PROJECTION = 42;
const NO_HISTORY_DEFAULT_STARTING_CTL = 0;

const NO_HISTORY_PROJECTION_FLOOR_MATRIX: Record<
  NoHistoryFitnessLevel,
  Record<NoHistoryGoalTier, { start_ctl_floor: number }>
> = {
  weak: {
    low: { start_ctl_floor: 20 },
    medium: { start_ctl_floor: 28 },
    high: { start_ctl_floor: 35 },
  },
  strong: {
    low: { start_ctl_floor: 30 },
    medium: { start_ctl_floor: 40 },
    high: { start_ctl_floor: 50 },
  },
};

export function weeklyLoadFromBlockAndBaseline(
  block:
    | {
        target_weekly_tss_range?: { min: number; max: number };
      }
    | undefined,
  baselineWeeklyTss: number,
  rollingContext?: {
    previous_week_tss?: number;
    demand_floor_weekly_tss?: number | null;
  },
): number {
  const targetRange = block?.target_weekly_tss_range;
  const blockMidpoint = targetRange
    ? (targetRange.min + targetRange.max) / 2
    : baselineWeeklyTss;
  const previousWeekTss =
    rollingContext?.previous_week_tss ?? baselineWeeklyTss;
  const demandFloorSignal =
    rollingContext?.demand_floor_weekly_tss ?? blockMidpoint;
  const rollingBaseWeeklyTss =
    previousWeekTss * 0.6 + blockMidpoint * 0.25 + demandFloorSignal * 0.15;

  return Math.round(Math.max(0, rollingBaseWeeklyTss) * 10) / 10;
}

function diffDays(startDate: string, endDate: string): number {
  return diffDateOnlyUtcDays(startDate, endDate);
}

function deriveWeeklyTssFromCtl(ctl: number): number {
  return Math.round(ctl * 7);
}

function roundWeeksToEvent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

/**
 * Collects deterministic no-history evidence from context summary markers.
 */
export function collectNoHistoryEvidence(
  context: Pick<NoHistoryAnchorContext, "context_summary">,
): NoHistoryEvidence {
  const summary = context.context_summary;
  const strongSignals: string[] = [];

  if (summary?.recent_consistency_marker === "high") {
    strongSignals.push("strong_consistency_marker");
  }

  if (summary?.effort_confidence_marker === "high") {
    strongSignals.push("strong_effort_marker");
  }

  if (summary?.profile_metric_completeness_marker === "high") {
    strongSignals.push("strong_profile_metrics_marker");
  }

  if ((summary?.signal_quality ?? 0) >= 0.8) {
    strongSignals.push("strong_signal_quality_score");
  }

  return {
    strong_signal_tokens: [...new Set(strongSignals)],
    rationale_codes: summary?.rationale_codes ?? [],
  };
}

/**
 * Infers no-history fitness class.
 * Defaults to weak unless at least two independent strong signals exist.
 */
export function determineNoHistoryFitnessLevel(
  evidence: NoHistoryEvidence,
): NoHistoryFitnessInference {
  if (evidence.strong_signal_tokens.length >= 2) {
    return {
      fitnessLevel: "strong",
      reasons: [
        ...evidence.strong_signal_tokens,
        "fitness_promoted_to_strong_two_independent_signals",
      ],
    };
  }

  return {
    fitnessLevel: "weak",
    reasons: [
      ...evidence.strong_signal_tokens,
      "fitness_defaulted_to_weak_insufficient_strong_signals",
    ],
  };
}

/**
 * Derives canonical no-history CTL and weekly TSS floors.
 */
export function deriveNoHistoryProjectionFloor(
  goalTier: NoHistoryGoalTier,
  fitnessLevel: NoHistoryFitnessLevel,
): NoHistoryProjectionFloor {
  const row = NO_HISTORY_PROJECTION_FLOOR_MATRIX[fitnessLevel][goalTier];
  const startCtlFloor = row.start_ctl_floor;
  const targetEventCtl = round1(
    Math.max(35, Math.min(95, startCtlFloor * 1.85)),
  );

  return {
    goalTier,
    fitnessLevel,
    start_ctl_floor: startCtlFloor,
    start_weekly_tss_floor: deriveWeeklyTssFromCtl(startCtlFloor),
    target_event_ctl: targetEventCtl,
  };
}

/**
 * Clamps no-history floors by available weekly duration and assumed intensity.
 */
export function clampNoHistoryFloorByAvailability(
  floor: NoHistoryProjectionFloor,
  availabilityContext: NoHistoryAvailabilityContext | undefined,
  intensityModel: Partial<NoHistoryIntensityModel> | undefined,
): NoHistoryProjectionFloorClampResult {
  const mergedIntensityModel: NoHistoryIntensityModel = {
    ...NO_HISTORY_DEFAULT_INTENSITY_MODEL,
    ...intensityModel,
  };

  if (!availabilityContext) {
    return {
      start_ctl: floor.start_ctl_floor,
      start_weekly_tss: floor.start_weekly_tss_floor,
      floor_clamped_by_availability: false,
      reasons: ["availability_missing_skip_floor_clamp"],
      assumed_intensity_model_version: mergedIntensityModel.version,
    };
  }

  const hardRestDays = availabilityContext.hard_rest_days ?? [];
  const availableTrainingDays = countAvailableTrainingDays({
    availabilityDays: availabilityContext.availability_days,
    hardRestDays,
  });

  const cappedSessionMinutes =
    availabilityContext.max_single_session_duration_minutes;

  const totalAvailableMinutes = availabilityContext.availability_days.reduce(
    (sum, day) => {
      if (hardRestDays.includes(day.day)) {
        return sum;
      }

      const dayMinutes = day.windows.reduce((windowSum, window) => {
        const windowDuration = Math.max(
          0,
          window.end_minute_of_day - window.start_minute_of_day,
        );
        const cappedDuration =
          cappedSessionMinutes === undefined
            ? windowDuration
            : Math.min(windowDuration, cappedSessionMinutes);
        return windowSum + cappedDuration;
      }, 0);

      return sum + dayMinutes;
    },
    0,
  );

  const intensityFactor =
    floor.fitnessLevel === "strong"
      ? mergedIntensityModel.strong_if
      : mergedIntensityModel.weak_if;
  const safeIntensityFactor = Number.isFinite(intensityFactor)
    ? intensityFactor
    : mergedIntensityModel.conservative_if;

  const feasibleWeeklyTss = Math.max(
    0,
    Math.round((totalAvailableMinutes / 60) * 100 * safeIntensityFactor ** 2),
  );
  const clampedWeeklyTss = Math.min(
    floor.start_weekly_tss_floor,
    feasibleWeeklyTss,
  );
  const clampedStartCtl = round1(clampedWeeklyTss / 7);
  const derivedWeeklyFromCtl = deriveWeeklyTssFromCtl(clampedStartCtl);
  const floorClamped = derivedWeeklyFromCtl < floor.start_weekly_tss_floor;

  const reasons = [`availability_training_days_${availableTrainingDays}`];
  if (
    intensityModel?.weak_if === undefined ||
    intensityModel?.strong_if === undefined
  ) {
    reasons.push("intensity_model_missing_using_conservative_baseline");
  }
  if (floorClamped) {
    reasons.push("floor_clamped_by_availability");
  }

  return {
    start_ctl: clampedStartCtl,
    start_weekly_tss: derivedWeeklyFromCtl,
    floor_clamped_by_availability: floorClamped,
    reasons,
    assumed_intensity_model_version: mergedIntensityModel.version,
  };
}

export function classifyBuildTimeFeasibility(
  goalTier: NoHistoryGoalTier,
  weeksToEvent: number,
): BuildTimeFeasibility {
  const safeWeeks = roundWeeksToEvent(weeksToEvent);

  if (goalTier === "high") {
    if (safeWeeks >= 16) return "full";
    if (safeWeeks >= 12) return "limited";
    return "insufficient";
  }

  if (goalTier === "medium") {
    if (safeWeeks >= 12) return "full";
    if (safeWeeks >= 8) return "limited";
    return "insufficient";
  }

  if (safeWeeks >= 8) return "full";
  if (safeWeeks >= 6) return "limited";
  return "insufficient";
}

export function mapFeasibilityToConfidence(
  feasibility: BuildTimeFeasibility,
): ProjectionFloorConfidence {
  if (feasibility === "full") return "high";
  if (feasibility === "limited") return "medium";
  return "low";
}

export function deriveNoHistoryGoalTierFromTargets(
  targets: NoHistoryGoalTargetInput[],
): NoHistoryGoalTier {
  if (targets.length === 0) {
    return "medium";
  }

  let hasMediumDemandSignal = false;

  for (const target of targets) {
    if (target.target_type === "race_performance") {
      if (target.distance_m >= 30000) {
        return "high";
      }

      if (target.distance_m >= 10000) {
        hasMediumDemandSignal = true;
      }
      continue;
    }

    hasMediumDemandSignal = true;
  }

  return hasMediumDemandSignal ? "medium" : "low";
}

function toDemandBand(target: number): DemandBand {
  return {
    min: round1(target * 0.85),
    target: round1(target),
    stretch: round1(target * 1.15),
  };
}

function confidenceToScoreFloor(confidence: ProjectionFloorConfidence): number {
  if (confidence === "high") return 0.75;
  if (confidence === "medium") return 0.6;
  return 0.45;
}

export function deriveGoalDemandProfileFromTargets(input: {
  goalTargets: NoHistoryGoalTargetInput[];
  goalTier: NoHistoryGoalTier;
  weeksToEvent: number;
}): {
  required_event_demand_range: DemandBand;
  required_peak_weekly_tss: DemandBand;
  demand_confidence: ProjectionFloorConfidence;
  minimum_confidence_score: number;
  rationale_codes: string[];
} {
  const tierRank =
    input.goalTier === "low" ? 0 : input.goalTier === "medium" ? 1 : 2;
  const tierBiasCtl = tierRank * 4;
  const reasons = [
    "demand_model_dynamic_continuous_v1",
    `goal_tier_${input.goalTier}`,
  ];

  const targetCtlCandidates: number[] = [];
  const candidateWeights: number[] = [];
  let hasRacePaceTarget = false;

  for (const target of input.goalTargets) {
    if (target.target_type === "race_performance") {
      const distanceKm = Math.max(1, Math.min(100, target.distance_m / 1000));
      const distanceCtl = 28 + 13 * Math.log(1 + distanceKm);
      let paceCtlBoost = 0;

      if (
        target.target_time_s !== undefined &&
        Number.isFinite(target.target_time_s) &&
        target.target_time_s > 0
      ) {
        const speedKph = (distanceKm * 3600) / target.target_time_s;
        paceCtlBoost = Math.max(0, Math.min(24, (speedKph - 9.5) * 3.2));
        hasRacePaceTarget = true;
        reasons.push("race_performance_target_with_pace");
      } else {
        reasons.push("race_performance_target_without_pace");
      }

      targetCtlCandidates.push(distanceCtl + paceCtlBoost + tierBiasCtl);
      candidateWeights.push(
        1 + Math.min(0.8, distanceKm / 60) + (paceCtlBoost > 0 ? 0.25 : 0),
      );
      continue;
    }

    if (target.target_type === "pace_threshold") {
      targetCtlCandidates.push(56 + tierBiasCtl);
      candidateWeights.push(1);
      reasons.push("pace_threshold_target_included");
      continue;
    }

    if (target.target_type === "power_threshold") {
      targetCtlCandidates.push(60 + tierBiasCtl);
      candidateWeights.push(1.05);
      reasons.push("power_threshold_target_included");
      continue;
    }

    targetCtlCandidates.push(54 + tierBiasCtl);
    candidateWeights.push(0.95);
    reasons.push("hr_threshold_target_included");
  }

  let intrinsicDemandCtl = 48 + tierRank * 8;
  if (targetCtlCandidates.length === 0) {
    reasons.push("goal_targets_missing_using_dynamic_tier_baseline");
  } else {
    const weightedDemandCtl =
      targetCtlCandidates.reduce(
        (sum, candidate, index) =>
          sum + candidate * (candidateWeights[index] ?? 1),
        0,
      ) / targetCtlCandidates.reduce((sum, weight) => sum + weight, 0);
    const maxDemandCtl = Math.max(...targetCtlCandidates);
    intrinsicDemandCtl = maxDemandCtl * 0.7 + weightedDemandCtl * 0.3;
    reasons.push(
      targetCtlCandidates.length > 1
        ? "multi_goal_demand_aggregation_max_weighted"
        : "single_goal_demand_applied",
    );
  }

  const weeks = roundWeeksToEvent(input.weeksToEvent);
  const horizonPressure = Math.max(-0.35, Math.min(0.7, (20 - weeks) / 20));
  const horizonDemandMultiplier = 1 + horizonPressure * 0.12;
  reasons.push(`event_horizon_weeks_${weeks}`);
  reasons.push(
    horizonPressure > 0.25
      ? "horizon_pressure_short"
      : horizonPressure < -0.1
        ? "horizon_pressure_extended"
        : "horizon_pressure_balanced",
  );

  const targetEventCtl = round1(
    Math.max(35, Math.min(110, intrinsicDemandCtl * horizonDemandMultiplier)),
  );
  const targetPeakWeeklyTss = targetEventCtl * 7;

  const confidence: ProjectionFloorConfidence =
    weeks >= 16 ? "high" : weeks >= 10 ? "medium" : "low";
  const intrinsicConfidenceFloor = clamp01((targetEventCtl - 45) / 55);
  const demandBasedConfidenceFloor = Math.min(
    0.94,
    0.5 + intrinsicConfidenceFloor * 0.38 + (hasRacePaceTarget ? 0.04 : 0),
  );

  const minimumConfidenceScore = Math.max(
    confidenceToScoreFloor(confidence),
    demandBasedConfidenceFloor,
  );

  return {
    required_event_demand_range: toDemandBand(targetEventCtl),
    required_peak_weekly_tss: toDemandBand(targetPeakWeeklyTss),
    demand_confidence: confidence,
    minimum_confidence_score: minimumConfidenceScore,
    rationale_codes: [...new Set(reasons)],
  };
}

export function deriveEvidenceWeighting(input: {
  historyAvailabilityState: "none" | "sparse" | "rich";
  rationaleCodes?: string[];
  signalQuality?: number;
  effortConfidenceMarker?: "low" | "moderate" | "high";
  profileMetricCompletenessMarker?: "low" | "moderate" | "high";
}): EvidenceWeightingResult {
  const hasStaleMarker = (input.rationaleCodes ?? []).some((code) =>
    code.includes("stale"),
  );
  const state: EvidenceWeightingResult["state"] = hasStaleMarker
    ? "stale"
    : input.historyAvailabilityState;
  const baseByState: Record<EvidenceWeightingResult["state"], number> = {
    none: 0.2,
    sparse: 0.45,
    stale: 0.35,
    rich: 0.8,
  };

  const reasons = [
    `confidence_state_${state}`,
    ...(hasStaleMarker ? ["confidence_discount_stale_history"] : []),
  ];
  const quality = clamp01(input.signalQuality ?? 0.4);
  let confidence = baseByState[state] * 0.7 + quality * 0.3;

  if (input.effortConfidenceMarker === "high") {
    confidence += 0.08;
    reasons.push("confidence_boost_effort_marker_high");
  } else if (input.effortConfidenceMarker === "low") {
    confidence -= 0.08;
    reasons.push("confidence_penalty_effort_marker_low");
  }

  if (input.profileMetricCompletenessMarker === "high") {
    confidence += 0.06;
    reasons.push("confidence_boost_profile_metrics_high");
  } else if (input.profileMetricCompletenessMarker === "low") {
    confidence -= 0.06;
    reasons.push("confidence_penalty_profile_metrics_low");
  }

  const minByState: Record<EvidenceWeightingResult["state"], number> = {
    none: 0.35,
    sparse: 0.3,
    stale: 0.25,
    rich: 0.5,
  };

  return {
    score: Math.max(minByState[state], clamp01(confidence)),
    state,
    reasons,
  };
}

/**
 * Resolves deterministic no-history floor anchor metadata.
 */
export function resolveNoHistoryAnchor(
  context: NoHistoryAnchorContext,
): NoHistoryAnchorResolution {
  const evidence = collectNoHistoryEvidence(context);
  const fitness = determineNoHistoryFitnessLevel(evidence);
  const floor = deriveNoHistoryProjectionFloor(
    context.goal_tier,
    fitness.fitnessLevel,
  );
  const clamped = clampNoHistoryFloorByAvailability(
    floor,
    context.availability_context,
    context.intensity_model,
  );
  const periodizationFeasibility = classifyBuildTimeFeasibility(
    context.goal_tier,
    context.weeks_to_event,
  );
  let confidence = mapFeasibilityToConfidence(periodizationFeasibility);
  const confidenceReasons: string[] = [];

  if (fitness.fitnessLevel === "weak" && confidence === "high") {
    confidence = "medium";
    confidenceReasons.push("confidence_downgraded_weak_fitness_inference");
  }

  if ((context.goal_count ?? 1) > 1) {
    if (confidence === "high") {
      confidence = "medium";
    }
    confidenceReasons.push("confidence_downgraded_multi_goal_plan");
  }

  if ((context.total_horizon_weeks ?? context.weeks_to_event) > 52) {
    if (confidence === "high") {
      confidence = "medium";
    }
    confidenceReasons.push("confidence_downgraded_long_horizon");
  }

  if (clamped.floor_clamped_by_availability && confidence === "high") {
    confidence = "medium";
    confidenceReasons.push("confidence_downgraded_availability_clamped");
  }

  const hasStartingCtlOverride =
    Number.isFinite(context.starting_ctl_override) &&
    (context.starting_ctl_override ?? 0) >= 0;
  const startingCtlForProjection = round1(
    hasStartingCtlOverride
      ? (context.starting_ctl_override ?? NO_HISTORY_DEFAULT_STARTING_CTL)
      : NO_HISTORY_DEFAULT_STARTING_CTL,
  );
  const startingWeeklyTssForProjection = deriveWeeklyTssFromCtl(
    startingCtlForProjection,
  );
  const goalDemandProfile = deriveGoalDemandProfileFromTargets({
    goalTargets: context.goal_targets ?? [],
    goalTier: context.goal_tier,
    weeksToEvent: context.weeks_to_event,
  });
  const evidenceConfidence = deriveEvidenceWeighting({
    historyAvailabilityState: context.history_availability_state,
    rationaleCodes: evidence.rationale_codes,
    signalQuality: context.context_summary?.signal_quality,
    effortConfidenceMarker: context.context_summary?.effort_confidence_marker,
    profileMetricCompletenessMarker:
      context.context_summary?.profile_metric_completeness_marker,
  });
  const demandConfidenceFloor = confidenceToScoreFloor(
    goalDemandProfile.demand_confidence,
  );
  const effectiveEvidenceScore = Math.max(
    evidenceConfidence.score,
    demandConfidenceFloor,
    goalDemandProfile.minimum_confidence_score,
  );
  const enrichedEvidenceReasons =
    effectiveEvidenceScore > evidenceConfidence.score
      ? [
          ...evidenceConfidence.reasons,
          `confidence_floor_from_goal_demand_${goalDemandProfile.demand_confidence}`,
        ]
      : evidenceConfidence.reasons;
  const projectionFloorApplied = evidenceConfidence.state !== "rich";

  return {
    projection_floor_applied: projectionFloorApplied,
    projection_floor_values: projectionFloorApplied
      ? {
          start_ctl: clamped.start_ctl,
          start_weekly_tss: clamped.start_weekly_tss,
        }
      : null,
    fitness_level: fitness.fitnessLevel,
    fitness_inference_reasons: [
      ...fitness.reasons,
      ...evidence.rationale_codes,
      ...goalDemandProfile.rationale_codes,
      ...clamped.reasons,
      ...confidenceReasons,
      hasStartingCtlOverride
        ? "starting_ctl_override_applied"
        : "starting_ctl_defaulted_never_trained",
    ],
    projection_floor_confidence: confidence,
    floor_clamped_by_availability: clamped.floor_clamped_by_availability,
    projection_floor_tier: context.goal_tier,
    starting_state_is_prior: projectionFloorApplied,
    target_event_ctl: goalDemandProfile.required_event_demand_range.target,
    weeks_to_event: roundWeeksToEvent(context.weeks_to_event),
    periodization_feasibility: periodizationFeasibility,
    build_phase_warnings:
      periodizationFeasibility === "full"
        ? []
        : [
            periodizationFeasibility === "limited"
              ? "build_time_limited"
              : "build_time_insufficient",
          ],
    assumed_intensity_model_version: clamped.assumed_intensity_model_version,
    starting_ctl_for_projection: startingCtlForProjection,
    starting_weekly_tss_for_projection: startingWeeklyTssForProjection,
    required_event_demand_range: goalDemandProfile.required_event_demand_range,
    required_peak_weekly_tss: goalDemandProfile.required_peak_weekly_tss,
    evidence_confidence: {
      score: effectiveEvidenceScore,
      state: evidenceConfidence.state,
      reasons: enrichedEvidenceReasons,
    },
    demand_confidence: goalDemandProfile.demand_confidence,
    projection_feasibility: null,
  };
}

export function getProjectionWeekPattern(
  input: ProjectionWeekPatternInput,
): ProjectionWeekPatternResult {
  const basePattern = getBaseProjectionWeekPattern(
    input.blockPhase,
    input.weekIndexWithinBlock,
  );
  const goalInfluences = input.goals
    .map((goal) =>
      buildGoalPatternInfluence(goal, input.weekStartDate, input.weekEndDate),
    )
    .filter(
      (influence): influence is GoalPatternInfluence => influence !== null,
    );

  if (goalInfluences.length === 0) {
    return basePattern;
  }

  const totalInfluenceScore = goalInfluences.reduce(
    (sum, influence) => sum + influence.influenceScore,
    0,
  );

  if (totalInfluenceScore <= 0) {
    return basePattern;
  }

  const weightedGoalMultiplier = goalInfluences.reduce(
    (sum, influence) =>
      sum +
      influence.multiplier * (influence.influenceScore / totalInfluenceScore),
    0,
  );

  const blendedMultiplier = round3(
    Math.min(basePattern.multiplier, weightedGoalMultiplier),
  );

  let dominantInfluence: GoalPatternInfluence | undefined;
  for (const influence of goalInfluences) {
    if (!dominantInfluence) {
      dominantInfluence = influence;
      continue;
    }

    if (influence.influenceScore > dominantInfluence.influenceScore) {
      dominantInfluence = influence;
      continue;
    }

    if (influence.influenceScore < dominantInfluence.influenceScore) {
      continue;
    }

    if (
      influence.pattern === "event" &&
      dominantInfluence.pattern !== "event"
    ) {
      dominantInfluence = influence;
      continue;
    }

    if (
      influence.pattern === dominantInfluence.pattern &&
      influence.goalTargetDate < dominantInfluence.goalTargetDate
    ) {
      dominantInfluence = influence;
    }
  }

  return {
    pattern: dominantInfluence?.pattern ?? basePattern.pattern,
    multiplier: blendedMultiplier,
  };
}

function getBaseProjectionWeekPattern(
  blockPhase: string,
  weekIndexWithinBlock: number,
): ProjectionWeekPatternResult {
  if (blockPhase === "taper") {
    return { pattern: "taper", multiplier: 0.88 };
  }

  if ((weekIndexWithinBlock + 1) % 4 === 0) {
    return { pattern: "deload", multiplier: 0.9 };
  }

  const rampStep = weekIndexWithinBlock % 3;
  const rampMultipliers = [0.92, 1.0, 1.08];
  return {
    pattern: "ramp",
    multiplier: rampMultipliers[rampStep] ?? 1,
  };
}

function buildGoalPatternInfluence(
  goal: ProjectionGoalDateLike,
  weekStartDate: string,
  weekEndDate: string,
): GoalPatternInfluence | null {
  const priorityWeight = getPriorityInfluenceWeight(goal.priority);

  if (goal.target_date >= weekStartDate && goal.target_date <= weekEndDate) {
    return {
      pattern: "event",
      multiplier: getGoalEventMultiplier(goal.priority),
      influenceScore: priorityWeight,
      goalTargetDate: goal.target_date,
    };
  }

  const daysUntilGoal = diffDays(weekEndDate, goal.target_date);
  if (daysUntilGoal < 0 || daysUntilGoal > 7) {
    return null;
  }

  const proximityFactor = (8 - daysUntilGoal) / 8;
  const influenceScore = priorityWeight * proximityFactor;

  return {
    pattern: "taper",
    multiplier: getGoalTaperMultiplier(goal.priority),
    influenceScore,
    goalTargetDate: goal.target_date,
  };
}

function normalizePriority(priority: number | undefined): number {
  if (priority === undefined || Number.isNaN(priority)) {
    return MIN_GOAL_PRIORITY;
  }

  return Math.max(
    MIN_GOAL_PRIORITY,
    Math.min(MAX_GOAL_PRIORITY, Math.round(priority)),
  );
}

function getPriorityProgress(priority: number | undefined): number {
  const normalizedPriority = normalizePriority(priority);
  return (
    (normalizedPriority - MIN_GOAL_PRIORITY) /
    (MAX_GOAL_PRIORITY - MIN_GOAL_PRIORITY)
  );
}

function getPriorityInfluenceWeight(priority: number | undefined): number {
  const normalizedPriority = normalizePriority(priority);
  return MAX_GOAL_PRIORITY - normalizedPriority + 1;
}

function getGoalEventMultiplier(priority: number | undefined): number {
  const priorityProgress = getPriorityProgress(priority);
  return round3(0.82 + 0.08 * priorityProgress);
}

function getGoalTaperMultiplier(priority: number | undefined): number {
  const priorityProgress = getPriorityProgress(priority);
  return round3(0.9 + 0.06 * priorityProgress);
}

export interface DeterministicProjectionGoalMarker extends ProjectionGoalDateLike {
  id: string;
  name: string;
  priority: number;
}

export interface DeterministicProjectionPoint {
  date: string;
  predicted_load_tss: number;
  predicted_fitness_ctl: number;
  predicted_fatigue_atl: number;
  predicted_form_tsb: number;
  readiness_score: number;
}

export interface ProjectionWeekMetadata {
  recovery: {
    active: boolean;
    goal_ids: string[];
    reduction_factor: number;
  };
  tss_ramp: {
    previous_week_tss: number;
    seed_weekly_tss: number;
    seed_source: "starting_ctl" | "dynamic_seed";
    rolling_base_weekly_tss: number;
    rolling_base_components: {
      previous_week_tss: number;
      block_midpoint_tss: number;
      demand_floor_tss: number | null;
      rationale_codes: string[];
    };
    requested_weekly_tss: number;
    raw_requested_weekly_tss: number;
    applied_weekly_tss: number;
    max_weekly_tss_ramp_pct: number;
    clamped: boolean;
    floor_override_applied: boolean;
    floor_minimum_weekly_tss: number | null;
    demand_band_minimum_weekly_tss?: number | null;
    demand_gap_unmet_weekly_tss?: number;
    weekly_load_override_reason:
      | "no_history_floor"
      | "demand_band_floor"
      | null;
  };
  ctl_ramp: {
    requested_ctl_ramp: number;
    applied_ctl_ramp: number;
    max_ctl_ramp_per_week: number;
    clamped: boolean;
  };
}

export interface DeterministicProjectionMicrocycle {
  week_start_date: string;
  week_end_date: string;
  phase: string;
  pattern: ProjectionMicrocyclePattern;
  planned_weekly_tss: number;
  projected_ctl: number;
  metadata: ProjectionWeekMetadata;
}

export interface ProjectionRecoverySegment {
  goal_id: string;
  goal_name: string;
  start_date: string;
  end_date: string;
}

export interface DeterministicProjectionPayload {
  start_date: string;
  end_date: string;
  points: DeterministicProjectionPoint[];
  goal_markers: DeterministicProjectionGoalMarker[];
  microcycles: DeterministicProjectionMicrocycle[];
  recovery_segments: ProjectionRecoverySegment[];
  constraint_summary: {
    normalized_creation_config: ProjectionSafetyConfig;
    tss_ramp_clamp_weeks: number;
    ctl_ramp_clamp_weeks: number;
    recovery_weeks: number;
    starting_state: {
      starting_ctl: number;
      starting_atl: number;
      starting_tsb: number;
      starting_state_is_prior: boolean;
    };
  };
  no_history: Pick<
    NoHistoryAnchorResolution,
    | "projection_floor_applied"
    | "projection_floor_values"
    | "fitness_level"
    | "fitness_inference_reasons"
    | "projection_floor_confidence"
    | "floor_clamped_by_availability"
    | "starting_ctl_for_projection"
    | "starting_weekly_tss_for_projection"
    | "required_event_demand_range"
    | "required_peak_weekly_tss"
    | "demand_confidence"
    | "evidence_confidence"
    | "projection_feasibility"
  >;
}

export interface BuildDeterministicProjectionInput {
  timeline: {
    start_date: string;
    end_date: string;
  };
  blocks: Array<{
    name: string;
    phase: string;
    start_date: string;
    end_date: string;
    target_weekly_tss_range?: { min: number; max: number };
  }>;
  goals: Array<{
    id?: string;
    name: string;
    target_date: string;
    priority?: number;
  }>;
  starting_ctl?: number;
  creation_config?: ProjectionSafetyConfigInput;
  no_history_context?: NoHistoryAnchorContext;
  disable_weekly_tss_optimizer?: boolean;
}

interface WeeklyLoadSignalInput {
  weekStartDate: string;
  weekEndDate: string;
  daysInWeek: number;
  projectionWeekIndex: number;
  previousWeekTss: number;
  previousDemandFloorSignal: number | null;
  effectiveSeedWeeklyTss: number;
  noHistory: NoHistoryAnchorResolution | null;
  noHistoryWeeksToEvent: number;
  noHistoryFloorHoldWeeks: number;
  noHistoryStartingWeeklyTss: number | null;
  noHistoryTargetWeeklyTssFloor: number | null;
  evidenceConfidenceScore: number;
  recoverySegments: ProjectionRecoverySegment[];
  goalMarkers: DeterministicProjectionGoalMarker[];
  blocks: BuildDeterministicProjectionInput["blocks"];
}

interface WeeklyLoadSignalResult {
  block: BuildDeterministicProjectionInput["blocks"][number] | undefined;
  weekPattern: ProjectionWeekPatternResult;
  baseWeeklyTss: number;
  blockMidpointTss: number;
  recoveryOverlap: { overlap_days: number; goal_ids: string[] };
  recoveryReductionFactor: number;
  recoveryAdjustedWeeklyTss: number;
  flooredWeeklyTss: number;
  weightedNoHistoryDemandFloor: number | null;
  enforceNoHistoryStartingFloor: boolean;
  rhythmAdjustedDemandFloor: number;
  floorOverrideApplied: boolean;
  rollingCompositionRationaleCodes: string[];
}

interface WeeklyTssCapInput {
  flooredWeeklyTss: number;
  previousWeekTss: number;
  currentCtl: number;
  daysInWeek: number;
  normalizedConfig: ProjectionSafetyConfig;
  preferredWeeklyTss?: number;
}

interface WeeklyTssCapResult {
  appliedWeeklyTss: number;
  tssRampClamped: boolean;
  ctlRampClamped: boolean;
  maxAllowedByTssRamp: number;
  requestedCtlRamp: number;
}

interface WeeklyTssOptimizerInput {
  input: BuildDeterministicProjectionInput;
  normalizedConfig: ProjectionSafetyConfig;
  goalMarkers: DeterministicProjectionGoalMarker[];
  recoverySegments: ProjectionRecoverySegment[];
  endDate: string;
  noHistory: NoHistoryAnchorResolution | null;
  noHistoryWeeksToEvent: number;
  noHistoryFloorHoldWeeks: number;
  noHistoryStartingWeeklyTss: number | null;
  noHistoryTargetWeeklyTssFloor: number | null;
  evidenceConfidenceScore: number;
  effectiveSeedWeeklyTss: number;
  weekStartDate: string;
  weekEndDate: string;
  daysInWeek: number;
  projectionWeekIndex: number;
  currentCtl: number;
  currentAtl: number;
  previousWeekTss: number;
  previousDemandFloorSignal: number | null;
  flooredWeeklyTss: number;
  weightedNoHistoryDemandFloor: number | null;
  maxAllowedByTssRamp: number;
}

function resolveWeeklyLoadSignals(
  input: WeeklyLoadSignalInput,
): WeeklyLoadSignalResult {
  const block = findBlockForDate(input.blocks, input.weekStartDate);
  const weekIndexWithinBlock = block
    ? Math.max(
        0,
        Math.floor(diffDays(block.start_date, input.weekStartDate) / 7),
      )
    : 0;
  const weekPattern = getProjectionWeekPattern({
    blockPhase: block?.phase ?? "build",
    weekIndexWithinBlock,
    weekStartDate: input.weekStartDate,
    weekEndDate: input.weekEndDate,
    goals: input.goalMarkers,
  });

  const blockMidpointTss = block?.target_weekly_tss_range
    ? (block.target_weekly_tss_range.min + block.target_weekly_tss_range.max) /
      2
    : input.effectiveSeedWeeklyTss;
  const rollingCompositionRationaleCodes = [
    "rolling_base_prior_week_primary",
    "rolling_base_block_midpoint_signal",
    input.previousDemandFloorSignal !== null
      ? "rolling_base_demand_floor_signal"
      : "rolling_base_demand_floor_absent",
  ];
  const baseWeeklyTss = weeklyLoadFromBlockAndBaseline(
    block,
    input.effectiveSeedWeeklyTss,
    {
      previous_week_tss: input.previousWeekTss,
      demand_floor_weekly_tss: input.previousDemandFloorSignal,
    },
  );
  const requestedWeeklyTss = Math.max(
    0,
    round1(baseWeeklyTss * weekPattern.multiplier),
  );

  const recoveryOverlap = findRecoveryOverlap(
    input.recoverySegments,
    input.weekStartDate,
    input.weekEndDate,
  );
  const recoveryCoverage =
    recoveryOverlap.overlap_days / Math.max(1, input.daysInWeek);
  const recoveryReductionFactor = round3(1 - 0.35 * recoveryCoverage);
  const recoveryAdjustedWeeklyTss = Math.max(
    0,
    round1(requestedWeeklyTss * recoveryReductionFactor),
  );
  const enforceNoHistoryStartingFloor =
    input.noHistory?.target_event_ctl !== null &&
    input.noHistory?.target_event_ctl !== undefined &&
    input.projectionWeekIndex < input.noHistoryWeeksToEvent &&
    recoveryOverlap.goal_ids.length === 0 &&
    weekPattern.pattern === "ramp";
  const noHistoryInitialRampFloor =
    enforceNoHistoryStartingFloor && input.noHistoryStartingWeeklyTss !== null
      ? input.projectionWeekIndex < input.noHistoryFloorHoldWeeks
        ? round1(
            input.noHistoryStartingWeeklyTss +
              ((input.noHistoryTargetWeeklyTssFloor ??
                input.noHistoryStartingWeeklyTss) -
                input.noHistoryStartingWeeklyTss) *
                Math.min(
                  1,
                  Math.max(0, input.projectionWeekIndex) /
                    Math.max(1, input.noHistoryFloorHoldWeeks - 1),
                ),
          )
        : (input.noHistoryTargetWeeklyTssFloor ??
          input.noHistoryStartingWeeklyTss)
      : null;
  const noHistoryGoalDemandFloor =
    enforceNoHistoryStartingFloor &&
    input.noHistory?.target_event_ctl !== null &&
    input.noHistory?.target_event_ctl !== undefined &&
    input.noHistoryWeeksToEvent > 0
      ? round1(
          (input.noHistory.starting_ctl_for_projection ?? 0) *
            (1 -
              Math.min(
                1,
                (input.projectionWeekIndex + 1) / input.noHistoryWeeksToEvent,
              )) +
            input.noHistory.target_event_ctl *
              Math.min(
                1,
                (input.projectionWeekIndex + 1) / input.noHistoryWeeksToEvent,
              ),
        ) * 7
      : null;
  const noHistoryProgressiveFloor = Math.max(
    noHistoryInitialRampFloor ?? 0,
    noHistoryGoalDemandFloor ?? 0,
  );
  const demandRhythmMultiplier = getDemandRhythmMultiplier({
    weekPattern:
      recoveryOverlap.goal_ids.length > 0 ? "recovery" : weekPattern.pattern,
    weekIndex: input.projectionWeekIndex,
    weeksToEvent: input.noHistoryWeeksToEvent,
  });
  const rhythmAdjustedDemandFloor =
    noHistoryProgressiveFloor <= 0
      ? 0
      : round1(noHistoryProgressiveFloor * demandRhythmMultiplier);
  const weightedNoHistoryDemandFloor = blendDemandWithConfidence({
    demandFloorWeeklyTss: enforceNoHistoryStartingFloor
      ? rhythmAdjustedDemandFloor
      : null,
    conservativeBaselineWeeklyTss:
      input.noHistoryStartingWeeklyTss ?? input.effectiveSeedWeeklyTss,
    confidence: input.evidenceConfidenceScore,
  });
  const floorOverrideApplied =
    weightedNoHistoryDemandFloor !== null &&
    recoveryAdjustedWeeklyTss < weightedNoHistoryDemandFloor;
  const flooredWeeklyTss =
    weightedNoHistoryDemandFloor !== null
      ? Math.max(recoveryAdjustedWeeklyTss, weightedNoHistoryDemandFloor)
      : recoveryAdjustedWeeklyTss;

  return {
    block,
    weekPattern,
    baseWeeklyTss,
    blockMidpointTss,
    recoveryOverlap,
    recoveryReductionFactor,
    recoveryAdjustedWeeklyTss,
    flooredWeeklyTss,
    weightedNoHistoryDemandFloor,
    enforceNoHistoryStartingFloor,
    rhythmAdjustedDemandFloor,
    floorOverrideApplied,
    rollingCompositionRationaleCodes,
  };
}

function applyWeeklyTssCaps(input: WeeklyTssCapInput): WeeklyTssCapResult {
  const maxAllowedByTssRamp = round1(
    input.previousWeekTss *
      (1 + input.normalizedConfig.max_weekly_tss_ramp_pct / 100),
  );
  const tssRampClamped = input.flooredWeeklyTss > maxAllowedByTssRamp;
  const constrainedFloor =
    input.flooredWeeklyTss <= maxAllowedByTssRamp
      ? input.flooredWeeklyTss
      : maxAllowedByTssRamp;

  let appliedWeeklyTss =
    input.preferredWeeklyTss === undefined
      ? constrainedFloor
      : round1(
          Math.max(
            constrainedFloor,
            Math.min(maxAllowedByTssRamp, input.preferredWeeklyTss),
          ),
        );

  const requestedCtlAfterWeek = simulateCtlOverWeek(
    input.currentCtl,
    appliedWeeklyTss,
    input.daysInWeek,
  );
  const requestedCtlRamp = requestedCtlAfterWeek - input.currentCtl;

  let ctlRampClamped = false;
  if (requestedCtlRamp > input.normalizedConfig.max_ctl_ramp_per_week) {
    ctlRampClamped = true;
    appliedWeeklyTss = findWeeklyTssForCtlRampLimit(
      input.currentCtl,
      appliedWeeklyTss,
      input.normalizedConfig.max_ctl_ramp_per_week,
      input.daysInWeek,
    );
  }

  return {
    appliedWeeklyTss,
    tssRampClamped,
    ctlRampClamped,
    maxAllowedByTssRamp,
    requestedCtlRamp,
  };
}

function optimizeWeeklyAppliedTss(input: WeeklyTssOptimizerInput): number {
  const profileBehavior = getOptimizationProfileBehavior(
    input.normalizedConfig.optimization_profile,
  );
  const baseline = applyWeeklyTssCaps({
    flooredWeeklyTss: input.flooredWeeklyTss,
    previousWeekTss: input.previousWeekTss,
    currentCtl: input.currentCtl,
    daysInWeek: input.daysInWeek,
    normalizedConfig: input.normalizedConfig,
  }).appliedWeeklyTss;

  if (input.input.disable_weekly_tss_optimizer) {
    return baseline;
  }

  const futureGoals = input.goalMarkers.filter(
    (goal) => goal.target_date >= input.weekStartDate,
  );
  if (futureGoals.length === 0) {
    return baseline;
  }

  const cappedUpperByCtl = findWeeklyTssForCtlRampLimit(
    input.currentCtl,
    input.maxAllowedByTssRamp,
    input.normalizedConfig.max_ctl_ramp_per_week,
    input.daysInWeek,
  );
  const lowerBound =
    input.flooredWeeklyTss <= input.maxAllowedByTssRamp
      ? input.flooredWeeklyTss
      : input.maxAllowedByTssRamp;
  const upperBound = Math.min(input.maxAllowedByTssRamp, cappedUpperByCtl);

  if (upperBound <= lowerBound) {
    return baseline;
  }

  const candidateValues = new Set<number>([
    round1(lowerBound),
    round1(upperBound),
    baseline,
  ]);
  for (
    let step = 1;
    step < profileBehavior.optimizer_candidate_steps;
    step += 1
  ) {
    const ratio = step / profileBehavior.optimizer_candidate_steps;
    candidateValues.add(round1(lowerBound + (upperBound - lowerBound) * ratio));
  }

  let bestTss = baseline;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidateTss of [...candidateValues].sort((a, b) => a - b)) {
    const constrainedCandidate = applyWeeklyTssCaps({
      flooredWeeklyTss: input.flooredWeeklyTss,
      previousWeekTss: input.previousWeekTss,
      currentCtl: input.currentCtl,
      daysInWeek: input.daysInWeek,
      normalizedConfig: input.normalizedConfig,
      preferredWeeklyTss: candidateTss,
    }).appliedWeeklyTss;

    const score = evaluateWeeklyTssCandidateObjective({
      ...input,
      candidateWeeklyTss: constrainedCandidate,
      baselineWeeklyTss: baseline,
    });

    if (score > bestScore) {
      bestScore = score;
      bestTss = constrainedCandidate;
      continue;
    }

    if (score === bestScore) {
      const currentDistance = Math.abs(constrainedCandidate - baseline);
      const bestDistance = Math.abs(bestTss - baseline);
      if (currentDistance < bestDistance) {
        bestTss = constrainedCandidate;
      }
    }
  }

  return bestTss;
}

function evaluateWeeklyTssCandidateObjective(
  input: WeeklyTssOptimizerInput & {
    candidateWeeklyTss: number;
    baselineWeeklyTss: number;
  },
): number {
  const profileBehavior = getOptimizationProfileBehavior(
    input.normalizedConfig.optimization_profile,
  );
  const simulatedPoints: Array<{
    date: string;
    predicted_fitness_ctl: number;
    predicted_fatigue_atl: number;
    predicted_form_tsb: number;
  }> = [];

  let simCtl = simulateCtlOverWeek(
    input.currentCtl,
    input.candidateWeeklyTss,
    input.daysInWeek,
  );
  let simAtl = simulateAtlOverWeek(
    input.currentAtl,
    input.candidateWeeklyTss,
    input.daysInWeek,
  );
  let simPrevWeekTss = input.candidateWeeklyTss;
  let simPrevDemandFloorSignal = input.weightedNoHistoryDemandFloor;

  for (let dayOffset = 0; dayOffset < input.daysInWeek; dayOffset += 1) {
    const dayDate = addDaysDateOnlyUtc(input.weekStartDate, dayOffset);
    const dayCtl = simulateCtlOverWeek(
      input.currentCtl,
      input.candidateWeeklyTss,
      dayOffset + 1,
    );
    const dayAtl = simulateAtlOverWeek(
      input.currentAtl,
      input.candidateWeeklyTss,
      dayOffset + 1,
    );
    simulatedPoints.push({
      date: dayDate,
      predicted_fitness_ctl: round1(dayCtl),
      predicted_fatigue_atl: round1(dayAtl),
      predicted_form_tsb: round1(dayCtl - dayAtl),
    });
  }

  let simWeekStartDate = addDaysDateOnlyUtc(input.weekStartDate, 7);
  let simProjectionWeekIndex = input.projectionWeekIndex + 1;

  for (
    let lookahead = 0;
    lookahead < profileBehavior.optimizer_lookahead_weeks &&
    simWeekStartDate <= input.endDate;
    lookahead += 1
  ) {
    const simWeekEndDate =
      addDaysDateOnlyUtc(simWeekStartDate, 6) <= input.endDate
        ? addDaysDateOnlyUtc(simWeekStartDate, 6)
        : input.endDate;
    const simDaysInWeek = diffDays(simWeekStartDate, simWeekEndDate) + 1;

    const simSignals = resolveWeeklyLoadSignals({
      weekStartDate: simWeekStartDate,
      weekEndDate: simWeekEndDate,
      daysInWeek: simDaysInWeek,
      projectionWeekIndex: simProjectionWeekIndex,
      previousWeekTss: simPrevWeekTss,
      previousDemandFloorSignal: simPrevDemandFloorSignal,
      effectiveSeedWeeklyTss: input.effectiveSeedWeeklyTss,
      noHistory: input.noHistory,
      noHistoryWeeksToEvent: input.noHistoryWeeksToEvent,
      noHistoryFloorHoldWeeks: input.noHistoryFloorHoldWeeks,
      noHistoryStartingWeeklyTss: input.noHistoryStartingWeeklyTss,
      noHistoryTargetWeeklyTssFloor: input.noHistoryTargetWeeklyTssFloor,
      evidenceConfidenceScore: input.evidenceConfidenceScore,
      recoverySegments: input.recoverySegments,
      goalMarkers: input.goalMarkers,
      blocks: input.input.blocks,
    });

    const simWeeklyTss = applyWeeklyTssCaps({
      flooredWeeklyTss: simSignals.flooredWeeklyTss,
      previousWeekTss: simPrevWeekTss,
      currentCtl: simCtl,
      daysInWeek: simDaysInWeek,
      normalizedConfig: input.normalizedConfig,
    }).appliedWeeklyTss;

    const priorCtl = simCtl;
    const priorAtl = simAtl;
    simCtl = simulateCtlOverWeek(simCtl, simWeeklyTss, simDaysInWeek);
    simAtl = simulateAtlOverWeek(simAtl, simWeeklyTss, simDaysInWeek);

    for (let dayOffset = 0; dayOffset < simDaysInWeek; dayOffset += 1) {
      const dayDate = addDaysDateOnlyUtc(simWeekStartDate, dayOffset);
      const dayCtl = simulateCtlOverWeek(priorCtl, simWeeklyTss, dayOffset + 1);
      const dayAtl = simulateAtlOverWeek(priorAtl, simWeeklyTss, dayOffset + 1);
      simulatedPoints.push({
        date: dayDate,
        predicted_fitness_ctl: round1(dayCtl),
        predicted_fatigue_atl: round1(dayAtl),
        predicted_form_tsb: round1(dayCtl - dayAtl),
      });
    }

    simPrevWeekTss = simWeeklyTss;
    simPrevDemandFloorSignal = simSignals.weightedNoHistoryDemandFloor;
    simWeekStartDate = addDaysDateOnlyUtc(simWeekStartDate, 7);
    simProjectionWeekIndex += 1;
  }

  const windowEndDate =
    simulatedPoints[simulatedPoints.length - 1]?.date ?? input.weekEndDate;
  const goalsInWindow = input.goalMarkers.filter(
    (goal) =>
      goal.target_date >= input.weekStartDate &&
      goal.target_date <= windowEndDate,
  );

  if (goalsInWindow.length === 0) {
    return -Math.abs(input.candidateWeeklyTss - input.baselineWeeklyTss) * 0.05;
  }

  const readinessScores = computeProjectionPointReadinessScores({
    points: simulatedPoints,
    goals: goalsInWindow,
  });

  let weightedGoalReadiness = 0;
  let weightedGoalCount = 0;
  let overloadPenalty = 0;

  for (const goal of goalsInWindow) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < simulatedPoints.length; i += 1) {
      const point = simulatedPoints[i];
      if (!point) {
        continue;
      }

      const distance = Math.abs(diffDays(point.date, goal.target_date));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    const goalPoint = simulatedPoints[nearestIndex];
    if (!goalPoint) {
      continue;
    }

    const priorityWeight = getPriorityInfluenceWeight(goal.priority);
    weightedGoalReadiness +=
      (readinessScores[nearestIndex] ?? 0) * priorityWeight;
    weightedGoalCount += priorityWeight;

    const atlOverCtl = Math.max(
      0,
      goalPoint.predicted_fatigue_atl - goalPoint.predicted_fitness_ctl,
    );
    overloadPenalty +=
      (priorityWeight * Math.max(0, atlOverCtl - 4)) /
      Math.max(1, goalPoint.predicted_fitness_ctl + 8);
  }

  const volatilityPenalty =
    Math.abs(input.candidateWeeklyTss - input.previousWeekTss) /
    Math.max(1, input.previousWeekTss);
  const baselineDeviationPenalty =
    Math.abs(input.candidateWeeklyTss - input.baselineWeeklyTss) /
    Math.max(1, input.baselineWeeklyTss);
  const normalizedGoalReadiness =
    weightedGoalCount <= 0 ? 0 : weightedGoalReadiness / weightedGoalCount;

  return (
    normalizedGoalReadiness * profileBehavior.goal_readiness_weight -
    volatilityPenalty * profileBehavior.volatility_penalty_weight -
    overloadPenalty * profileBehavior.overload_penalty_weight -
    baselineDeviationPenalty * profileBehavior.baseline_deviation_penalty_weight
  );
}

function computeWeightedGoalDateReadiness(input: {
  points: DeterministicProjectionPoint[];
  goals: DeterministicProjectionGoalMarker[];
}): number {
  if (input.goals.length === 0 || input.points.length === 0) {
    return 0;
  }

  const resolveGoalReadiness = (targetDate: string): number => {
    const exact = input.points.find((point) => point.date === targetDate);
    if (exact) {
      return exact.readiness_score;
    }

    let nearest = input.points[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const point of input.points) {
      const distance = Math.abs(diffDays(point.date, targetDate));
      if (distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }

    return nearest?.readiness_score ?? 0;
  };

  let weightedTotal = 0;
  let totalWeight = 0;
  for (const goal of input.goals) {
    const weight = getPriorityInfluenceWeight(goal.priority);
    weightedTotal += resolveGoalReadiness(goal.target_date) * weight;
    totalWeight += weight;
  }

  return totalWeight <= 0 ? 0 : weightedTotal / totalWeight;
}

/**
 * Builds a deterministic weekly projection with explicit ramp caps and post-goal recovery windows.
 */
export function buildDeterministicProjectionPayload(
  input: BuildDeterministicProjectionInput,
): DeterministicProjectionPayload {
  const normalizedConfig = normalizeProjectionSafetyConfig(
    input.creation_config,
  );
  const goalMarkers = input.goals
    .map((goal, index) => ({
      id: goal.id ?? `goal-${index + 1}`,
      name: goal.name,
      target_date: goal.target_date,
      priority: goal.priority ?? 1,
    }))
    .sort((a, b) => a.target_date.localeCompare(b.target_date));

  const recoverySegments = deriveRecoverySegments(
    goalMarkers,
    normalizedConfig.post_goal_recovery_days,
    input.timeline.end_date,
  );

  const startDate = input.timeline.start_date;
  const endDate = input.timeline.end_date;
  const noHistory = input.no_history_context
    ? resolveNoHistoryAnchor(input.no_history_context)
    : null;

  const firstBlockMidpointTss = (() => {
    const firstBlockWithRange = [...input.blocks]
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .find((block) => block.target_weekly_tss_range);
    if (!firstBlockWithRange?.target_weekly_tss_range) {
      return null;
    }

    return round1(
      (firstBlockWithRange.target_weekly_tss_range.min +
        firstBlockWithRange.target_weekly_tss_range.max) /
        2,
    );
  })();

  const demandInformedSeedWeeklyTss =
    noHistory?.required_peak_weekly_tss?.min !== undefined &&
    noHistory.required_peak_weekly_tss.min !== null
      ? round1(Math.max(70, noHistory.required_peak_weekly_tss.min * 0.45))
      : null;

  const dynamicSeedWeeklyTss = (() => {
    if (
      firstBlockMidpointTss !== null &&
      Number.isFinite(firstBlockMidpointTss) &&
      demandInformedSeedWeeklyTss !== null
    ) {
      return round1(
        firstBlockMidpointTss * 0.65 + demandInformedSeedWeeklyTss * 0.35,
      );
    }

    if (
      firstBlockMidpointTss !== null &&
      Number.isFinite(firstBlockMidpointTss)
    ) {
      return round1(firstBlockMidpointTss);
    }

    if (demandInformedSeedWeeklyTss !== null) {
      return round1(demandInformedSeedWeeklyTss);
    }

    return 140;
  })();

  const effectiveStartingCtlInput =
    noHistory?.projection_floor_applied && noHistory.projection_floor_values
      ? (noHistory.starting_ctl_for_projection ?? undefined)
      : input.starting_ctl;
  const effectiveSeedWeeklyTss =
    noHistory?.projection_floor_applied && noHistory.projection_floor_values
      ? Math.max(
          dynamicSeedWeeklyTss,
          noHistory.starting_weekly_tss_for_projection ?? 0,
        )
      : dynamicSeedWeeklyTss;
  const noHistoryStartingWeeklyTss =
    noHistory?.projection_floor_applied && noHistory.projection_floor_values
      ? (noHistory.starting_weekly_tss_for_projection ?? 0)
      : null;
  const noHistoryStartWeeklyTssFloor =
    noHistory?.projection_floor_applied && noHistory.projection_floor_values
      ? noHistory.projection_floor_values.start_weekly_tss
      : null;
  const noHistoryTargetWeeklyTssFloor =
    noHistoryStartWeeklyTssFloor === null
      ? null
      : Math.max(noHistoryStartWeeklyTssFloor, noHistoryStartingWeeklyTss ?? 0);
  const noHistoryFloorHoldWeeks =
    noHistoryStartWeeklyTssFloor === null
      ? 0
      : Math.ceil(NO_HISTORY_DAYS_UNTIL_RELIABLE_PROJECTION / 7);
  const noHistoryWeeksToEvent = Math.max(0, noHistory?.weeks_to_event ?? 0);
  const evidenceConfidenceScore = noHistory?.evidence_confidence?.score ?? 0.25;
  const ctlSeedCandidate =
    effectiveStartingCtlInput !== undefined &&
    Number.isFinite(effectiveStartingCtlInput) &&
    effectiveStartingCtlInput > 0
      ? round1(effectiveStartingCtlInput)
      : null;
  const seedWeeklyTssFromCtl =
    ctlSeedCandidate === null ? null : deriveWeeklyTssFromCtl(ctlSeedCandidate);
  const seedWeeklyTss =
    seedWeeklyTssFromCtl === null
      ? effectiveSeedWeeklyTss
      : Math.max(effectiveSeedWeeklyTss, seedWeeklyTssFromCtl);
  const seedSource: "starting_ctl" | "dynamic_seed" =
    seedWeeklyTssFromCtl === null ? "dynamic_seed" : "starting_ctl";

  const startingCtl = Math.max(
    0,
    round1(
      effectiveStartingCtlInput === undefined
        ? effectiveSeedWeeklyTss / 7
        : effectiveStartingCtlInput,
    ),
  );
  const startingAtl = round1(startingCtl);
  const startingTsb = round1(startingCtl - startingAtl);
  const startingStateIsPrior = Boolean(noHistory?.projection_floor_applied);

  const microcycles: DeterministicProjectionMicrocycle[] = [];
  const points: DeterministicProjectionPoint[] = [];
  const dailySnapshotByDate = new Map<string, DeterministicProjectionPoint>();

  let currentCtl = startingCtl;
  let currentAtl = startingAtl;
  let previousWeekTss = seedWeeklyTss;
  let previousDemandFloorSignal: number | null = null;
  let projectionWeekIndex = 0;
  let tssRampClampWeeks = 0;
  let ctlRampClampWeeks = 0;
  let recoveryWeeks = 0;
  let maxRequiredDemandWeeklyTss = 0;
  let maxRequiredUnweightedDemandWeeklyTss = 0;
  let maxAppliedWeeklyTss = 0;

  for (
    let weekStartDate = startDate;
    weekStartDate <= endDate;
    weekStartDate = addDaysDateOnlyUtc(weekStartDate, 7)
  ) {
    const weekEndDate =
      addDaysDateOnlyUtc(weekStartDate, 6) <= endDate
        ? addDaysDateOnlyUtc(weekStartDate, 6)
        : endDate;
    const daysInWeek = diffDays(weekStartDate, weekEndDate) + 1;

    const weekSignals = resolveWeeklyLoadSignals({
      weekStartDate,
      weekEndDate,
      daysInWeek,
      projectionWeekIndex,
      previousWeekTss,
      previousDemandFloorSignal,
      effectiveSeedWeeklyTss,
      noHistory,
      noHistoryWeeksToEvent,
      noHistoryFloorHoldWeeks,
      noHistoryStartingWeeklyTss,
      noHistoryTargetWeeklyTssFloor,
      evidenceConfidenceScore,
      recoverySegments,
      goalMarkers,
      blocks: input.blocks,
    });

    if (weekSignals.enforceNoHistoryStartingFloor) {
      maxRequiredUnweightedDemandWeeklyTss = Math.max(
        maxRequiredUnweightedDemandWeeklyTss,
        weekSignals.rhythmAdjustedDemandFloor,
      );
    }

    const baselineCaps = applyWeeklyTssCaps({
      flooredWeeklyTss: weekSignals.flooredWeeklyTss,
      previousWeekTss,
      currentCtl,
      daysInWeek,
      normalizedConfig,
    });
    const optimizedWeeklyTss = optimizeWeeklyAppliedTss({
      input,
      normalizedConfig,
      goalMarkers,
      recoverySegments,
      endDate,
      noHistory,
      noHistoryWeeksToEvent,
      noHistoryFloorHoldWeeks,
      noHistoryStartingWeeklyTss,
      noHistoryTargetWeeklyTssFloor,
      evidenceConfidenceScore,
      effectiveSeedWeeklyTss,
      weekStartDate,
      weekEndDate,
      daysInWeek,
      projectionWeekIndex,
      currentCtl,
      currentAtl,
      previousWeekTss,
      previousDemandFloorSignal,
      flooredWeeklyTss: weekSignals.flooredWeeklyTss,
      weightedNoHistoryDemandFloor: weekSignals.weightedNoHistoryDemandFloor,
      maxAllowedByTssRamp: baselineCaps.maxAllowedByTssRamp,
    });
    const cappedDecision = applyWeeklyTssCaps({
      flooredWeeklyTss: weekSignals.flooredWeeklyTss,
      previousWeekTss,
      currentCtl,
      daysInWeek,
      normalizedConfig,
      preferredWeeklyTss: optimizedWeeklyTss,
    });
    const tssRampClamped = baselineCaps.tssRampClamped;
    if (tssRampClamped) {
      tssRampClampWeeks += 1;
    }
    const appliedWeeklyTss = cappedDecision.appliedWeeklyTss;
    if (weekSignals.weightedNoHistoryDemandFloor !== null) {
      maxRequiredDemandWeeklyTss = Math.max(
        maxRequiredDemandWeeklyTss,
        weekSignals.weightedNoHistoryDemandFloor,
      );
    }

    const ctlBeforeWeek = currentCtl;
    const atlBeforeWeek = currentAtl;
    const requestedCtlRamp = cappedDecision.requestedCtlRamp;
    const ctlRampClamped = cappedDecision.ctlRampClamped;
    if (ctlRampClamped) {
      ctlRampClampWeeks += 1;
    }

    const ctlAfterWeek = simulateCtlOverWeek(
      currentCtl,
      appliedWeeklyTss,
      daysInWeek,
    );
    const atlAfterWeek = simulateAtlOverWeek(
      currentAtl,
      appliedWeeklyTss,
      daysInWeek,
    );
    const appliedCtlRamp = ctlAfterWeek - ctlBeforeWeek;
    currentCtl = ctlAfterWeek;
    currentAtl = atlAfterWeek;
    maxAppliedWeeklyTss = Math.max(maxAppliedWeeklyTss, appliedWeeklyTss);

    if (weekSignals.recoveryOverlap.goal_ids.length > 0) {
      recoveryWeeks += 1;
    }

    for (let dayOffset = 0; dayOffset < daysInWeek; dayOffset += 1) {
      const dayDate = addDaysDateOnlyUtc(weekStartDate, dayOffset);
      const dayCtl = simulateCtlOverWeek(
        ctlBeforeWeek,
        appliedWeeklyTss,
        dayOffset + 1,
      );
      const dayAtl = simulateAtlOverWeek(
        atlBeforeWeek,
        appliedWeeklyTss,
        dayOffset + 1,
      );
      dailySnapshotByDate.set(dayDate, {
        date: dayDate,
        predicted_load_tss: appliedWeeklyTss,
        predicted_fitness_ctl: round1(dayCtl),
        predicted_fatigue_atl: round1(dayAtl),
        predicted_form_tsb: round1(dayCtl - dayAtl),
        readiness_score: 0,
      });
    }

    microcycles.push({
      week_start_date: weekStartDate,
      week_end_date: weekEndDate,
      phase: weekSignals.block?.name ?? "Build",
      pattern:
        weekSignals.recoveryOverlap.goal_ids.length > 0
          ? "recovery"
          : weekSignals.weekPattern.pattern,
      planned_weekly_tss: appliedWeeklyTss,
      projected_ctl: round1(currentCtl),
      metadata: {
        recovery: {
          active: weekSignals.recoveryOverlap.goal_ids.length > 0,
          goal_ids: weekSignals.recoveryOverlap.goal_ids,
          reduction_factor: weekSignals.recoveryReductionFactor,
        },
        tss_ramp: {
          previous_week_tss: round1(previousWeekTss),
          seed_weekly_tss: round1(seedWeeklyTss),
          seed_source: seedSource,
          rolling_base_weekly_tss: round1(weekSignals.baseWeeklyTss),
          rolling_base_components: {
            previous_week_tss: round1(previousWeekTss),
            block_midpoint_tss: round1(weekSignals.blockMidpointTss),
            demand_floor_tss:
              previousDemandFloorSignal === null
                ? null
                : round1(previousDemandFloorSignal),
            rationale_codes: weekSignals.rollingCompositionRationaleCodes,
          },
          requested_weekly_tss: weekSignals.flooredWeeklyTss,
          raw_requested_weekly_tss: weekSignals.recoveryAdjustedWeeklyTss,
          applied_weekly_tss: appliedWeeklyTss,
          max_weekly_tss_ramp_pct: normalizedConfig.max_weekly_tss_ramp_pct,
          clamped: tssRampClamped,
          floor_override_applied: weekSignals.floorOverrideApplied,
          floor_minimum_weekly_tss: weekSignals.enforceNoHistoryStartingFloor
            ? weekSignals.rhythmAdjustedDemandFloor
            : null,
          demand_band_minimum_weekly_tss:
            weekSignals.weightedNoHistoryDemandFloor,
          demand_gap_unmet_weekly_tss:
            weekSignals.weightedNoHistoryDemandFloor === null
              ? 0
              : Math.max(
                  0,
                  round1(
                    weekSignals.weightedNoHistoryDemandFloor - appliedWeeklyTss,
                  ),
                ),
          weekly_load_override_reason: weekSignals.floorOverrideApplied
            ? "demand_band_floor"
            : null,
        },
        ctl_ramp: {
          requested_ctl_ramp: round3(requestedCtlRamp),
          applied_ctl_ramp: round3(appliedCtlRamp),
          max_ctl_ramp_per_week: normalizedConfig.max_ctl_ramp_per_week,
          clamped: ctlRampClamped,
        },
      },
    });

    points.push({
      date: weekEndDate,
      predicted_load_tss: appliedWeeklyTss,
      predicted_fitness_ctl: round1(currentCtl),
      predicted_fatigue_atl: round1(currentAtl),
      predicted_form_tsb: round1(currentCtl - currentAtl),
      readiness_score: 0,
    });

    previousWeekTss = appliedWeeklyTss;
    previousDemandFloorSignal = weekSignals.weightedNoHistoryDemandFloor;
    projectionWeekIndex += 1;
  }

  for (const goal of goalMarkers) {
    if (points.some((point) => point.date === goal.target_date)) {
      continue;
    }

    const goalDaySnapshot = dailySnapshotByDate.get(goal.target_date);
    if (!goalDaySnapshot) {
      continue;
    }

    points.push(goalDaySnapshot);
  }

  points.sort((a, b) => a.date.localeCompare(b.date));

  const projectionFeasibility = computeProjectionFeasibilityMetadata({
    requiredPeakWeeklyTssTarget: Math.max(
      0,
      maxRequiredUnweightedDemandWeeklyTss ||
        noHistory?.required_peak_weekly_tss?.target ||
        maxRequiredDemandWeeklyTss ||
        0,
    ),
    feasiblePeakWeeklyTssApplied: Math.max(0, maxAppliedWeeklyTss),
    tssRampClampWeeks,
    ctlRampClampWeeks,
    confidence: evidenceConfidenceScore,
    projectionWeeks: Math.max(1, microcycles.length),
  });
  const pointReadinessScores = computeProjectionPointReadinessScores({
    points,
    planReadinessScore: projectionFeasibility.readiness_score,
    goals: goalMarkers,
  });
  const pointsWithReadiness = points.map((point, index) => ({
    ...point,
    readiness_score: pointReadinessScores[index] ?? 0,
  }));

  const optimizedPayload: DeterministicProjectionPayload = {
    start_date: startDate,
    end_date: endDate,
    points: pointsWithReadiness,
    goal_markers: goalMarkers,
    microcycles,
    recovery_segments: recoverySegments,
    constraint_summary: {
      normalized_creation_config: normalizedConfig,
      tss_ramp_clamp_weeks: tssRampClampWeeks,
      ctl_ramp_clamp_weeks: ctlRampClampWeeks,
      recovery_weeks: recoveryWeeks,
      starting_state: {
        starting_ctl: startingCtl,
        starting_atl: startingAtl,
        starting_tsb: startingTsb,
        starting_state_is_prior: startingStateIsPrior,
      },
    },
    no_history: {
      projection_floor_applied: noHistory?.projection_floor_applied ?? false,
      projection_floor_values: noHistory?.projection_floor_values ?? null,
      fitness_level: noHistory?.fitness_level ?? null,
      fitness_inference_reasons: noHistory?.fitness_inference_reasons ?? [],
      projection_floor_confidence:
        noHistory?.projection_floor_confidence ?? null,
      floor_clamped_by_availability:
        noHistory?.floor_clamped_by_availability ?? false,
      starting_ctl_for_projection:
        noHistory?.starting_ctl_for_projection ?? null,
      starting_weekly_tss_for_projection:
        noHistory?.starting_weekly_tss_for_projection ?? null,
      required_event_demand_range:
        noHistory?.required_event_demand_range ?? null,
      required_peak_weekly_tss: noHistory?.required_peak_weekly_tss ?? null,
      demand_confidence: noHistory?.demand_confidence ?? null,
      evidence_confidence: noHistory?.evidence_confidence ?? null,
      projection_feasibility: projectionFeasibility,
    },
  };

  if (input.disable_weekly_tss_optimizer) {
    return optimizedPayload;
  }

  const baselinePayload = buildDeterministicProjectionPayload({
    ...input,
    disable_weekly_tss_optimizer: true,
  });
  const optimizedReadiness = computeWeightedGoalDateReadiness({
    points: optimizedPayload.points,
    goals: optimizedPayload.goal_markers,
  });
  const baselineReadiness = computeWeightedGoalDateReadiness({
    points: baselinePayload.points,
    goals: baselinePayload.goal_markers,
  });

  if (optimizedReadiness < baselineReadiness) {
    return baselinePayload;
  }

  return optimizedPayload;
}

function simulateCtlOverWeek(
  startingCtl: number,
  weeklyTss: number,
  days: number,
): number {
  let ctl = startingCtl;
  const dailyTss = weeklyTss / Math.max(1, days);
  for (let day = 0; day < days; day += 1) {
    ctl = calculateCTL(ctl, dailyTss);
  }

  return ctl;
}

function simulateAtlOverWeek(
  startingAtl: number,
  weeklyTss: number,
  days: number,
): number {
  let atl = startingAtl;
  const dailyTss = weeklyTss / Math.max(1, days);
  for (let day = 0; day < days; day += 1) {
    atl = calculateATL(atl, dailyTss);
  }

  return atl;
}

function findWeeklyTssForCtlRampLimit(
  startingCtl: number,
  upperWeeklyTss: number,
  maxCtlRampPerWeek: number,
  days: number,
): number {
  let low = 0;
  let high = upperWeeklyTss;

  for (let i = 0; i < 20; i += 1) {
    const mid = (low + high) / 2;
    const ctlAfter = simulateCtlOverWeek(startingCtl, mid, days);
    const ctlRamp = ctlAfter - startingCtl;
    if (ctlRamp > maxCtlRampPerWeek) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return round1(low);
}

function findBlockForDate(
  blocks: BuildDeterministicProjectionInput["blocks"],
  date: string,
) {
  return blocks.find(
    (block) => block.start_date <= date && block.end_date >= date,
  );
}

function deriveRecoverySegments(
  goals: DeterministicProjectionGoalMarker[],
  recoveryDays: number,
  timelineEndDate: string,
): ProjectionRecoverySegment[] {
  if (recoveryDays <= 0) {
    return [];
  }

  return goals
    .map((goal) => {
      const recoveryStartDate = addDaysDateOnlyUtc(goal.target_date, 1);
      const rawRecoveryEndDate = addDaysDateOnlyUtc(
        recoveryStartDate,
        recoveryDays - 1,
      );
      const recoveryEndDate =
        rawRecoveryEndDate <= timelineEndDate
          ? rawRecoveryEndDate
          : timelineEndDate;

      if (
        recoveryStartDate > timelineEndDate ||
        recoveryStartDate > recoveryEndDate
      ) {
        return null;
      }

      return {
        goal_id: goal.id,
        goal_name: goal.name,
        start_date: recoveryStartDate,
        end_date: recoveryEndDate,
      };
    })
    .filter(
      (segment): segment is ProjectionRecoverySegment => segment !== null,
    );
}

function findRecoveryOverlap(
  segments: ProjectionRecoverySegment[],
  weekStartDate: string,
  weekEndDate: string,
): { overlap_days: number; goal_ids: string[] } {
  let overlapDays = 0;
  const goalIds: string[] = [];
  const maxWeekDays = diffDays(weekStartDate, weekEndDate) + 1;

  for (const segment of segments) {
    const overlapStart =
      segment.start_date > weekStartDate ? segment.start_date : weekStartDate;
    const overlapEnd =
      segment.end_date < weekEndDate ? segment.end_date : weekEndDate;
    if (overlapStart > overlapEnd) {
      continue;
    }

    overlapDays += diffDays(overlapStart, overlapEnd) + 1;
    goalIds.push(segment.goal_id);
  }

  return {
    overlap_days: Math.min(overlapDays, maxWeekDays),
    goal_ids: [...new Set(goalIds)],
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

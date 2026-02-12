import { calculateCTL } from "../calculations";
import type { CreationContextSummary } from "../schemas/training_plan_structure";
import { countAvailableTrainingDays } from "./availabilityUtils";
import { addDaysDateOnlyUtc, diffDateOnlyUtcDays } from "./dateOnlyUtc";

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
  Record<
    NoHistoryGoalTier,
    { start_ctl_floor: number; target_event_ctl: number }
  >
> = {
  weak: {
    low: { start_ctl_floor: 20, target_event_ctl: 35 },
    medium: { start_ctl_floor: 28, target_event_ctl: 50 },
    high: { start_ctl_floor: 35, target_event_ctl: 70 },
  },
  strong: {
    low: { start_ctl_floor: 30, target_event_ctl: 45 },
    medium: { start_ctl_floor: 40, target_event_ctl: 60 },
    high: { start_ctl_floor: 50, target_event_ctl: 85 },
  },
};

export function weeklyLoadFromBlockAndBaseline(
  block:
    | {
        target_weekly_tss_range?: { min: number; max: number };
      }
    | undefined,
  baselineWeeklyTss: number,
): number {
  const targetRange = block?.target_weekly_tss_range;
  if (!targetRange) {
    return Math.round(baselineWeeklyTss * 10) / 10;
  }

  const midpoint = (targetRange.min + targetRange.max) / 2;
  const blendedWeeklyTss = baselineWeeklyTss * 0.35 + midpoint * 0.65;
  return Math.round(blendedWeeklyTss * 10) / 10;
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

  return {
    goalTier,
    fitnessLevel,
    start_ctl_floor: startCtlFloor,
    start_weekly_tss_floor: deriveWeeklyTssFromCtl(startCtlFloor),
    target_event_ctl: row.target_event_ctl,
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

/**
 * Resolves deterministic no-history floor anchor metadata.
 */
export function resolveNoHistoryAnchor(
  context: NoHistoryAnchorContext,
): NoHistoryAnchorResolution {
  if (context.history_availability_state !== "none") {
    return {
      projection_floor_applied: false,
      projection_floor_values: null,
      fitness_level: null,
      fitness_inference_reasons: ["no_history_gate_inactive"],
      projection_floor_confidence: null,
      floor_clamped_by_availability: false,
      projection_floor_tier: null,
      starting_state_is_prior: false,
      target_event_ctl: null,
      weeks_to_event: null,
      periodization_feasibility: null,
      build_phase_warnings: [],
      assumed_intensity_model_version: null,
      starting_ctl_for_projection: null,
      starting_weekly_tss_for_projection: null,
    };
  }

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

  return {
    projection_floor_applied: true,
    projection_floor_values: {
      start_ctl: clamped.start_ctl,
      start_weekly_tss: clamped.start_weekly_tss,
    },
    fitness_level: fitness.fitnessLevel,
    fitness_inference_reasons: [
      ...fitness.reasons,
      ...evidence.rationale_codes,
      ...clamped.reasons,
      ...confidenceReasons,
      hasStartingCtlOverride
        ? "starting_ctl_override_applied"
        : "starting_ctl_defaulted_never_trained",
    ],
    projection_floor_confidence: confidence,
    floor_clamped_by_availability: clamped.floor_clamped_by_availability,
    projection_floor_tier: context.goal_tier,
    starting_state_is_prior: true,
    target_event_ctl: floor.target_event_ctl,
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

type OptimizationProfile = "outcome_first" | "balanced" | "sustainable";

const PROJECTION_PROFILE_DEFAULTS: Record<
  OptimizationProfile,
  {
    post_goal_recovery_days: number;
    max_weekly_tss_ramp_pct: number;
    max_ctl_ramp_per_week: number;
  }
> = {
  outcome_first: {
    post_goal_recovery_days: 3,
    max_weekly_tss_ramp_pct: 10,
    max_ctl_ramp_per_week: 5,
  },
  balanced: {
    post_goal_recovery_days: 5,
    max_weekly_tss_ramp_pct: 7,
    max_ctl_ramp_per_week: 3,
  },
  sustainable: {
    post_goal_recovery_days: 7,
    max_weekly_tss_ramp_pct: 5,
    max_ctl_ramp_per_week: 2,
  },
};

export interface ProjectionSafetyConfigInput {
  optimization_profile?: OptimizationProfile;
  post_goal_recovery_days?: number;
  max_weekly_tss_ramp_pct?: number;
  max_ctl_ramp_per_week?: number;
}

export interface ProjectionSafetyConfig {
  optimization_profile: OptimizationProfile;
  post_goal_recovery_days: number;
  max_weekly_tss_ramp_pct: number;
  max_ctl_ramp_per_week: number;
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
    raw_requested_weekly_tss: number;
    applied_weekly_tss: number;
    max_weekly_tss_ramp_pct: number;
    clamped: boolean;
    floor_override_applied: boolean;
    floor_minimum_weekly_tss: number | null;
    weekly_load_override_reason: "no_history_floor" | null;
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
  baseline_weekly_tss: number;
  starting_ctl?: number;
  creation_config?: ProjectionSafetyConfigInput;
  no_history_context?: NoHistoryAnchorContext;
}

/**
 * Normalizes safety controls for deterministic projection behavior.
 */
export function normalizeProjectionSafetyConfig(
  input: ProjectionSafetyConfigInput | undefined,
): ProjectionSafetyConfig {
  const profile = input?.optimization_profile ?? "balanced";
  const defaults = PROJECTION_PROFILE_DEFAULTS[profile];

  return {
    optimization_profile: profile,
    post_goal_recovery_days: Math.max(
      0,
      Math.min(
        28,
        Math.round(
          input?.post_goal_recovery_days ?? defaults.post_goal_recovery_days,
        ),
      ),
    ),
    max_weekly_tss_ramp_pct: Math.max(
      0,
      Math.min(
        20,
        input?.max_weekly_tss_ramp_pct ?? defaults.max_weekly_tss_ramp_pct,
      ),
    ),
    max_ctl_ramp_per_week: Math.max(
      0,
      Math.min(
        8,
        input?.max_ctl_ramp_per_week ?? defaults.max_ctl_ramp_per_week,
      ),
    ),
  };
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
  const baselineWeeklyTssInput = Math.max(0, round1(input.baseline_weekly_tss));
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

  const effectiveStartingCtlInput =
    noHistory?.projection_floor_applied && noHistory.projection_floor_values
      ? (noHistory.starting_ctl_for_projection ?? undefined)
      : input.starting_ctl;
  const effectiveBaselineWeeklyTss =
    noHistory?.projection_floor_applied && noHistory.projection_floor_values
      ? Math.max(
          baselineWeeklyTssInput,
          noHistory.starting_weekly_tss_for_projection ?? 0,
        )
      : baselineWeeklyTssInput;
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

  const startingCtl = Math.max(
    0,
    round1(
      effectiveStartingCtlInput === undefined
        ? effectiveBaselineWeeklyTss / 7
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
  let previousWeekTss = effectiveBaselineWeeklyTss;
  let projectionWeekIndex = 0;
  let tssRampClampWeeks = 0;
  let ctlRampClampWeeks = 0;
  let recoveryWeeks = 0;

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

    const block = findBlockForDate(input.blocks, weekStartDate);
    const weekIndexWithinBlock = block
      ? Math.max(0, Math.floor(diffDays(block.start_date, weekStartDate) / 7))
      : 0;
    const weekPattern = getProjectionWeekPattern({
      blockPhase: block?.phase ?? "build",
      weekIndexWithinBlock,
      weekStartDate,
      weekEndDate,
      goals: goalMarkers,
    });

    const baseWeeklyTss = weeklyLoadFromBlockAndBaseline(
      block,
      effectiveBaselineWeeklyTss,
    );
    const requestedWeeklyTss = Math.max(
      0,
      round1(baseWeeklyTss * weekPattern.multiplier),
    );

    const recoveryOverlap = findRecoveryOverlap(
      recoverySegments,
      weekStartDate,
      weekEndDate,
    );
    const recoveryCoverage =
      recoveryOverlap.overlap_days / Math.max(1, daysInWeek);
    const recoveryReductionFactor = round3(1 - 0.35 * recoveryCoverage);
    const recoveryAdjustedWeeklyTss = Math.max(
      0,
      round1(requestedWeeklyTss * recoveryReductionFactor),
    );
    const enforceNoHistoryStartingFloor =
      noHistoryTargetWeeklyTssFloor !== null &&
      projectionWeekIndex < noHistoryWeeksToEvent &&
      noHistoryTargetWeeklyTssFloor !== null &&
      recoveryOverlap.goal_ids.length === 0 &&
      weekPattern.pattern !== "taper" &&
      weekPattern.pattern !== "event";
    const noHistoryInitialRampFloor =
      enforceNoHistoryStartingFloor && noHistoryStartingWeeklyTss !== null
        ? projectionWeekIndex < noHistoryFloorHoldWeeks
          ? round1(
              noHistoryStartingWeeklyTss +
                (noHistoryTargetWeeklyTssFloor - noHistoryStartingWeeklyTss) *
                  Math.min(
                    1,
                    Math.max(0, projectionWeekIndex) /
                      Math.max(1, noHistoryFloorHoldWeeks - 1),
                  ),
            )
          : noHistoryTargetWeeklyTssFloor
        : null;
    const noHistoryGoalDemandFloor =
      enforceNoHistoryStartingFloor &&
      noHistory?.target_event_ctl !== null &&
      noHistory?.target_event_ctl !== undefined &&
      noHistoryWeeksToEvent > 0
        ? round1(
            (noHistory.starting_ctl_for_projection ?? 0) *
              (1 -
                Math.min(
                  1,
                  (projectionWeekIndex + 1) / noHistoryWeeksToEvent,
                )) +
              noHistory.target_event_ctl *
                Math.min(1, (projectionWeekIndex + 1) / noHistoryWeeksToEvent),
          ) * 7
        : null;
    const noHistoryProgressiveFloor = Math.max(
      noHistoryInitialRampFloor ?? 0,
      noHistoryGoalDemandFloor ?? 0,
    );
    const floorOverrideApplied =
      enforceNoHistoryStartingFloor &&
      recoveryAdjustedWeeklyTss < noHistoryProgressiveFloor;
    const flooredWeeklyTss = enforceNoHistoryStartingFloor
      ? Math.max(recoveryAdjustedWeeklyTss, noHistoryProgressiveFloor)
      : recoveryAdjustedWeeklyTss;

    const maxAllowedByTssRamp = round1(
      previousWeekTss * (1 + normalizedConfig.max_weekly_tss_ramp_pct / 100),
    );
    const tssRampClamped = flooredWeeklyTss > maxAllowedByTssRamp;
    if (tssRampClamped) {
      tssRampClampWeeks += 1;
    }
    let appliedWeeklyTss = tssRampClamped
      ? maxAllowedByTssRamp
      : flooredWeeklyTss;

    const ctlBeforeWeek = currentCtl;
    const requestedCtlAfterWeek = simulateCtlOverWeek(
      currentCtl,
      appliedWeeklyTss,
      daysInWeek,
    );
    const requestedCtlRamp = requestedCtlAfterWeek - ctlBeforeWeek;

    let ctlRampClamped = false;
    if (requestedCtlRamp > normalizedConfig.max_ctl_ramp_per_week) {
      ctlRampClamped = true;
      ctlRampClampWeeks += 1;
      appliedWeeklyTss = findWeeklyTssForCtlRampLimit(
        currentCtl,
        appliedWeeklyTss,
        normalizedConfig.max_ctl_ramp_per_week,
        daysInWeek,
      );
    }

    const ctlAfterWeek = simulateCtlOverWeek(
      currentCtl,
      appliedWeeklyTss,
      daysInWeek,
    );
    const appliedCtlRamp = ctlAfterWeek - ctlBeforeWeek;
    currentCtl = ctlAfterWeek;

    if (recoveryOverlap.goal_ids.length > 0) {
      recoveryWeeks += 1;
    }

    for (let dayOffset = 0; dayOffset < daysInWeek; dayOffset += 1) {
      const dayDate = addDaysDateOnlyUtc(weekStartDate, dayOffset);
      const dayCtl = simulateCtlOverWeek(
        ctlBeforeWeek,
        appliedWeeklyTss,
        dayOffset + 1,
      );
      dailySnapshotByDate.set(dayDate, {
        date: dayDate,
        predicted_load_tss: appliedWeeklyTss,
        predicted_fitness_ctl: round1(dayCtl),
      });
    }

    microcycles.push({
      week_start_date: weekStartDate,
      week_end_date: weekEndDate,
      phase: block?.name ?? "Build",
      pattern:
        recoveryOverlap.goal_ids.length > 0 ? "recovery" : weekPattern.pattern,
      planned_weekly_tss: appliedWeeklyTss,
      projected_ctl: round1(currentCtl),
      metadata: {
        recovery: {
          active: recoveryOverlap.goal_ids.length > 0,
          goal_ids: recoveryOverlap.goal_ids,
          reduction_factor: recoveryReductionFactor,
        },
        tss_ramp: {
          previous_week_tss: round1(previousWeekTss),
          requested_weekly_tss: flooredWeeklyTss,
          raw_requested_weekly_tss: recoveryAdjustedWeeklyTss,
          applied_weekly_tss: appliedWeeklyTss,
          max_weekly_tss_ramp_pct: normalizedConfig.max_weekly_tss_ramp_pct,
          clamped: tssRampClamped,
          floor_override_applied: floorOverrideApplied,
          floor_minimum_weekly_tss: enforceNoHistoryStartingFloor
            ? noHistoryProgressiveFloor
            : null,
          weekly_load_override_reason: floorOverrideApplied
            ? "no_history_floor"
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
    });

    previousWeekTss = appliedWeeklyTss;
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

  return {
    start_date: startDate,
    end_date: endDate,
    points,
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
    },
  };
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

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

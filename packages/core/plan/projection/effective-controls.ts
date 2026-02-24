import type { TrainingPlanCalibrationConfig } from "../../schemas/training_plan_structure";
import type {
  OptimizationProfile,
  ProjectionSafetyConfig,
} from "./safety-caps";
import {
  ABSOLUTE_MAX_CTL_RAMP_PER_WEEK,
  ABSOLUTE_MAX_WEEKLY_TSS_RAMP_PCT,
} from "./safety-caps";
import { getMpcProfileBounds } from "./mpc/lattice";

export interface EffectiveProjectionControls {
  behavior_controls: ResolvedBehaviorControls;
  optimizer: {
    preparedness_weight: number;
    risk_penalty_weight: number;
    volatility_penalty_weight: number;
    churn_penalty_weight: number;
    lookahead_weeks: number;
    candidate_steps: number;
  };
  ramp_caps: {
    max_weekly_tss_ramp_pct: number;
    max_ctl_ramp_per_week: number;
  };
  curvature: {
    target: number;
    strength: number;
    weight: number;
  };
}

export type CurvatureEnvelopePattern =
  | "ramp"
  | "deload"
  | "taper"
  | "event"
  | "recovery";

interface ResolveEffectiveProjectionControlsInput {
  normalized_config: ProjectionSafetyConfig;
  calibration: TrainingPlanCalibrationConfig;
  behavior_controls_v1?: ProjectionBehaviorControlsV1Input;
}

interface ProjectionBehaviorControlsV1Input {
  aggressiveness?: number;
  variability?: number;
  spike_frequency?: number;
  shape_target?: number;
  shape_strength?: number;
  recovery_priority?: number;
  starting_fitness_confidence?: number;
}

interface ResolvedBehaviorControls {
  aggressiveness: number;
  variability: number;
  spike_frequency: number;
  shape_target: number;
  shape_strength: number;
  recovery_priority: number;
  starting_fitness_confidence: number;
}

const BEHAVIOR_CONTROL_DEFAULTS: ResolvedBehaviorControls = {
  aggressiveness: 0.5,
  variability: 0.5,
  spike_frequency: 0.35,
  shape_target: 0,
  shape_strength: 0.35,
  recovery_priority: 0.6,
  starting_fitness_confidence: 0.6,
};

const OPTIMIZER_SCHEMA_BOUNDS = {
  lookahead_weeks: { min: 1, max: 8 },
  candidate_steps: { min: 3, max: 15 },
};

const CURVATURE_WEIGHT_MAX = 18;
const CURVATURE_TARGET_SCALE = 0.18;

/**
 * Resolves semantic projection controls into effective deterministic optimizer
 * parameters, ramp caps, and curvature settings.
 */
export function resolveEffectiveProjectionControls(
  input: ResolveEffectiveProjectionControlsInput,
): EffectiveProjectionControls {
  const behaviorControls = normalizeBehaviorControls(
    input.behavior_controls_v1,
  );
  const aggressiveness = behaviorControls.aggressiveness;
  const variability = behaviorControls.variability;
  const spikeFrequency = behaviorControls.spike_frequency;
  const recoveryPriority = behaviorControls.recovery_priority;
  const startingFitnessConfidence =
    behaviorControls.starting_fitness_confidence;

  const profileBounds = getMpcProfileBounds(
    input.normalized_config.optimization_profile,
  );
  const maxLookahead = Math.min(
    OPTIMIZER_SCHEMA_BOUNDS.lookahead_weeks.max,
    profileBounds.horizon_weeks,
  );
  const maxCandidateSteps = Math.min(
    OPTIMIZER_SCHEMA_BOUNDS.candidate_steps.max,
    profileBounds.candidate_count,
  );

  const baseOptimizer = input.calibration.optimizer;
  const baseLookahead = clampInteger(
    baseOptimizer.lookahead_weeks,
    OPTIMIZER_SCHEMA_BOUNDS.lookahead_weeks.min,
    maxLookahead,
  );
  const baseCandidateSteps = clampInteger(
    baseOptimizer.candidate_steps,
    OPTIMIZER_SCHEMA_BOUNDS.candidate_steps.min,
    maxCandidateSteps,
  );

  const preparednessScale = lerp(0.82, 1.5, aggressiveness);
  const recoveryPreparednessScale = lerp(1.08, 0.82, recoveryPriority);
  const confidencePreparednessScale = lerp(
    0.88,
    1.08,
    startingFitnessConfidence,
  );
  const riskScale =
    lerp(1.45, 0.62, aggressiveness) *
    lerp(0.85, 1.4, recoveryPriority) *
    lerp(1.3, 0.82, startingFitnessConfidence) *
    lerp(1.18, 0.86, spikeFrequency);
  const volatilityScale =
    lerp(1.6, 0.58, variability) * lerp(0.9, 1.3, recoveryPriority);
  const churnScale =
    lerp(1.52, 0.64, variability) * lerp(0.92, 1.28, recoveryPriority);
  const lookaheadTarget =
    baseLookahead +
    (maxLookahead - baseLookahead) * lerp(0.35, 1, aggressiveness);
  const candidateTarget =
    baseCandidateSteps +
    (maxCandidateSteps - baseCandidateSteps) *
      clampNumber(
        0.55 * aggressiveness + 0.3 * spikeFrequency + 0.15 * variability,
        0,
        1,
      );

  return {
    behavior_controls: behaviorControls,
    optimizer: {
      preparedness_weight: round3(
        baseOptimizer.preparedness_weight *
          preparednessScale *
          recoveryPreparednessScale *
          confidencePreparednessScale,
      ),
      risk_penalty_weight: round3(
        baseOptimizer.risk_penalty_weight * riskScale,
      ),
      volatility_penalty_weight: round3(
        baseOptimizer.volatility_penalty_weight * volatilityScale,
      ),
      churn_penalty_weight: round3(
        baseOptimizer.churn_penalty_weight * churnScale,
      ),
      lookahead_weeks: clampInteger(
        Math.round(lookaheadTarget),
        OPTIMIZER_SCHEMA_BOUNDS.lookahead_weeks.min,
        maxLookahead,
      ),
      candidate_steps: clampInteger(
        Math.round(candidateTarget),
        OPTIMIZER_SCHEMA_BOUNDS.candidate_steps.min,
        maxCandidateSteps,
      ),
    },
    ramp_caps: {
      max_weekly_tss_ramp_pct: round3(
        clampNumber(
          input.normalized_config.max_weekly_tss_ramp_pct,
          0,
          ABSOLUTE_MAX_WEEKLY_TSS_RAMP_PCT,
        ),
      ),
      max_ctl_ramp_per_week: round3(
        clampNumber(
          input.normalized_config.max_ctl_ramp_per_week,
          0,
          ABSOLUTE_MAX_CTL_RAMP_PER_WEEK,
        ),
      ),
    },
    curvature: {
      target: behaviorControls.shape_target,
      strength: behaviorControls.shape_strength,
      weight: round3(
        lerp(0, CURVATURE_WEIGHT_MAX, behaviorControls.shape_strength),
      ),
    },
  };
}

/**
 * Builds a deterministic envelope for curvature shaping by phase.
 * Build/ramp remains emphasized while taper/recovery decay strongly.
 */
export function buildCurvatureEnvelope(input: {
  pattern: CurvatureEnvelopePattern;
  week_index: number;
}): number {
  const phaseWeight = resolvePhaseWeight(input.pattern);
  const horizonDecay = clampNumber(1 - input.week_index * 0.04, 0.35, 1);
  return round3(phaseWeight * horizonDecay);
}

/**
 * Computes mean squared second-difference mismatch against curvature target.
 */
export function computeCurvaturePenalty(input: {
  previous_week_tss: number;
  weekly_actions: number[];
  envelopes: number[];
  curvature: number;
  scale_reference: number;
}): number {
  if (input.weekly_actions.length < 2) {
    return 0;
  }

  const series = [input.previous_week_tss, ...input.weekly_actions];
  const safeScale = Math.max(20, input.scale_reference * 0.12);
  let penalty = 0;
  let samples = 0;

  for (let t = 1; t < input.weekly_actions.length; t += 1) {
    const currentDelta = (series[t + 1] ?? 0) - (series[t] ?? 0);
    const previousDelta = (series[t] ?? 0) - (series[t - 1] ?? 0);
    const delta2 = (currentDelta - previousDelta) / safeScale;
    const envelope =
      input.envelopes[t] ?? input.envelopes[input.envelopes.length - 1] ?? 0;
    const kappa = input.curvature * envelope * CURVATURE_TARGET_SCALE;

    penalty += (delta2 - kappa) ** 2;
    samples += 1;
  }

  if (samples === 0) {
    return 0;
  }

  return round6(penalty / samples);
}

function normalizeBehaviorControls(
  input: ProjectionBehaviorControlsV1Input | undefined,
): ResolvedBehaviorControls {
  return {
    aggressiveness: clampNumber(
      input?.aggressiveness ?? BEHAVIOR_CONTROL_DEFAULTS.aggressiveness,
      0,
      1,
    ),
    variability: clampNumber(
      input?.variability ?? BEHAVIOR_CONTROL_DEFAULTS.variability,
      0,
      1,
    ),
    spike_frequency: clampNumber(
      input?.spike_frequency ?? BEHAVIOR_CONTROL_DEFAULTS.spike_frequency,
      0,
      1,
    ),
    shape_target: clampNumber(
      input?.shape_target ?? BEHAVIOR_CONTROL_DEFAULTS.shape_target,
      -1,
      1,
    ),
    shape_strength: clampNumber(
      input?.shape_strength ?? BEHAVIOR_CONTROL_DEFAULTS.shape_strength,
      0,
      1,
    ),
    recovery_priority: clampNumber(
      input?.recovery_priority ?? BEHAVIOR_CONTROL_DEFAULTS.recovery_priority,
      0,
      1,
    ),
    starting_fitness_confidence: clampNumber(
      input?.starting_fitness_confidence ??
        BEHAVIOR_CONTROL_DEFAULTS.starting_fitness_confidence,
      0,
      1,
    ),
  };
}

function resolvePhaseWeight(pattern: CurvatureEnvelopePattern): number {
  switch (pattern) {
    case "ramp":
      return 1;
    case "deload":
      return 0.45;
    case "taper":
      return 0.15;
    case "event":
      return 0.1;
    case "recovery":
      return 0.08;
  }
}

function clampNumber(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

function clampInteger(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  return Math.max(minValue, Math.min(maxValue, Math.round(value)));
}

function lerp(minValue: number, maxValue: number, alpha: number): number {
  return minValue + (maxValue - minValue) * clampNumber(alpha, 0, 1);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function resolveProfileSearchBounds(profile: OptimizationProfile): {
  lookahead_weeks: { min: number; max: number };
  candidate_steps: { min: number; max: number };
} {
  const profileBounds = getMpcProfileBounds(profile);
  return {
    lookahead_weeks: {
      min: OPTIMIZER_SCHEMA_BOUNDS.lookahead_weeks.min,
      max: Math.min(
        OPTIMIZER_SCHEMA_BOUNDS.lookahead_weeks.max,
        profileBounds.horizon_weeks,
      ),
    },
    candidate_steps: {
      min: OPTIMIZER_SCHEMA_BOUNDS.candidate_steps.min,
      max: Math.min(
        OPTIMIZER_SCHEMA_BOUNDS.candidate_steps.max,
        profileBounds.candidate_count,
      ),
    },
  };
}

import type {
  CapacityEnvelopeResult,
  EvidenceState,
} from "./capacity-envelope";
import type {
  TrainingPlanCalibrationConfig,
  GoalTargetV2,
} from "../../schemas/training_plan_structure";
import {
  computePostEventFatiguePenalty,
  computeEventRecoveryProfile,
} from "./event-recovery";
import {
  READINESS_TIMELINE,
  computeOptimalTsb,
  computeDynamicFormWeight,
} from "../calibration-constants";

type ProjectionMicrocyclePattern =
  | "ramp"
  | "deload"
  | "taper"
  | "event"
  | "recovery";

export type ReadinessBand = "low" | "medium" | "high";

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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export interface CompositeReadinessInput {
  target_attainment_score: number;
  durability_score: number;
  evidence_score: number;
  envelope: CapacityEnvelopeResult;
  evidence_state?: EvidenceState;
  composite_weights?: TrainingPlanCalibrationConfig["readiness_composite"];
}

export interface CompositeReadinessResult {
  target_attainment_score: number;
  envelope_score: number;
  durability_score: number;
  evidence_score: number;
  readiness_score: number;
  readiness_confidence: number;
  readiness_rationale_codes: string[];
}

export function computeDurabilityScore(input: {
  weekly_tss: number[];
  durability_penalties?: TrainingPlanCalibrationConfig["durability_penalties"];
}): number {
  const durabilityPenalties = input.durability_penalties;
  const monotonyThreshold = durabilityPenalties?.monotony_threshold ?? 2;
  const monotonyScale = durabilityPenalties?.monotony_scale ?? 2;
  const strainThreshold = durabilityPenalties?.strain_threshold ?? 900;
  const strainScale = durabilityPenalties?.strain_scale ?? 900;
  const deloadDebtScale = durabilityPenalties?.deload_debt_scale ?? 6;

  if (input.weekly_tss.length === 0) {
    return 80;
  }

  const mean =
    input.weekly_tss.reduce((sum, value) => sum + Math.max(0, value), 0) /
    input.weekly_tss.length;
  const variance =
    input.weekly_tss.reduce((sum, value) => {
      const delta = Math.max(0, value) - mean;
      return sum + delta * delta;
    }, 0) / input.weekly_tss.length;
  const stdDev = Math.sqrt(variance);
  const monotony = mean / Math.max(1, stdDev);
  const strain = mean * monotony;

  let deloadDebtWeeks = 0;
  for (let index = 1; index < input.weekly_tss.length; index += 1) {
    const prev = Math.max(1, input.weekly_tss[index - 1] ?? 0);
    const curr = Math.max(0, input.weekly_tss[index] ?? 0);
    if (curr > prev * 0.96) {
      deloadDebtWeeks += 1;
    }
  }

  const monotonyPenalty =
    clamp01((monotony - monotonyThreshold) / Math.max(0.1, monotonyScale)) * 34;
  const strainPenalty =
    clamp01((strain - strainThreshold) / Math.max(1, strainScale)) * 28;
  const deloadDebtPenalty =
    clamp01(deloadDebtWeeks / Math.max(0.5, deloadDebtScale)) * 22;
  return clampScore(100 - monotonyPenalty - strainPenalty - deloadDebtPenalty);
}

export function computeCompositeReadiness(
  input: CompositeReadinessInput,
): CompositeReadinessResult {
  const targetAttainmentScore = clampScore(input.target_attainment_score);
  const envelopeScore = clampScore(input.envelope.envelope_score);
  const durabilityScore = clampScore(input.durability_score);
  const evidenceScore = clampScore(input.evidence_score);
  const compositeWeights = input.composite_weights;
  const targetWeight = compositeWeights?.target_attainment_weight ?? 0.45;
  const envelopeWeight = compositeWeights?.envelope_weight ?? 0.3;
  const durabilityWeight = compositeWeights?.durability_weight ?? 0.15;
  const evidenceWeight = compositeWeights?.evidence_weight ?? 0.1;

  const readinessRaw =
    targetAttainmentScore * targetWeight +
    envelopeScore * envelopeWeight +
    durabilityScore * durabilityWeight +
    evidenceScore * evidenceWeight;
  const readinessScore = clampScore(readinessRaw);

  const baseConfidence =
    evidenceScore * 0.7 + envelopeScore * 0.2 + durabilityScore * 0.1;
  const evidenceCap =
    input.evidence_state === "none"
      ? 58
      : input.evidence_state === "sparse"
        ? 72
        : input.evidence_state === "stale"
          ? 68
          : 92;
  const readinessConfidence = clampScore(Math.min(evidenceCap, baseConfidence));

  const rationaleCodes = [
    ...(targetAttainmentScore < 60
      ? ["readiness_penalty_target_attainment_low"]
      : ["readiness_credit_target_attainment_strong"]),
    ...(envelopeScore < 65
      ? ["readiness_penalty_capacity_envelope_outside"]
      : envelopeScore < 85
        ? ["readiness_penalty_capacity_envelope_edge"]
        : ["readiness_credit_capacity_envelope_inside"]),
    ...(durabilityScore < 60 ? ["readiness_penalty_durability_low"] : []),
    ...(evidenceScore < 55
      ? ["readiness_penalty_evidence_low"]
      : evidenceScore >= 80
        ? ["readiness_credit_evidence_high"]
        : []),
    ...input.envelope.limiting_factors.map(
      (factor) => `readiness_envelope_limiter_${factor}`,
    ),
  ];

  return {
    target_attainment_score: targetAttainmentScore,
    envelope_score: envelopeScore,
    durability_score: durabilityScore,
    evidence_score: evidenceScore,
    readiness_score: readinessScore,
    readiness_confidence: readinessConfidence,
    readiness_rationale_codes: [...new Set(rationaleCodes)],
  };
}

export function blendDemandWithConfidence(input: {
  demandFloorWeeklyTss: number | null;
  conservativeBaselineWeeklyTss: number;
  confidence: number;
}): number | null {
  if (input.demandFloorWeeklyTss === null) {
    return null;
  }

  const baseline = Math.max(0, input.conservativeBaselineWeeklyTss);
  const confidence = clamp01(input.confidence);
  return round1(
    baseline + (input.demandFloorWeeklyTss - baseline) * confidence,
  );
}

export function getDemandRhythmMultiplier(input: {
  weekPattern: ProjectionMicrocyclePattern;
  weekIndex: number;
  weeksToEvent: number;
}): number {
  if (input.weekPattern === "event") {
    return 0.62;
  }

  if (input.weekPattern === "recovery") {
    return 0.72;
  }

  const weeksRemaining = Math.max(0, input.weeksToEvent - input.weekIndex - 1);

  if (input.weekPattern === "taper") {
    if (weeksRemaining <= 1) return 0.7;
    if (weeksRemaining <= 2) return 0.8;
    return 0.88;
  }

  if (input.weekPattern === "deload") {
    return 0.82;
  }

  const wave = input.weekIndex % 3;
  if (wave === 0) return 0.9;
  if (wave === 1) return 1;
  return 1.08;
}

export function computeProjectionFeasibilityMetadata(input: {
  requiredPeakWeeklyTssTarget: number;
  feasiblePeakWeeklyTssApplied: number;
  tssRampClampWeeks: number;
  ctlRampClampWeeks: number;
  confidence: number;
  projectionWeeks: number;
}): ProjectionFeasibilityMetadata {
  const unmetWeeklyTss = Math.max(
    0,
    round1(
      input.requiredPeakWeeklyTssTarget - input.feasiblePeakWeeklyTssApplied,
    ),
  );
  const unmetRatio =
    input.requiredPeakWeeklyTssTarget <= 0
      ? 0
      : round3(unmetWeeklyTss / input.requiredPeakWeeklyTssTarget);
  const clampPressure = clamp01(
    (input.tssRampClampWeeks + input.ctlRampClampWeeks) /
      Math.max(1, input.projectionWeeks),
  );
  const demandFulfillment =
    input.requiredPeakWeeklyTssTarget <= 0
      ? 1
      : clamp01(
          input.feasiblePeakWeeklyTssApplied /
            input.requiredPeakWeeklyTssTarget,
        );
  const confidence = clamp01(input.confidence);

  const loadState = clamp01(
    demandFulfillment * 0.75 + (1 - unmetRatio) * 0.25 - clampPressure * 0.35,
  );
  const intensityBalance = clamp01(
    1 - clampPressure * 0.7 - Math.min(0.12, input.tssRampClampWeeks * 0.04),
  );
  const specificity = clamp01(
    demandFulfillment * 0.85 + (1 - clampPressure) * 0.15,
  );
  const executionConfidence = clamp01(
    confidence * 0.8 + (1 - clampPressure) * 0.2,
  );
  const readinessScore = Math.round(
    (loadState * 0.35 +
      intensityBalance * 0.25 +
      specificity * 0.25 +
      executionConfidence * 0.15) *
      100,
  );

  let readiness: ReadinessBand = "low";
  if (readinessScore >= 75) {
    readiness = "high";
  } else if (readinessScore >= 55) {
    readiness = "medium";
  }

  const dominantLimiters: string[] = [];
  if (unmetWeeklyTss > 0) dominantLimiters.push("required_growth_exceeds_caps");
  if (input.tssRampClampWeeks > 0)
    dominantLimiters.push("tss_ramp_cap_pressure");
  if (input.ctlRampClampWeeks > 0)
    dominantLimiters.push("ctl_ramp_cap_pressure");
  if (input.confidence < 0.5) dominantLimiters.push("low_evidence_confidence");

  const readinessRationaleCodes: string[] = [];
  if (demandFulfillment < 0.85) {
    readinessRationaleCodes.push("readiness_penalty_demand_gap");
  }
  if (clampPressure > 0.15) {
    readinessRationaleCodes.push("readiness_penalty_clamp_pressure");
  }
  if (confidence >= 0.75) {
    readinessRationaleCodes.push("readiness_credit_evidence_confidence_high");
  }

  const uncertaintyPct = Math.min(
    0.28,
    Math.max(0.08, 0.06 + (1 - confidence) * 0.18 + clampPressure * 0.05),
  );
  const likelyTss = round1(Math.max(0, input.feasiblePeakWeeklyTssApplied));
  const uncertaintyDelta = round1(likelyTss * uncertaintyPct);

  return {
    demand_gap: {
      required_weekly_tss_target: round1(input.requiredPeakWeeklyTssTarget),
      feasible_weekly_tss_applied: round1(input.feasiblePeakWeeklyTssApplied),
      unmet_weekly_tss: unmetWeeklyTss,
      unmet_ratio: unmetRatio,
    },
    readiness_band: readiness,
    dominant_limiters: dominantLimiters,
    readiness_score: readinessScore,
    readiness_components: {
      load_state: round3(loadState),
      intensity_balance: round3(intensityBalance),
      specificity: round3(specificity),
      execution_confidence: round3(executionConfidence),
    },
    projection_uncertainty: {
      tss_low: round1(Math.max(0, likelyTss - uncertaintyDelta)),
      tss_likely: likelyTss,
      tss_high: round1(likelyTss + uncertaintyDelta),
      confidence: round3(1 - uncertaintyPct),
    },
    readiness_rationale_codes: readinessRationaleCodes,
  };
}

export interface ProjectionPointReadinessInput {
  date: string;
  predicted_fitness_ctl: number;
  predicted_fatigue_atl: number;
  predicted_form_tsb: number;
}

export interface ProjectionPointReadinessGoalInput {
  target_date: string;
  priority?: number;
  targets?: GoalTargetV2[];
}

function diffDateOnlyUtcDays(a: string, b: string): number {
  const aMs = Date.parse(`${a}T00:00:00.000Z`);
  const bMs = Date.parse(`${b}T00:00:00.000Z`);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) {
    return 0;
  }

  return Math.round((bMs - aMs) / 86400000);
}

export function computeProjectionPointReadinessScores(input: {
  points: ProjectionPointReadinessInput[];
  planReadinessScore?: number;
  goals?: ProjectionPointReadinessGoalInput[];
  timeline_calibration?: TrainingPlanCalibrationConfig["readiness_timeline"];
}): number[] {
  if (input.points.length === 0) {
    return [];
  }

  const peakProjectedCtl = Math.max(
    1,
    ...input.points.map((point) => Math.max(0, point.predicted_fitness_ctl)),
  );
  const startingProjectedCtl = Math.max(
    0,
    input.points[0]?.predicted_fitness_ctl ?? 0,
  );
  const feasibilitySignal = clamp01((input.planReadinessScore ?? 50) / 100);

  const goals = input.goals ?? [];
  const timelineCalibration = input.timeline_calibration;

  // Compute event-duration-aware optimal TSB
  const primaryGoal = goals[0];
  const primaryTarget = primaryGoal?.targets?.[0];
  const eventDurationHours =
    primaryTarget?.target_type === "race_performance" &&
    primaryTarget.target_time_s
      ? primaryTarget.target_time_s / 3600
      : undefined;
  const targetTsb =
    timelineCalibration?.target_tsb ??
    computeOptimalTsb(eventDurationHours) ??
    READINESS_TIMELINE.TARGET_TSB_DEFAULT;

  const formTolerance =
    timelineCalibration?.form_tolerance ?? READINESS_TIMELINE.FORM_TOLERANCE;
  const fatigueOverflowScale =
    timelineCalibration?.fatigue_overflow_scale ??
    READINESS_TIMELINE.FATIGUE_OVERFLOW_SCALE;

  // Feasibility blend weight set to 0 (disabled) - keep readiness and feasibility separate
  const feasibilityBlendWeight =
    timelineCalibration?.feasibility_blend_weight ??
    READINESS_TIMELINE.FEASIBILITY_BLEND_WEIGHT;

  const rawScores = input.points.map((point, idx) => {
    const ctl = Math.max(0, point.predicted_fitness_ctl);
    const atl = Math.max(0, point.predicted_fatigue_atl);
    const tsb = point.predicted_form_tsb;

    const ctlProgress = clamp01(
      (ctl - startingProjectedCtl) /
        Math.max(1, peakProjectedCtl - startingProjectedCtl),
    );
    const progressiveFitnessSignal = clamp01(
      Math.pow(ctlProgress, READINESS_TIMELINE.PROGRESSIVE_FITNESS_EXPONENT),
    );
    const absoluteFitnessSignal = clamp01(
      ctl / Math.max(1, peakProjectedCtl * READINESS_TIMELINE.PEAK_CTL_SCALING),
    );
    const fitnessSignal = clamp01(
      progressiveFitnessSignal * READINESS_TIMELINE.PROGRESSIVE_FITNESS_WEIGHT +
        absoluteFitnessSignal * READINESS_TIMELINE.ABSOLUTE_FITNESS_WEIGHT,
    );
    const formSignal = clamp01(1 - Math.abs(tsb - targetTsb) / formTolerance);

    const fatigueOverflow = Math.max(0, atl - ctl);
    const fatigueSignal = clamp01(
      1 -
        fatigueOverflow / Math.max(1, peakProjectedCtl * fatigueOverflowScale),
    );

    // Dynamic form weight: higher near goal, lower early in plan
    let formWeight: number = READINESS_TIMELINE.FORM_SIGNAL_WEIGHT_DEFAULT;
    if (primaryGoal) {
      const daysUntilGoal = diffDateOnlyUtcDays(
        point.date,
        primaryGoal.target_date,
      );
      if (daysUntilGoal >= 0) {
        formWeight = computeDynamicFormWeight(daysUntilGoal);
      }
    }

    const fitnessWeight: number =
      1 - formWeight - READINESS_TIMELINE.FATIGUE_SIGNAL_WEIGHT;

    const readinessSignal =
      formSignal * formWeight +
      fitnessSignal * fitnessWeight +
      fatigueSignal * READINESS_TIMELINE.FATIGUE_SIGNAL_WEIGHT;
    const blendedSignal =
      readinessSignal * (1 - feasibilityBlendWeight) +
      feasibilitySignal * feasibilityBlendWeight;

    return clampScore(blendedSignal * 100);
  });

  if (goals.length === 0) {
    return rawScores;
  }

  // Apply post-event fatigue penalties
  const fatigueAdjustedScores = rawScores.map((baseScore, idx) => {
    const point = input.points[idx];
    if (!point) return baseScore;

    let maxFatiguePenalty = 0;

    // Check fatigue from each goal
    for (const goal of goals) {
      // Skip goals without targets
      if (!goal.targets || goal.targets.length === 0) continue;

      const penalty = computePostEventFatiguePenalty({
        currentDate: point.date,
        currentPoint: point,
        eventGoal: {
          target_date: goal.target_date,
          targets: goal.targets,
          projected_ctl: point.predicted_fitness_ctl,
          projected_atl: point.predicted_fatigue_atl,
        },
      });

      // Take maximum penalty (most limiting event)
      maxFatiguePenalty = Math.max(maxFatiguePenalty, penalty);
    }

    return clampScore(baseScore - maxFatiguePenalty);
  });

  const resolveGoalIndex = (targetDate: string): number => {
    const exactIndex = input.points.findIndex(
      (point) => point.date === targetDate,
    );
    if (exactIndex >= 0) {
      return exactIndex;
    }

    let nearestDistance = Number.POSITIVE_INFINITY;
    let nearestIndex = 0;
    for (let i = 0; i < input.points.length; i += 1) {
      const candidatePoint = input.points[i];
      if (!candidatePoint) {
        continue;
      }

      const distance = Math.abs(
        diffDateOnlyUtcDays(candidatePoint.date, targetDate),
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    return nearestIndex;
  };

  const goalAnchors = goals
    .map((goal, idx) => {
      const goalIndex = resolveGoalIndex(goal.target_date);

      // Calculate recovery profile for this goal
      const primaryTarget = goal.targets?.[0];
      let recoveryProfile = {
        recovery_days_full: 7,
        recovery_days_functional: 3,
        fatigue_intensity: 75,
        atl_spike_factor: 1.2,
      };

      if (primaryTarget) {
        const goalPoint = input.points[goalIndex];
        recoveryProfile = computeEventRecoveryProfile({
          target: primaryTarget,
          projected_ctl_at_event: goalPoint?.predicted_fitness_ctl ?? 50,
          projected_atl_at_event: goalPoint?.predicted_fatigue_atl ?? 50,
        });
      }

      // Dynamic taper days based on intensity (5-8 days)
      const taperDays = Math.round(
        5 + (recoveryProfile.fatigue_intensity / 100) * 3,
      );

      // Dynamic peak window = taper + 60% of recovery
      const peakWindow =
        taperDays + Math.round(recoveryProfile.recovery_days_full * 0.6);

      // Detect conflicts using dynamic functional recovery threshold
      const hasConflictingGoal = goals.some((otherGoal, otherIdx) => {
        if (idx === otherIdx) return false;
        const daysBetween = Math.abs(
          diffDateOnlyUtcDays(goal.target_date, otherGoal.target_date),
        );
        // Conflict if within functional recovery window
        return daysBetween <= recoveryProfile.recovery_days_functional;
      });

      return {
        goalIndex,
        peakWindow,
        peakSlope: 1.6,
        allowNaturalFatigue: hasConflictingGoal,
      };
    })
    .sort((a, b) => a.goalIndex - b.goalIndex);

  let optimized = [...fatigueAdjustedScores];
  const iterations = timelineCalibration?.smoothing_iterations ?? 24;
  const smoothingLambda = timelineCalibration?.smoothing_lambda ?? 0.28;
  const maxStepDelta = timelineCalibration?.max_step_delta ?? 9;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const smoothed = [...optimized];
    for (let i = 1; i < optimized.length - 1; i += 1) {
      const left = optimized[i - 1] ?? optimized[i] ?? 0;
      const center = optimized[i] ?? 0;
      const right = optimized[i + 1] ?? optimized[i] ?? 0;
      const prior = fatigueAdjustedScores[i] ?? center;
      const updated =
        (prior + smoothingLambda * left + smoothingLambda * right) /
        (1 + 2 * smoothingLambda);
      smoothed[i] = clampScore(updated);
    }
    optimized = smoothed;

    for (const anchor of goalAnchors) {
      const start = Math.max(0, anchor.goalIndex - anchor.peakWindow);
      const end = Math.min(
        optimized.length - 1,
        anchor.goalIndex + anchor.peakWindow,
      );

      // Only force local max if no conflicting goals
      if (!anchor.allowNaturalFatigue) {
        let localMax = 0;
        for (let i = start; i <= end; i += 1) {
          localMax = Math.max(localMax, optimized[i] ?? 0);
        }

        const requiredPeak = localMax;
        optimized[anchor.goalIndex] = clampScore(
          Math.max(optimized[anchor.goalIndex] ?? 0, requiredPeak),
        );
      }
      // For conflicting goals, let the fatigue model handle it naturally

      // Suppression logic still applies to all goals
      const goalScore = optimized[anchor.goalIndex] ?? 0;
      for (let i = start; i <= end; i += 1) {
        if (i === anchor.goalIndex) {
          continue;
        }

        const dayDistance = Math.abs(
          diffDateOnlyUtcDays(
            input.points[i]?.date ?? "",
            input.points[anchor.goalIndex]?.date ?? "",
          ),
        );
        const cap = clampScore(
          goalScore -
            Math.max(0, anchor.peakWindow - dayDistance) * anchor.peakSlope,
        );
        optimized[i] = Math.min(optimized[i] ?? 0, cap);
      }
    }

    for (let i = 1; i < optimized.length; i += 1) {
      const prev = optimized[i - 1] ?? 0;
      optimized[i] = clampScore(
        Math.min(
          prev + maxStepDelta,
          Math.max(prev - maxStepDelta, optimized[i] ?? prev),
        ),
      );
    }
    for (let i = optimized.length - 2; i >= 0; i -= 1) {
      const next = optimized[i + 1] ?? 0;
      optimized[i] = clampScore(
        Math.min(
          next + maxStepDelta,
          Math.max(next - maxStepDelta, optimized[i] ?? next),
        ),
      );
    }

    optimized = optimized.map((value, i) =>
      clampScore((value ?? 0) * 0.9 + (fatigueAdjustedScores[i] ?? 0) * 0.1),
    );
  }

  for (const anchor of goalAnchors) {
    // Skip final anchoring for conflicting goals
    if (anchor.allowNaturalFatigue) continue;

    const start = Math.max(0, anchor.goalIndex - anchor.peakWindow);
    const end = Math.min(
      optimized.length - 1,
      anchor.goalIndex + anchor.peakWindow,
    );
    let localMax = 0;
    for (let i = start; i <= end; i += 1) {
      localMax = Math.max(localMax, optimized[i] ?? 0);
    }

    optimized[anchor.goalIndex] = clampScore(
      Math.max(optimized[anchor.goalIndex] ?? 0, localMax),
    );
  }

  if (typeof input.planReadinessScore === "number") {
    const planReadinessCap = clampScore(input.planReadinessScore);
    const terminalIndex = Math.max(0, optimized.length - 1);
    const terminalReadiness = optimized[terminalIndex] ?? planReadinessCap;
    const terminalAdjustment = planReadinessCap - terminalReadiness;
    const startingCeiling = Math.min(
      planReadinessCap,
      Math.max(0, Math.min(planReadinessCap - 6, optimized[0] ?? 0)),
    );
    const anchored = optimized.map((value, index) => {
      const progress = terminalIndex <= 0 ? 1 : index / terminalIndex;
      const easedProgress = Math.pow(clamp01(progress), 1.35);
      const adjusted = (value ?? 0) + terminalAdjustment * easedProgress;
      const progressCeiling =
        startingCeiling +
        (planReadinessCap - startingCeiling) *
          Math.pow(clamp01(progress), 1.15);

      return clampScore(Math.min(adjusted, progressCeiling, planReadinessCap));
    });

    for (const goal of goals) {
      const goalIndex = resolveGoalIndex(goal.target_date);
      const goalProgress = terminalIndex <= 0 ? 1 : goalIndex / terminalIndex;
      const goalCeiling =
        startingCeiling +
        (planReadinessCap - startingCeiling) *
          Math.pow(clamp01(goalProgress), 1.15);
      anchored[goalIndex] = clampScore(
        Math.min(
          goalCeiling,
          Math.max(
            anchored[goalIndex] ?? 0,
            fatigueAdjustedScores[goalIndex] ?? 0,
          ),
        ),
      );
    }

    anchored[terminalIndex] = planReadinessCap;
    return anchored;
  }

  return optimized;
}

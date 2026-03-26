import type { GoalTargetV2 } from "../../schemas/training_plan_structure";
import { normalizeTargetWeight } from "./weightedMean";

export interface TargetProjectionSignals {
  readiness_score?: number;
  readiness_confidence?: number;
  plan_feasibility_confidence?: number;
  target_surplus_preference?: number;
  weeks_to_goal?: number;
  limiter_share?: number;
  projected_race_time_s?: number;
  projected_speed_mps?: number;
  projected_power_watts?: number;
  projected_lthr_bpm?: number;
}

export interface EffectiveScoringTargetMetadata {
  raw_target: number;
  effective_scoring_target: number;
  applied_surplus_pct: number;
  surplus_support_factor: number;
  surplus_applied: boolean;
  rationale_code: string;
}

export interface TargetSatisfactionResult {
  kind: GoalTargetV2["target_type"];
  score_0_100: number;
  target_weight: number;
  unmet_gap?: number;
  rationale_codes: string[];
  effective_target: EffectiveScoringTargetMetadata;
}

export interface ResolveEffectiveScoringTargetInput {
  rawTarget: number;
  targetType: GoalTargetV2["target_type"];
  surplusPreference?: number;
  readinessConfidence?: number;
  feasibilityConfidence?: number;
  weeksToGoal?: number;
  limiterShare?: number;
}

const MIN_EFFECTIVE_SURPLUS_PCT = 0.005;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function estimateRaceTimeFromReadiness(targetSeconds: number, readiness: number): number {
  const readinessFactor = clamp(1 + (68 - readiness) / 140, 0.7, 1.75);
  return round3(targetSeconds * readinessFactor);
}

function estimateHigherIsBetterProjection(targetValue: number, readiness: number): number {
  const readinessFactor = clamp(0.82 + (readiness / 100) * 0.36, 0.6, 1.35);
  return round3(targetValue * readinessFactor);
}

function resolveActivitySpeedCapMps(activity: "run" | "bike" | "swim" | "other"): number {
  if (activity === "run") return 7.5;
  if (activity === "bike") return 20;
  if (activity === "swim") return 2.8;
  return 9;
}

function resolvePowerCapWatts(activity: "run" | "bike" | "swim" | "other") {
  if (activity === "bike") return 560;
  if (activity === "run") return 500;
  if (activity === "swim") return 420;
  return 520;
}

function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function resolveDistributionScale(input: {
  baseline_sigma: number;
  readiness_confidence: number;
  projection_inferred: boolean;
}): number {
  const confidencePenalty = 1 + (1 - input.readiness_confidence) * 1.15;
  const inferredPenalty = input.projection_inferred ? 1.15 : 1;
  return Math.max(1e-6, input.baseline_sigma * confidencePenalty * inferredPenalty);
}

function resolveDemandPenalty(demandRatio: number): number {
  if (demandRatio <= 1) {
    return 1;
  }

  return 1 / (1 + Math.pow(demandRatio - 1, 2) * 4);
}

function toUnmetGap(value: number): number | undefined {
  return value > 0 ? round3(value) : undefined;
}

function scoreLowerIsBetter(input: { target: number; projected: number; sigma: number }): number {
  const z = (input.target - input.projected) / input.sigma;
  return clamp01(normalCdf(z));
}

function scoreHigherIsBetter(input: { target: number; projected: number; sigma: number }): number {
  const z = (input.target - input.projected) / input.sigma;
  return clamp01(1 - normalCdf(z));
}

function smoothstep01(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function getMaxSurplusPctByTargetType(targetType: GoalTargetV2["target_type"]): number {
  switch (targetType) {
    case "race_performance":
      return 0.04;
    case "pace_threshold":
    case "power_threshold":
      return 0.05;
    case "hr_threshold":
      return 0.015;
  }
}

/**
 * Resolves the internal scoring target after applying bounded surplus intent.
 *
 * Surplus remains separate from aggressiveness: it only shifts the target used
 * for scoring/optimization, while weekly load shaping continues to use the
 * aggressiveness controls elsewhere in projection logic.
 */
export function resolveEffectiveScoringTarget(
  input: ResolveEffectiveScoringTargetInput,
): EffectiveScoringTargetMetadata {
  const rawTarget = Math.max(0, input.rawTarget);
  const surplusSignal = smoothstep01(input.surplusPreference ?? 0);
  const supportFactor = clamp01(
    0.4 * clamp01(input.readinessConfidence ?? 0.6) +
      0.25 * clamp01(input.feasibilityConfidence ?? 0.6) +
      0.2 * smoothstep01(((input.weeksToGoal ?? 8) - 4) / 12) +
      0.15 * (1 - clamp01(input.limiterShare ?? 0.35)),
  );
  const resolvedSurplusPct = round3(
    getMaxSurplusPctByTargetType(input.targetType) * surplusSignal * supportFactor,
  );
  const surplusApplied = resolvedSurplusPct >= MIN_EFFECTIVE_SURPLUS_PCT;
  const appliedSurplusPct = surplusApplied ? resolvedSurplusPct : 0;
  const lowerIsBetter = input.targetType === "race_performance";
  const effectiveTarget = round3(
    rawTarget * (lowerIsBetter ? 1 - appliedSurplusPct : 1 + appliedSurplusPct),
  );

  return {
    raw_target: round3(rawTarget),
    effective_scoring_target: effectiveTarget,
    applied_surplus_pct: appliedSurplusPct,
    surplus_support_factor: round3(supportFactor),
    surplus_applied: surplusApplied,
    rationale_code: surplusApplied
      ? "effective_target_surplus_applied"
      : surplusSignal <= 0.0005
        ? "effective_target_surplus_disabled"
        : "effective_target_surplus_suppressed_low_support",
  };
}

/**
 * Scores target satisfaction using continuous attainment distributions.
 */
export function scoreTargetSatisfaction(input: {
  target: GoalTargetV2;
  projection: TargetProjectionSignals;
}): TargetSatisfactionResult {
  const readiness = clamp(input.projection.readiness_score ?? 60, 0, 100);
  const readinessConfidence = clamp(input.projection.readiness_confidence ?? 0.6, 0, 1);
  const planFeasibilityConfidence = clamp(
    input.projection.plan_feasibility_confidence ?? readinessConfidence,
    0,
    1,
  );
  const targetWeight = normalizeTargetWeight(input.target.weight);

  switch (input.target.target_type) {
    case "race_performance": {
      const effectiveTarget = resolveEffectiveScoringTarget({
        rawTarget: input.target.target_time_s,
        targetType: input.target.target_type,
        surplusPreference: input.projection.target_surplus_preference,
        readinessConfidence,
        feasibilityConfidence: planFeasibilityConfidence,
        weeksToGoal: input.projection.weeks_to_goal,
        limiterShare: input.projection.limiter_share,
      });
      const projectionInferred = input.projection.projected_race_time_s === undefined;
      const projected =
        input.projection.projected_race_time_s ??
        estimateRaceTimeFromReadiness(effectiveTarget.effective_scoring_target, readiness);
      const targetSpeed = input.target.distance_m / Math.max(1, input.target.target_time_s);
      const speedCap = resolveActivitySpeedCapMps(input.target.activity_category);
      const demandRatio = targetSpeed / Math.max(0.1, speedCap);
      const sigma = resolveDistributionScale({
        baseline_sigma: Math.max(45, projected * 0.04),
        readiness_confidence: readinessConfidence,
        projection_inferred: projectionInferred,
      });
      const attainmentProbability = scoreLowerIsBetter({
        target: effectiveTarget.effective_scoring_target,
        projected,
        sigma,
      });
      const utility = clamp01(attainmentProbability * resolveDemandPenalty(demandRatio));
      const gap = Math.max(0, projected - effectiveTarget.effective_scoring_target);

      return {
        kind: "race_performance",
        score_0_100: Math.round(utility * 100),
        target_weight: targetWeight,
        unmet_gap: toUnmetGap(gap),
        effective_target: effectiveTarget,
        rationale_codes: [
          "distribution_attainment_utility",
          effectiveTarget.rationale_code,
          ...(projectionInferred ? ["projection_inferred_from_readiness"] : []),
          ...(demandRatio > 1 ? ["target_demand_above_plausible_cap"] : []),
          gap <= 0 ? "target_met_or_exceeded_on_mean" : "target_unmet_on_mean",
        ],
      };
    }
    case "pace_threshold": {
      const effectiveTarget = resolveEffectiveScoringTarget({
        rawTarget: input.target.target_speed_mps,
        targetType: input.target.target_type,
        surplusPreference: input.projection.target_surplus_preference,
        readinessConfidence,
        feasibilityConfidence: planFeasibilityConfidence,
        weeksToGoal: input.projection.weeks_to_goal,
        limiterShare: input.projection.limiter_share,
      });
      const projectionInferred = input.projection.projected_speed_mps === undefined;
      const projected =
        input.projection.projected_speed_mps ??
        estimateHigherIsBetterProjection(effectiveTarget.effective_scoring_target, readiness);
      const speedCap = resolveActivitySpeedCapMps(input.target.activity_category);
      const demandRatio = input.target.target_speed_mps / Math.max(0.1, speedCap);
      const sigma = resolveDistributionScale({
        baseline_sigma: Math.max(0.05, projected * 0.04),
        readiness_confidence: readinessConfidence,
        projection_inferred: projectionInferred,
      });
      const attainmentProbability = scoreHigherIsBetter({
        target: effectiveTarget.effective_scoring_target,
        projected,
        sigma,
      });
      const utility = clamp01(attainmentProbability * resolveDemandPenalty(demandRatio));
      const gap = Math.max(0, effectiveTarget.effective_scoring_target - projected);

      return {
        kind: "pace_threshold",
        score_0_100: Math.round(utility * 100),
        target_weight: targetWeight,
        unmet_gap: toUnmetGap(gap),
        effective_target: effectiveTarget,
        rationale_codes: [
          "distribution_attainment_utility",
          effectiveTarget.rationale_code,
          ...(projectionInferred ? ["projection_inferred_from_readiness"] : []),
          ...(demandRatio > 1 ? ["target_demand_above_plausible_cap"] : []),
          gap <= 0 ? "target_met_or_exceeded_on_mean" : "target_unmet_on_mean",
        ],
      };
    }
    case "power_threshold": {
      const effectiveTarget = resolveEffectiveScoringTarget({
        rawTarget: input.target.target_watts,
        targetType: input.target.target_type,
        surplusPreference: input.projection.target_surplus_preference,
        readinessConfidence,
        feasibilityConfidence: planFeasibilityConfidence,
        weeksToGoal: input.projection.weeks_to_goal,
        limiterShare: input.projection.limiter_share,
      });
      const projectionInferred = input.projection.projected_power_watts === undefined;
      const projected =
        input.projection.projected_power_watts ??
        estimateHigherIsBetterProjection(effectiveTarget.effective_scoring_target, readiness);
      const powerCap = resolvePowerCapWatts(input.target.activity_category);
      const demandRatio = input.target.target_watts / Math.max(1, powerCap);
      const sigma = resolveDistributionScale({
        baseline_sigma: Math.max(6, projected * 0.05),
        readiness_confidence: readinessConfidence,
        projection_inferred: projectionInferred,
      });
      const attainmentProbability = scoreHigherIsBetter({
        target: effectiveTarget.effective_scoring_target,
        projected,
        sigma,
      });
      const utility = clamp01(attainmentProbability * resolveDemandPenalty(demandRatio));
      const gap = Math.max(0, effectiveTarget.effective_scoring_target - projected);

      return {
        kind: "power_threshold",
        score_0_100: Math.round(utility * 100),
        target_weight: targetWeight,
        unmet_gap: toUnmetGap(gap),
        effective_target: effectiveTarget,
        rationale_codes: [
          "distribution_attainment_utility",
          effectiveTarget.rationale_code,
          ...(projectionInferred ? ["projection_inferred_from_readiness"] : []),
          ...(demandRatio > 1 ? ["target_demand_above_plausible_cap"] : []),
          gap <= 0 ? "target_met_or_exceeded_on_mean" : "target_unmet_on_mean",
        ],
      };
    }
    case "hr_threshold": {
      const effectiveTarget = resolveEffectiveScoringTarget({
        rawTarget: input.target.target_lthr_bpm,
        targetType: input.target.target_type,
        surplusPreference: input.projection.target_surplus_preference,
        readinessConfidence,
        feasibilityConfidence: planFeasibilityConfidence,
        weeksToGoal: input.projection.weeks_to_goal,
        limiterShare: input.projection.limiter_share,
      });
      const projectionInferred = input.projection.projected_lthr_bpm === undefined;
      const projected =
        input.projection.projected_lthr_bpm ??
        estimateHigherIsBetterProjection(effectiveTarget.effective_scoring_target, readiness);
      const demandRatio = input.target.target_lthr_bpm / 210;
      const sigma = resolveDistributionScale({
        baseline_sigma: Math.max(1.5, projected * 0.025),
        readiness_confidence: readinessConfidence,
        projection_inferred: projectionInferred,
      });
      const attainmentProbability = scoreHigherIsBetter({
        target: effectiveTarget.effective_scoring_target,
        projected,
        sigma,
      });
      const utility = clamp01(attainmentProbability * resolveDemandPenalty(demandRatio));
      const gap = Math.max(0, effectiveTarget.effective_scoring_target - projected);

      return {
        kind: "hr_threshold",
        score_0_100: Math.round(utility * 100),
        target_weight: targetWeight,
        unmet_gap: toUnmetGap(gap),
        effective_target: effectiveTarget,
        rationale_codes: [
          "distribution_attainment_utility",
          effectiveTarget.rationale_code,
          ...(projectionInferred ? ["projection_inferred_from_readiness"] : []),
          ...(demandRatio > 1 ? ["target_demand_above_plausible_cap"] : []),
          gap <= 0 ? "target_met_or_exceeded_on_mean" : "target_unmet_on_mean",
        ],
      };
    }
  }
}

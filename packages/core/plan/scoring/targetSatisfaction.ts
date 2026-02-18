import type { GoalTargetV2 } from "../../schemas/training_plan_structure";
import { normalizeTargetWeight } from "./weightedMean";

export interface TargetProjectionSignals {
  readiness_score?: number;
  readiness_confidence?: number;
  projected_race_time_s?: number;
  projected_speed_mps?: number;
  projected_power_watts?: number;
  projected_lthr_bpm?: number;
}

export interface TargetSatisfactionResult {
  kind: GoalTargetV2["target_type"];
  score_0_100: number;
  target_weight: number;
  unmet_gap?: number;
  rationale_codes: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function estimateRaceTimeFromReadiness(
  targetSeconds: number,
  readiness: number,
): number {
  const readinessFactor = clamp(1 + (68 - readiness) / 140, 0.7, 1.75);
  return round3(targetSeconds * readinessFactor);
}

function estimateHigherIsBetterProjection(
  targetValue: number,
  readiness: number,
): number {
  const readinessFactor = clamp(0.82 + (readiness / 100) * 0.36, 0.6, 1.35);
  return round3(targetValue * readinessFactor);
}

function resolveActivitySpeedCapMps(
  activity: "run" | "bike" | "swim" | "other",
): number {
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
  const erf =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function resolveDistributionScale(input: {
  baseline_sigma: number;
  readiness_confidence: number;
  projection_inferred: boolean;
}): number {
  const confidencePenalty = 1 + (1 - input.readiness_confidence) * 1.15;
  const inferredPenalty = input.projection_inferred ? 1.15 : 1;
  return Math.max(
    1e-6,
    input.baseline_sigma * confidencePenalty * inferredPenalty,
  );
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

function scoreLowerIsBetter(input: {
  target: number;
  projected: number;
  sigma: number;
}): number {
  const z = (input.target - input.projected) / input.sigma;
  return clamp01(normalCdf(z));
}

function scoreHigherIsBetter(input: {
  target: number;
  projected: number;
  sigma: number;
}): number {
  const z = (input.target - input.projected) / input.sigma;
  return clamp01(1 - normalCdf(z));
}

/**
 * Scores target satisfaction using continuous attainment distributions.
 */
export function scoreTargetSatisfaction(input: {
  target: GoalTargetV2;
  projection: TargetProjectionSignals;
}): TargetSatisfactionResult {
  const readiness = clamp(input.projection.readiness_score ?? 60, 0, 100);
  const readinessConfidence = clamp(
    input.projection.readiness_confidence ?? 0.6,
    0,
    1,
  );
  const targetWeight = normalizeTargetWeight(input.target.weight);

  switch (input.target.target_type) {
    case "race_performance": {
      const projectionInferred =
        input.projection.projected_race_time_s === undefined;
      const projected =
        input.projection.projected_race_time_s ??
        estimateRaceTimeFromReadiness(input.target.target_time_s, readiness);
      const targetSpeed =
        input.target.distance_m / Math.max(1, input.target.target_time_s);
      const speedCap = resolveActivitySpeedCapMps(
        input.target.activity_category,
      );
      const demandRatio = targetSpeed / Math.max(0.1, speedCap);
      const sigma = resolveDistributionScale({
        baseline_sigma: Math.max(45, projected * 0.04),
        readiness_confidence: readinessConfidence,
        projection_inferred: projectionInferred,
      });
      const attainmentProbability = scoreLowerIsBetter({
        target: input.target.target_time_s,
        projected,
        sigma,
      });
      const utility = clamp01(
        attainmentProbability * resolveDemandPenalty(demandRatio),
      );
      const gap = Math.max(0, projected - input.target.target_time_s);

      return {
        kind: "race_performance",
        score_0_100: Math.round(utility * 100),
        target_weight: targetWeight,
        unmet_gap: toUnmetGap(gap),
        rationale_codes: [
          "distribution_attainment_utility",
          ...(projectionInferred ? ["projection_inferred_from_readiness"] : []),
          ...(demandRatio > 1 ? ["target_demand_above_plausible_cap"] : []),
          gap <= 0 ? "target_met_or_exceeded_on_mean" : "target_unmet_on_mean",
        ],
      };
    }
    case "pace_threshold": {
      const projectionInferred =
        input.projection.projected_speed_mps === undefined;
      const projected =
        input.projection.projected_speed_mps ??
        estimateHigherIsBetterProjection(
          input.target.target_speed_mps,
          readiness,
        );
      const speedCap = resolveActivitySpeedCapMps(
        input.target.activity_category,
      );
      const demandRatio =
        input.target.target_speed_mps / Math.max(0.1, speedCap);
      const sigma = resolveDistributionScale({
        baseline_sigma: Math.max(0.05, projected * 0.04),
        readiness_confidence: readinessConfidence,
        projection_inferred: projectionInferred,
      });
      const attainmentProbability = scoreHigherIsBetter({
        target: input.target.target_speed_mps,
        projected,
        sigma,
      });
      const utility = clamp01(
        attainmentProbability * resolveDemandPenalty(demandRatio),
      );
      const gap = Math.max(0, input.target.target_speed_mps - projected);

      return {
        kind: "pace_threshold",
        score_0_100: Math.round(utility * 100),
        target_weight: targetWeight,
        unmet_gap: toUnmetGap(gap),
        rationale_codes: [
          "distribution_attainment_utility",
          ...(projectionInferred ? ["projection_inferred_from_readiness"] : []),
          ...(demandRatio > 1 ? ["target_demand_above_plausible_cap"] : []),
          gap <= 0 ? "target_met_or_exceeded_on_mean" : "target_unmet_on_mean",
        ],
      };
    }
    case "power_threshold": {
      const projectionInferred =
        input.projection.projected_power_watts === undefined;
      const projected =
        input.projection.projected_power_watts ??
        estimateHigherIsBetterProjection(input.target.target_watts, readiness);
      const powerCap = resolvePowerCapWatts(input.target.activity_category);
      const demandRatio = input.target.target_watts / Math.max(1, powerCap);
      const sigma = resolveDistributionScale({
        baseline_sigma: Math.max(6, projected * 0.05),
        readiness_confidence: readinessConfidence,
        projection_inferred: projectionInferred,
      });
      const attainmentProbability = scoreHigherIsBetter({
        target: input.target.target_watts,
        projected,
        sigma,
      });
      const utility = clamp01(
        attainmentProbability * resolveDemandPenalty(demandRatio),
      );
      const gap = Math.max(0, input.target.target_watts - projected);

      return {
        kind: "power_threshold",
        score_0_100: Math.round(utility * 100),
        target_weight: targetWeight,
        unmet_gap: toUnmetGap(gap),
        rationale_codes: [
          "distribution_attainment_utility",
          ...(projectionInferred ? ["projection_inferred_from_readiness"] : []),
          ...(demandRatio > 1 ? ["target_demand_above_plausible_cap"] : []),
          gap <= 0 ? "target_met_or_exceeded_on_mean" : "target_unmet_on_mean",
        ],
      };
    }
    case "hr_threshold": {
      const projectionInferred =
        input.projection.projected_lthr_bpm === undefined;
      const projected =
        input.projection.projected_lthr_bpm ??
        estimateHigherIsBetterProjection(
          input.target.target_lthr_bpm,
          readiness,
        );
      const demandRatio = input.target.target_lthr_bpm / 210;
      const sigma = resolveDistributionScale({
        baseline_sigma: Math.max(1.5, projected * 0.025),
        readiness_confidence: readinessConfidence,
        projection_inferred: projectionInferred,
      });
      const attainmentProbability = scoreHigherIsBetter({
        target: input.target.target_lthr_bpm,
        projected,
        sigma,
      });
      const utility = clamp01(
        attainmentProbability * resolveDemandPenalty(demandRatio),
      );
      const gap = Math.max(0, input.target.target_lthr_bpm - projected);

      return {
        kind: "hr_threshold",
        score_0_100: Math.round(utility * 100),
        target_weight: targetWeight,
        unmet_gap: toUnmetGap(gap),
        rationale_codes: [
          "distribution_attainment_utility",
          ...(projectionInferred ? ["projection_inferred_from_readiness"] : []),
          ...(demandRatio > 1 ? ["target_demand_above_plausible_cap"] : []),
          gap <= 0 ? "target_met_or_exceeded_on_mean" : "target_unmet_on_mean",
        ],
      };
    }
  }
}

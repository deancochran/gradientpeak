import type { GoalTargetV2 } from "../../schemas/training_plan_structure";

export interface TargetProjectionSignals {
  readiness_score?: number;
  projected_race_time_s?: number;
  projected_speed_mps?: number;
  projected_power_watts?: number;
  projected_lthr_bpm?: number;
}

export interface TargetSatisfactionResult {
  kind: GoalTargetV2["target_type"];
  score_0_100: number;
  unmet_gap?: number;
  rationale_codes: string[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function estimateRaceTimeFromReadiness(
  targetSeconds: number,
  readiness: number,
): number {
  const readinessFactor = clamp(1 + (78 - readiness) / 120, 0.72, 1.6);
  return round3(targetSeconds * readinessFactor);
}

function estimateHigherIsBetterProjection(
  targetValue: number,
  readiness: number,
): number {
  const readinessFactor = clamp(0.82 + (readiness / 100) * 0.36, 0.6, 1.35);
  return round3(targetValue * readinessFactor);
}

function scoreFromGapRatio(gapRatio: number): number {
  if (gapRatio <= 0) {
    return 1;
  }

  if (gapRatio <= 1) {
    return clamp01(1 - 0.4 * gapRatio * gapRatio);
  }

  const beyond = gapRatio - 1;
  const sharpPenalty = 0.6 * Math.pow(clamp01(beyond / 1.5), 1.5);
  return clamp01(0.6 - sharpPenalty);
}

function buildUnmetGap(value: number): number | undefined {
  return value > 0 ? round3(value) : undefined;
}

/**
 * Scores deterministic target satisfaction with tolerance-aware piecewise decay.
 */
export function scoreTargetSatisfaction(input: {
  target: GoalTargetV2;
  projection: TargetProjectionSignals;
}): TargetSatisfactionResult {
  const readiness = clamp(input.projection.readiness_score ?? 60, 0, 100);

  switch (input.target.target_type) {
    case "race_performance": {
      const projected =
        input.projection.projected_race_time_s ??
        estimateRaceTimeFromReadiness(input.target.target_time_s, readiness);
      const gap = Math.max(0, projected - input.target.target_time_s);
      const tolerance = Math.max(60, input.target.target_time_s * 0.03);
      const score = scoreFromGapRatio(gap / tolerance);

      return {
        kind: "race_performance",
        score_0_100: Math.round(score * 100),
        unmet_gap: buildUnmetGap(gap),
        rationale_codes: [
          gap <= 0 ? "target_met_or_exceeded" : "target_unmet",
          gap <= tolerance
            ? "within_tolerance_decay_smooth"
            : "beyond_tolerance_decay_sharp",
        ],
      };
    }
    case "pace_threshold": {
      const projected =
        input.projection.projected_speed_mps ??
        estimateHigherIsBetterProjection(
          input.target.target_speed_mps,
          readiness,
        );
      const gap = Math.max(0, input.target.target_speed_mps - projected);
      const tolerance = Math.max(0.08, input.target.target_speed_mps * 0.03);
      const score = scoreFromGapRatio(gap / tolerance);

      return {
        kind: "pace_threshold",
        score_0_100: Math.round(score * 100),
        unmet_gap: buildUnmetGap(gap),
        rationale_codes: [
          gap <= 0 ? "target_met_or_exceeded" : "target_unmet",
          gap <= tolerance
            ? "within_tolerance_decay_smooth"
            : "beyond_tolerance_decay_sharp",
        ],
      };
    }
    case "power_threshold": {
      const projected =
        input.projection.projected_power_watts ??
        estimateHigherIsBetterProjection(input.target.target_watts, readiness);
      const gap = Math.max(0, input.target.target_watts - projected);
      const tolerance = Math.max(8, input.target.target_watts * 0.04);
      const score = scoreFromGapRatio(gap / tolerance);

      return {
        kind: "power_threshold",
        score_0_100: Math.round(score * 100),
        unmet_gap: buildUnmetGap(gap),
        rationale_codes: [
          gap <= 0 ? "target_met_or_exceeded" : "target_unmet",
          gap <= tolerance
            ? "within_tolerance_decay_smooth"
            : "beyond_tolerance_decay_sharp",
        ],
      };
    }
    case "hr_threshold": {
      const projected =
        input.projection.projected_lthr_bpm ??
        estimateHigherIsBetterProjection(
          input.target.target_lthr_bpm,
          readiness,
        );
      const gap = Math.max(0, input.target.target_lthr_bpm - projected);
      const tolerance = 3;
      const score = scoreFromGapRatio(gap / tolerance);

      return {
        kind: "hr_threshold",
        score_0_100: Math.round(score * 100),
        unmet_gap: buildUnmetGap(gap),
        rationale_codes: [
          gap <= 0 ? "target_met_or_exceeded" : "target_unmet",
          gap <= tolerance
            ? "within_tolerance_decay_smooth"
            : "beyond_tolerance_decay_sharp",
        ],
      };
    }
  }
}

import type { AthletePerformanceTargetFacts } from "../performance-model";
import type { CanonicalActivityCategory } from "../schemas/activity-category";
import type { ActivityTarget, ActivityTargetType } from "./schema";

export type ActivityTargetRole = "objective" | "supporting";

/** One shared classification for every authored activity target type. */
export const activityTargetRoleByType = {
  "%FTP": "objective",
  "%MaxHR": "objective",
  "%ThresholdHR": "objective",
  watts: "objective",
  bpm: "objective",
  speed: "objective",
  cadence: "supporting",
  RPE: "supporting",
} as const satisfies Record<ActivityTargetType, ActivityTargetRole>;

export function getActivityTargetRole(target: Pick<ActivityTarget, "type">): ActivityTargetRole {
  return activityTargetRoleByType[target.type];
}

export type ObjectiveIntensityTargetResolution =
  | {
      status: "available";
      value: number;
      source: "direct_relative" | "athlete_calibrated";
    }
  | {
      status: "unavailable";
      value: null;
      reason: "no_objective_target" | "ambiguous_objective_targets" | "calibration_required";
    };

function availableThresholdValue(
  fact: AthletePerformanceTargetFacts["thresholds"]["bike"],
): number | null {
  return fact.status === "available" && Number.isFinite(fact.value) && fact.value > 0
    ? fact.value
    : null;
}

function availableLthrBpm(
  fact: AthletePerformanceTargetFacts["heartRate"]["bike"]["lthr"],
): number | null {
  return fact.status === "available" &&
    fact.valueBpm !== null &&
    Number.isFinite(fact.valueBpm) &&
    fact.valueBpm > 0
    ? fact.valueBpm
    : null;
}

function calibratedRatio(input: {
  activityCategory: CanonicalActivityCategory;
  performanceTargets: AthletePerformanceTargetFacts;
  target: Extract<ActivityTarget, { type: "watts" | "bpm" | "speed" }>;
}): number | null {
  const { activityCategory, performanceTargets, target } = input;
  if (target.type === "watts") {
    if (activityCategory !== "bike") return null;
    const threshold = availableThresholdValue(performanceTargets.thresholds.bike);
    return threshold === null ? null : target.intensity / threshold;
  }
  if (target.type === "bpm") {
    if (activityCategory !== "bike" && activityCategory !== "run" && activityCategory !== "swim") {
      return null;
    }
    const threshold = availableLthrBpm(performanceTargets.heartRate[activityCategory].lthr);
    return threshold === null ? null : target.intensity / threshold;
  }
  if (activityCategory !== "run" && activityCategory !== "swim") return null;
  const threshold = availableThresholdValue(performanceTargets.thresholds[activityCategory]);
  return threshold === null ? null : target.intensity / 3.6 / threshold;
}

/**
 * Resolves exactly one objective target to a threshold-relative ratio. Supporting
 * RPE and cadence targets never become objective intensity or break valid coverage.
 */
export function resolveObjectiveIntensityTarget(input: {
  activityCategory: CanonicalActivityCategory;
  performanceTargets: AthletePerformanceTargetFacts;
  targets: readonly ActivityTarget[];
}): ObjectiveIntensityTargetResolution {
  const objectives = input.targets.filter(
    (target) => getActivityTargetRole(target) === "objective",
  );
  if (objectives.length === 0) {
    return { status: "unavailable", value: null, reason: "no_objective_target" };
  }
  if (objectives.length !== 1) {
    return { status: "unavailable", value: null, reason: "ambiguous_objective_targets" };
  }
  const target = objectives[0];
  if (!target) {
    return { status: "unavailable", value: null, reason: "no_objective_target" };
  }
  if (target.type === "%FTP" || target.type === "%ThresholdHR" || target.type === "%MaxHR") {
    return { status: "available", value: target.intensity / 100, source: "direct_relative" };
  }
  if (target.type === "cadence" || target.type === "RPE") {
    return { status: "unavailable", value: null, reason: "no_objective_target" };
  }
  const value = calibratedRatio({
    activityCategory: input.activityCategory,
    performanceTargets: input.performanceTargets,
    target,
  });
  return value === null || !Number.isFinite(value) || value < 0
    ? { status: "unavailable", value: null, reason: "calibration_required" }
    : { status: "available", value, source: "athlete_calibrated" };
}

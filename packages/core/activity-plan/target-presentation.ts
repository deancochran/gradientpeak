import type { AthletePerformanceTargetFacts } from "../performance-model";
import type { CanonicalActivityCategory } from "../schemas/activity-category";
import { resolvePerformanceTargetValue } from "../utils/recording-plan-target-resolver";
import { ACTIVITY_PLAN_SPEED_DECIMAL_PLACES } from "./authoring";
import type { ActivityPlanTarget } from "./structure-schema";

export type ActivityPlanTargetPresentation =
  | { kind: "exact_authored"; label: string; sourceLabel: string }
  | { kind: "exact_personalized"; label: string; sourceLabel: string }
  | { kind: "abstract"; label: string; sourceLabel: string };

const presentationTargetOrder: Record<ActivityPlanTarget["type"], number> = {
  rest: 0,
  RPE: 1,
  "%FTP": 2,
  "%ThresholdHR": 3,
  "%MaxHR": 4,
  watts: 5,
  bpm: 6,
  speed: 7,
  cadence: 8,
};

/** Returns a copy in stable semantic order so authored array permutations render identically. */
export function orderActivityPlanTargetsForPresentation(
  targets: readonly ActivityPlanTarget[],
): ActivityPlanTarget[] {
  return [...targets].sort(
    (left, right) =>
      presentationTargetOrder[left.type] - presentationTargetOrder[right.type] ||
      ("intensity" in left ? left.intensity : 0) - ("intensity" in right ? right.intensity : 0),
  );
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatSpeed(value: number): string {
  // Legacy saved targets may have conversion artifacts. Presentation is safe and
  // bounded, but it never mutates the stored structure.
  return (
    Math.round((value + Number.EPSILON) * 10 ** ACTIVITY_PLAN_SPEED_DECIMAL_PLACES) /
    10 ** ACTIVITY_PLAN_SPEED_DECIMAL_PLACES
  )
    .toFixed(ACTIVITY_PLAN_SPEED_DECIMAL_PLACES)
    .replace(/\.0+$/, "");
}

function abstractLabel(target: ActivityPlanTarget): string {
  switch (target.type) {
    case "rest":
      return "Rest";
    case "%FTP":
      return `${formatNumber(target.intensity)}% FTP`;
    case "%ThresholdHR":
      return `${formatNumber(target.intensity)}% Threshold HR`;
    case "%MaxHR":
      return `${formatNumber(target.intensity)}% Max HR`;
    case "watts":
      return `${formatNumber(target.intensity)} W`;
    case "bpm":
      return `${formatNumber(target.intensity)} bpm`;
    case "speed":
      return `${formatSpeed(target.intensity)} km/h`;
    case "cadence":
      return `${formatNumber(target.intensity)} rpm`;
    case "RPE":
      return `${formatNumber(target.intensity)} RPE`;
  }
}

/**
 * Presents every authored target and optionally adds a viewer-specific physical
 * value. The authored source label is never discarded when conversion is unavailable.
 */
export function resolveActivityPlanTargetPresentation(input: {
  target: ActivityPlanTarget;
  activityCategory: CanonicalActivityCategory;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  asOf: string;
}): ActivityPlanTargetPresentation {
  const sourceLabel = abstractLabel(input.target);
  const { performanceTargets, target } = input;

  if (target.type === "%FTP" || target.type === "%ThresholdHR" || target.type === "%MaxHR") {
    const resolved = resolvePerformanceTargetValue({
      target,
      activityCategory: input.activityCategory,
      ...(performanceTargets ? { performanceTargets } : {}),
    });
    if (resolved) {
      return {
        kind: "exact_personalized",
        label: `${formatNumber(resolved.value)} ${resolved.unit === "watts" ? "W" : "bpm"} (${sourceLabel})`,
        sourceLabel,
      };
    }
  }

  if (
    target.type === "%FTP" ||
    target.type === "%ThresholdHR" ||
    target.type === "%MaxHR" ||
    target.type === "RPE" ||
    target.type === "rest"
  ) {
    return { kind: "abstract", label: sourceLabel, sourceLabel };
  }
  return { kind: "exact_authored", label: sourceLabel, sourceLabel };
}

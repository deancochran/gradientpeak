import type { AthletePerformanceTargetFacts } from "../performance-model";
import type { CanonicalActivityCategory } from "../schemas/activity-category";
import { resolvePerformanceTargetValue } from "../utils/recording-plan-target-resolver";
import type { ActivityPlanTarget } from "./structure-schema";

export type ActivityPlanTargetPresentation =
  | { kind: "exact_authored"; label: string; sourceLabel: string }
  | { kind: "exact_personalized"; label: string; sourceLabel: string }
  | { kind: "abstract"; label: string; sourceLabel: string };

const presentationTargetOrder: Record<ActivityPlanTarget["type"], number> = {
  RPE: 0,
  "%FTP": 1,
  "%ThresholdHR": 2,
  "%MaxHR": 3,
  watts: 4,
  bpm: 5,
  speed: 6,
  cadence: 7,
};

/** Returns a copy in stable semantic order so authored array permutations render identically. */
export function orderActivityPlanTargetsForPresentation(
  targets: readonly ActivityPlanTarget[],
): ActivityPlanTarget[] {
  return [...targets].sort(
    (left, right) =>
      presentationTargetOrder[left.type] - presentationTargetOrder[right.type] ||
      left.intensity - right.intensity,
  );
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function abstractLabel(target: ActivityPlanTarget): string {
  switch (target.type) {
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
      return `${formatNumber(target.intensity)} km/h`;
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
    target.type === "RPE"
  ) {
    return { kind: "abstract", label: sourceLabel, sourceLabel };
  }
  return { kind: "exact_authored", label: sourceLabel, sourceLabel };
}

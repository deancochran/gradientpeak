import type { CanonicalActivityCategory } from "../schemas";
import { bikeActivityCategory } from "./bike";
import type {
  ActivityCategoryEffortLevel,
  ActivityCategoryRegistryEntry,
  ActivityCategoryStepContext,
} from "./contracts";
import { otherActivityCategory } from "./other";
import { runActivityCategory } from "./run";
import { strengthActivityCategory } from "./strength";
import { swimActivityCategory } from "./swim";

const ACTIVITY_CATEGORY_REGISTRY: Record<CanonicalActivityCategory, ActivityCategoryRegistryEntry> =
  {
    run: runActivityCategory,
    bike: bikeActivityCategory,
    swim: swimActivityCategory,
    strength: strengthActivityCategory,
    other: otherActivityCategory,
  };

export function getActivityCategoryRegistryEntry(
  activityCategory: CanonicalActivityCategory,
): ActivityCategoryRegistryEntry {
  return ACTIVITY_CATEGORY_REGISTRY[activityCategory] ?? ACTIVITY_CATEGORY_REGISTRY.other;
}

export function getActivityCategoryDurationHeuristics(activityCategory: CanonicalActivityCategory) {
  return getActivityCategoryRegistryEntry(activityCategory).load.duration;
}

export function getActivityCategoryDistancePaceSecondsPerKm(
  activityCategory: CanonicalActivityCategory,
): number {
  return getActivityCategoryDurationHeuristics(activityCategory).paceSecondsPerKm;
}

export function getActivityCategorySecondsPerRep(
  activityCategory: CanonicalActivityCategory,
): number {
  return getActivityCategoryDurationHeuristics(activityCategory).secondsPerRep;
}

export function getActivityCategoryUntilFinishedSeconds(
  activityCategory: CanonicalActivityCategory,
): number {
  return getActivityCategoryDurationHeuristics(activityCategory).untilFinishedSeconds;
}

export function getActivityCategoryFallbackSpeed(
  activityCategory: CanonicalActivityCategory,
  effortLevel: ActivityCategoryEffortLevel = "moderate",
): number {
  return getActivityCategoryRegistryEntry(activityCategory).load.route.typicalSpeeds[effortLevel];
}

export function getActivityCategoryTypicalSpeed(
  activityCategory: CanonicalActivityCategory,
  effortLevel: ActivityCategoryEffortLevel = "moderate",
): number {
  return getActivityCategoryFallbackSpeed(activityCategory, effortLevel);
}

export function getActivityCategoryBaseSpeed(activityCategory: CanonicalActivityCategory): number {
  return getActivityCategoryRegistryEntry(activityCategory).load.route.baseSpeedMps;
}

export function getActivityCategoryRouteBaseSpeed(
  activityCategory: CanonicalActivityCategory,
): number {
  return getActivityCategoryBaseSpeed(activityCategory);
}

export function getActivityCategoryTemplateHeuristics(activityCategory: CanonicalActivityCategory) {
  return getActivityCategoryRegistryEntry(activityCategory).load.template;
}

export function getActivityCategoryTemplateDefaults(activityCategory: CanonicalActivityCategory) {
  return getActivityCategoryTemplateHeuristics(activityCategory);
}

export function getActivityCategoryThresholdToEndurancePaceMultiplier(
  activityCategory: CanonicalActivityCategory,
): number {
  return activityCategory === "run" ? 1.12 : 1;
}

export function getActivityCategoryDefaultDuration(
  activityCategory: CanonicalActivityCategory,
  context: ActivityCategoryStepContext,
) {
  const defaults = getActivityCategoryRegistryEntry(activityCategory).stepDefaults;
  if (context.position === 0) return defaults.warmupDuration;
  if (context.position === context.totalSteps - 1 || context.position === -1) {
    return defaults.cooldownDuration;
  }
  return defaults.mainDuration;
}

export function getActivityCategoryStepDefaults(
  activityCategory: CanonicalActivityCategory,
  phase: "warmup" | "main" | "cooldown",
) {
  const defaults = getActivityCategoryRegistryEntry(activityCategory).stepDefaults;
  if (phase === "warmup") {
    return {
      name: defaults.warmupName,
      duration: defaults.warmupDuration,
      target: defaults.warmupTarget,
    };
  }
  if (phase === "cooldown") {
    return {
      name: defaults.cooldownName,
      duration: defaults.cooldownDuration,
      target: defaults.cooldownTarget,
    };
  }
  return {
    name: defaults.mainStepPrefix,
    duration: defaults.mainDuration,
    target: defaults.mainTarget,
  };
}

export function getActivityCategoryDefaultTarget(
  activityCategory: CanonicalActivityCategory,
  context: ActivityCategoryStepContext,
) {
  const defaults = getActivityCategoryRegistryEntry(activityCategory).stepDefaults;
  if (context.position === 0) return defaults.warmupTarget;
  if (context.position === context.totalSteps - 1 || context.position === -1) {
    return defaults.cooldownTarget;
  }
  return defaults.mainTarget;
}

export function getActivityCategoryDefaultStepName(
  activityCategory: CanonicalActivityCategory,
  context: ActivityCategoryStepContext,
): string {
  const defaults = getActivityCategoryRegistryEntry(activityCategory).stepDefaults;
  if (context.position === 0) return defaults.warmupName;
  if (context.position === context.totalSteps - 1 || context.position === -1) {
    return defaults.cooldownName;
  }
  return `${defaults.mainStepPrefix} ${context.position}`;
}

export function getActivityCategoryStepName(
  activityCategory: CanonicalActivityCategory,
  phase: "warmup" | "main" | "cooldown",
  fallbackIndex?: number,
): string {
  if (phase === "main") {
    return getActivityCategoryRegistryEntry(activityCategory).activity_category === "strength"
      ? `Exercise ${fallbackIndex ?? 1}`
      : `Interval ${fallbackIndex ?? 1}`;
  }
  return getActivityCategoryStepDefaults(activityCategory, phase).name;
}

export function listActivityCategoryRegistryEntries(): ActivityCategoryRegistryEntry[] {
  return Object.values(ACTIVITY_CATEGORY_REGISTRY);
}

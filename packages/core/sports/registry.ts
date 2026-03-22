import type { PublicActivityCategory } from "@repo/supabase";
import { bikeSport } from "./bike";
import type { SportEffortLevel, SportRegistryEntry, SportStepContext } from "./contracts";
import { otherSport } from "./other";
import { runSport } from "./run";
import { strengthSport } from "./strength";
import { swimSport } from "./swim";

const SPORT_REGISTRY: Record<PublicActivityCategory, SportRegistryEntry> = {
  run: runSport,
  bike: bikeSport,
  swim: swimSport,
  strength: strengthSport,
  other: otherSport,
};

export function getSportRegistryEntry(
  activityCategory: PublicActivityCategory,
): SportRegistryEntry {
  return SPORT_REGISTRY[activityCategory] ?? SPORT_REGISTRY.other;
}

export function getSportDurationHeuristics(activityCategory: PublicActivityCategory) {
  return getSportRegistryEntry(activityCategory).load.duration;
}

export function getSportDistancePaceSecondsPerKm(activityCategory: PublicActivityCategory): number {
  return getSportDurationHeuristics(activityCategory).paceSecondsPerKm;
}

export function getSportSecondsPerRep(activityCategory: PublicActivityCategory): number {
  return getSportDurationHeuristics(activityCategory).secondsPerRep;
}

export function getSportUntilFinishedSeconds(activityCategory: PublicActivityCategory): number {
  return getSportDurationHeuristics(activityCategory).untilFinishedSeconds;
}

export function getSportFallbackSpeed(
  activityCategory: PublicActivityCategory,
  effortLevel: SportEffortLevel = "moderate",
): number {
  return getSportRegistryEntry(activityCategory).load.route.typicalSpeeds[effortLevel];
}

export function getSportTypicalSpeed(
  activityCategory: PublicActivityCategory,
  effortLevel: SportEffortLevel = "moderate",
): number {
  return getSportFallbackSpeed(activityCategory, effortLevel);
}

export function getSportBaseSpeed(activityCategory: PublicActivityCategory): number {
  return getSportRegistryEntry(activityCategory).load.route.baseSpeedMps;
}

export function getSportRouteBaseSpeed(activityCategory: PublicActivityCategory): number {
  return getSportBaseSpeed(activityCategory);
}

export function getSportTemplateHeuristics(activityCategory: PublicActivityCategory) {
  return getSportRegistryEntry(activityCategory).load.template;
}

export function getSportTemplateDefaults(activityCategory: PublicActivityCategory) {
  return getSportTemplateHeuristics(activityCategory);
}

export function getSportThresholdToEndurancePaceMultiplier(
  activityCategory: PublicActivityCategory,
): number {
  return activityCategory === "run" ? 1.12 : 1;
}

export function getSportDefaultDuration(
  activityCategory: PublicActivityCategory,
  context: SportStepContext,
) {
  const defaults = getSportRegistryEntry(activityCategory).stepDefaults;
  if (context.position === 0) return defaults.warmupDuration;
  if (context.position === context.totalSteps - 1 || context.position === -1) {
    return defaults.cooldownDuration;
  }
  return defaults.mainDuration;
}

export function getSportStepDefaults(
  activityCategory: PublicActivityCategory,
  phase: "warmup" | "main" | "cooldown",
) {
  const defaults = getSportRegistryEntry(activityCategory).stepDefaults;
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

export function getSportDefaultTarget(
  activityCategory: PublicActivityCategory,
  context: SportStepContext,
) {
  const defaults = getSportRegistryEntry(activityCategory).stepDefaults;
  if (context.position === 0) return defaults.warmupTarget;
  if (context.position === context.totalSteps - 1 || context.position === -1) {
    return defaults.cooldownTarget;
  }
  return defaults.mainTarget;
}

export function getSportDefaultStepName(
  activityCategory: PublicActivityCategory,
  context: SportStepContext,
): string {
  const defaults = getSportRegistryEntry(activityCategory).stepDefaults;
  if (context.position === 0) return defaults.warmupName;
  if (context.position === context.totalSteps - 1 || context.position === -1) {
    return defaults.cooldownName;
  }
  return `${defaults.mainStepPrefix} ${context.position}`;
}

export function getSportStepName(
  activityCategory: PublicActivityCategory,
  phase: "warmup" | "main" | "cooldown",
  fallbackIndex?: number,
): string {
  if (phase === "main") {
    return getSportRegistryEntry(activityCategory).category === "strength"
      ? `Exercise ${fallbackIndex ?? 1}`
      : `Interval ${fallbackIndex ?? 1}`;
  }
  return getSportStepDefaults(activityCategory, phase).name;
}

export function listSportRegistryEntries(): SportRegistryEntry[] {
  return Object.values(SPORT_REGISTRY);
}

import type { ActivityPlanDuration } from "../activity-plan";
import type { CanonicalActivityCategory } from "../schemas";
import type { ActivityTarget } from "../targets";

export type ActivityCategoryEffortLevel = "easy" | "moderate" | "hard";

export interface ActivityCategoryStepContext {
  position: number;
  totalSteps: number;
}

export interface ActivityCategoryStepDefaults {
  warmupName: string;
  cooldownName: string;
  mainStepPrefix: string;
  warmupDuration: ActivityPlanDuration;
  mainDuration: ActivityPlanDuration;
  cooldownDuration: ActivityPlanDuration;
  warmupTarget?: ActivityTarget;
  mainTarget?: ActivityTarget;
  cooldownTarget?: ActivityTarget;
}

export type ActivityCategoryStepPhase = "warmup" | "main" | "cooldown";

export interface ActivityCategoryDurationHeuristics {
  paceSecondsPerKm: number;
  secondsPerRep: number;
  untilFinishedSeconds: number;
}

export interface ActivityCategoryRouteHeuristics {
  baseSpeedMps: number;
  typicalSpeeds: Record<ActivityCategoryEffortLevel, number>;
}

export interface ActivityCategoryTemplateHeuristics {
  avgIF: number;
  avgDuration: number;
  avgTSS: number;
}

export interface ActivityCategoryLoadHeuristics {
  template: ActivityCategoryTemplateHeuristics;
  route: ActivityCategoryRouteHeuristics;
  duration: ActivityCategoryDurationHeuristics;
}

export interface ActivityCategoryRegistryEntry {
  activity_category: CanonicalActivityCategory;
  displayName: string;
  stepDefaults: ActivityCategoryStepDefaults;
  load: ActivityCategoryLoadHeuristics;
}

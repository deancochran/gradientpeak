import type { ActivityPlanDuration } from "../activity-plan";
import type { CanonicalSport } from "../schemas";
import type { ActivityTarget } from "../targets";

export type SportEffortLevel = "easy" | "moderate" | "hard";

export interface SportStepContext {
  position: number;
  totalSteps: number;
}

export interface SportStepDefaults {
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

export type SportStepPhase = "warmup" | "main" | "cooldown";

export interface SportDurationHeuristics {
  paceSecondsPerKm: number;
  secondsPerRep: number;
  untilFinishedSeconds: number;
}

export interface SportRouteHeuristics {
  baseSpeedMps: number;
  typicalSpeeds: Record<SportEffortLevel, number>;
}

export interface SportTemplateHeuristics {
  avgIF: number;
  avgDuration: number;
  avgTSS: number;
}

export interface SportLoadHeuristics {
  template: SportTemplateHeuristics;
  route: SportRouteHeuristics;
  duration: SportDurationHeuristics;
}

export interface SportRegistryEntry {
  category: CanonicalSport;
  displayName: string;
  stepDefaults: SportStepDefaults;
  load: SportLoadHeuristics;
}

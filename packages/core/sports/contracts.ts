import type { PublicActivityCategory } from "@repo/supabase";
import type { DurationV2, IntensityTargetV2 } from "../schemas";

export type SportEffortLevel = "easy" | "moderate" | "hard";

export interface SportStepContext {
  position: number;
  totalSteps: number;
}

export interface SportStepDefaults {
  warmupName: string;
  cooldownName: string;
  mainStepPrefix: string;
  warmupDuration: DurationV2;
  mainDuration: DurationV2;
  cooldownDuration: DurationV2;
  warmupTarget?: IntensityTargetV2;
  mainTarget?: IntensityTargetV2;
  cooldownTarget?: IntensityTargetV2;
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
  category: PublicActivityCategory;
  displayName: string;
  stepDefaults: SportStepDefaults;
  load: SportLoadHeuristics;
}

import type { CanonicalSport } from "../../../schemas/sport";
import { bikeSportModelConfig } from "./bike";
import type { SportModelConfig } from "./contracts";
import { otherSportModelConfig } from "./other";
import { runSportModelConfig } from "./run";
import { strengthSportModelConfig } from "./strength";
import { swimSportModelConfig } from "./swim";

const SPORT_MODEL_REGISTRY: Record<CanonicalSport, SportModelConfig> = {
  run: runSportModelConfig,
  bike: bikeSportModelConfig,
  swim: swimSportModelConfig,
  strength: strengthSportModelConfig,
  other: otherSportModelConfig,
};

export function getSportModelConfig(sport: CanonicalSport): SportModelConfig {
  return SPORT_MODEL_REGISTRY[sport] ?? otherSportModelConfig;
}

export function listSportModelConfigs(): SportModelConfig[] {
  return Object.values(SPORT_MODEL_REGISTRY);
}

import type { CanonicalActivityCategory } from "../../../schemas/activity-category";
import { bikeActivityCategoryModelConfig } from "./bike";
import type { ActivityCategoryModelConfig } from "./contracts";
import { otherActivityCategoryModelConfig } from "./other";
import { runActivityCategoryModelConfig } from "./run";
import { strengthActivityCategoryModelConfig } from "./strength";
import { swimActivityCategoryModelConfig } from "./swim";

const ACTIVITY_CATEGORY_MODEL_REGISTRY: Record<
  CanonicalActivityCategory,
  ActivityCategoryModelConfig
> = {
  run: runActivityCategoryModelConfig,
  bike: bikeActivityCategoryModelConfig,
  swim: swimActivityCategoryModelConfig,
  strength: strengthActivityCategoryModelConfig,
  other: otherActivityCategoryModelConfig,
};

export function getActivityCategoryModelConfig(
  activity_category: CanonicalActivityCategory,
): ActivityCategoryModelConfig {
  return ACTIVITY_CATEGORY_MODEL_REGISTRY[activity_category] ?? otherActivityCategoryModelConfig;
}

export function listActivityCategoryModelConfigs(): ActivityCategoryModelConfig[] {
  return Object.values(ACTIVITY_CATEGORY_MODEL_REGISTRY);
}

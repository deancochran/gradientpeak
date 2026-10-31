import type { ActivityPlanDraftStep, ActivityPlanStep, ActivityTargetCategory } from "@repo/core";
import { randomUUID } from "expo-crypto";

export const DEFAULT_ACTIVITY_PLAN_STEP_DURATION_SECONDS = 300;

/**
 * A newly requested step has no prescription yet.  This authoring-only value
 * must be completed and resolved before it can cross the V4 persistence
 * boundary; do not use the executable five-minute convenience step for it.
 */
export function createIncompleteActivityPlanStep({
  id = randomUUID(),
}: {
  id?: string;
} = {}): ActivityPlanDraftStep {
  return { type: "step", id, duration: null, targets: [] };
}

export function createDefaultActivityPlanStep({
  activityCategory: _activityCategory,
  id = randomUUID(),
}: {
  activityCategory: ActivityTargetCategory;
  id?: string;
}): ActivityPlanStep {
  return {
    type: "step",
    id,
    name: undefined,
    duration: { type: "time", seconds: DEFAULT_ACTIVITY_PLAN_STEP_DURATION_SECONDS },
    // A target is optional in V4. Never invent an RPE merely to make a draft valid.
    targets: [],
  };
}

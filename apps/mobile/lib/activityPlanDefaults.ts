import {
  type ActivityPlanIntervalStep,
  type ActivityPlanTargetAnchors,
  type ActivityTargetCategory,
  getActivityPlanDefaultTarget,
} from "@repo/core";
import { randomUUID } from "expo-crypto";

export const DEFAULT_ACTIVITY_PLAN_STEP_DURATION_SECONDS = 300;

export function createDefaultActivityPlanStep({
  activityCategory,
  anchors,
  id = randomUUID(),
}: {
  activityCategory: ActivityTargetCategory;
  anchors?: ActivityPlanTargetAnchors;
  id?: string;
}): ActivityPlanIntervalStep {
  return {
    id,
    name: "New Step",
    purpose: "work",
    duration: { type: "time", seconds: DEFAULT_ACTIVITY_PLAN_STEP_DURATION_SECONDS },
    targets: [
      getActivityPlanDefaultTarget({
        activityCategory,
        ...(anchors === undefined ? {} : { anchors }),
      }),
    ],
  };
}

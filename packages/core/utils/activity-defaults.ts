import {
  getActivityCategoryStepDefaults,
  getActivityCategoryStepName,
} from "../activity-categories";
import type { ActivityPlanDuration, ActivityPlanIntervalStep } from "../activity-plan";
import type { CanonicalActivityCategory } from "../schemas";
import type { ActivityTarget } from "../targets";

/**
 * Context for generating smart defaults for activity steps
 */
export interface DefaultsContext {
  activityCategory: CanonicalActivityCategory;
  position: number; // 0 = first step, -1 = last step
  totalSteps: number;
}

/**
 * Generate a smart step name based on activity category and position
 */
export function generateStepName(ctx: DefaultsContext): string {
  const phase = getStepPhase(ctx);
  return getActivityCategoryStepName(ctx.activityCategory, phase, ctx.position);
}

/**
 * Get default duration based on activity category and position
 */
export function getDefaultDuration(ctx: DefaultsContext): ActivityPlanDuration {
  return getActivityCategoryStepDefaults(ctx.activityCategory, getStepPhase(ctx)).duration;
}

/**
 * Get default intensity target based on activity category and position
 */
export function getDefaultTarget(ctx: DefaultsContext): ActivityTarget | undefined {
  return getActivityCategoryStepDefaults(ctx.activityCategory, getStepPhase(ctx)).target;
}

/**
 * Create a complete step with smart defaults based on context
 */
export function createDefaultStep(ctx: DefaultsContext): ActivityPlanIntervalStep {
  const target = getDefaultTarget(ctx);

  return {
    id: crypto.randomUUID(),
    name: generateStepName(ctx),
    duration: getDefaultDuration(ctx),
    targets: [target ?? { type: "RPE", intensity: 5 }],
    notes: "",
  };
}

function getStepPhase(ctx: DefaultsContext): "warmup" | "main" | "cooldown" {
  if (ctx.position === 0) {
    return "warmup";
  }
  if (ctx.position === ctx.totalSteps - 1 || ctx.position === -1) {
    return "cooldown";
  }
  return "main";
}

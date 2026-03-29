import type { CanonicalSport, DurationV2, IntensityTargetV2, PlanStepV2 } from "../schemas";
import { getSportStepDefaults, getSportStepName } from "../sports";

/**
 * Context for generating smart defaults for activity steps
 */
export interface DefaultsContext {
  activityCategory: CanonicalSport;
  position: number; // 0 = first step, -1 = last step
  totalSteps: number;
}

/**
 * Generate a smart step name based on activity type and position
 */
export function generateStepName(ctx: DefaultsContext): string {
  const phase = getStepPhase(ctx);
  return getSportStepName(ctx.activityCategory, phase, ctx.position);
}

/**
 * Get default duration based on activity type and position
 */
export function getDefaultDuration(ctx: DefaultsContext): DurationV2 {
  return getSportStepDefaults(ctx.activityCategory, getStepPhase(ctx)).duration;
}

/**
 * Get default intensity target based on activity type and position
 */
export function getDefaultTarget(ctx: DefaultsContext): IntensityTargetV2 | undefined {
  return getSportStepDefaults(ctx.activityCategory, getStepPhase(ctx)).target;
}

/**
 * Create a complete step with smart defaults based on context
 */
export function createDefaultStep(ctx: DefaultsContext): PlanStepV2 {
  const target = getDefaultTarget(ctx);

  return {
    name: generateStepName(ctx),
    duration: getDefaultDuration(ctx),
    targets: target ? [target] : [],
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

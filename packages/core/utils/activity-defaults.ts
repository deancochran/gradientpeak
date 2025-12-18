import type {
  PublicActivityCategory,
  PublicActivityLocation,
} from "@repo/supabase";
import type { DurationV2, IntensityTargetV2, PlanStepV2 } from "../schemas";

/**
 * Context for generating smart defaults for activity steps
 */
export interface DefaultsContext {
  activityCategory: PublicActivityCategory;
  activityLocation: PublicActivityLocation;
  position: number; // 0 = first step, -1 = last step
  totalSteps: number;
}

/**
 * Generate a smart step name based on activity type and position
 */
export function generateStepName(ctx: DefaultsContext): string {
  const isWarmup = ctx.position === 0;
  const isCooldown = ctx.position === ctx.totalSteps - 1 || ctx.position === -1;

  if (isWarmup) {
    return ctx.activityCategory === "swim" ? "Easy Swim" : "Warm-up";
  }

  if (isCooldown) {
    return ctx.activityCategory === "swim" ? "Easy Swim" : "Cool-down";
  }

  // Middle steps
  if (ctx.activityCategory === "strength") {
    return `Exercise ${ctx.position}`;
  }

  return `Interval ${ctx.position}`;
}

/**
 * Get default duration based on activity type and position
 */
export function getDefaultDuration(ctx: DefaultsContext): DurationV2 {
  const isWarmup = ctx.position === 0;
  const isCooldown = ctx.position === ctx.totalSteps - 1 || ctx.position === -1;

  // Running and cycling - time-based
  if (ctx.activityCategory === "run" || ctx.activityCategory === "bike") {
    if (isWarmup) {
      return { type: "time", seconds: 600 }; // 10 minutes
    }
    if (isCooldown) {
      return { type: "time", seconds: 300 }; // 5 minutes
    }
    return { type: "time", seconds: 1200 }; // 20 minutes
  }

  // Swimming - distance-based
  if (ctx.activityCategory === "swim") {
    if (isWarmup) {
      return { type: "distance", meters: 200 };
    }
    if (isCooldown) {
      return { type: "distance", meters: 100 };
    }
    return { type: "distance", meters: 400 };
  }

  // Strength training - repetition-based
  if (ctx.activityCategory === "strength") {
    return { type: "repetitions", count: 10 };
  }

  // Default fallback
  return { type: "time", seconds: 900 }; // 15 minutes
}

/**
 * Get default intensity target based on activity type and position
 */
export function getDefaultTarget(
  ctx: DefaultsContext,
): IntensityTargetV2 | undefined {
  const isWarmup = ctx.position === 0;
  const isCooldown = ctx.position === ctx.totalSteps - 1 || ctx.position === -1;

  // Cycling - use %FTP
  if (ctx.activityCategory === "bike") {
    if (isWarmup) {
      return { type: "%FTP", intensity: 60 };
    }
    if (isCooldown) {
      return { type: "%FTP", intensity: 55 };
    }
    return { type: "%FTP", intensity: 80 };
  }

  // Running - use %MaxHR
  if (ctx.activityCategory === "run") {
    if (isWarmup) {
      return { type: "%MaxHR", intensity: 60 };
    }
    if (isCooldown) {
      return { type: "%MaxHR", intensity: 55 };
    }
    return { type: "%MaxHR", intensity: 75 };
  }

  // Swimming - use RPE
  if (ctx.activityCategory === "swim") {
    if (isWarmup) {
      return { type: "RPE", intensity: 4 };
    }
    if (isCooldown) {
      return { type: "RPE", intensity: 3 };
    }
    return { type: "RPE", intensity: 7 };
  }

  // Strength training - use RPE
  if (ctx.activityCategory === "strength") {
    return { type: "RPE", intensity: 7 };
  }

  // No default for other activity types
  return undefined;
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

import type { Duration, IntensityTarget, Step } from "../schemas";
import {
  flattenPlanSteps,
  getDurationMs,
} from "../schemas/activity_plan_structure";

import type {
  PublicActivityCategory,
  PublicActivityLocation,
  PublicProfilesRow,
} from "@repo/supabase";

/**
 * Simplified user settings for estimation calculations
 */
export type UserSettings = {
  ftp?: number | null;
  thresholdHR?: number | null;
  restingHR?: number;
};

/**
 * Helper to get FTP from either UserSettings or PublicProfilesRow
 */
function getFtp(
  settings: PublicProfilesRow | UserSettings,
): number | null | undefined {
  return settings.ftp;
}

/**
 * Helper to get threshold HR from either UserSettings or PublicProfilesRow
 */
function getThresholdHR(
  settings: PublicProfilesRow | UserSettings,
): number | null | undefined {
  if ("threshold_hr" in settings) {
    return settings.threshold_hr;
  }
  return (settings as UserSettings).thresholdHR;
}

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
export function getDefaultDuration(ctx: DefaultsContext): Duration {
  const isWarmup = ctx.position === 0;
  const isCooldown = ctx.position === ctx.totalSteps - 1 || ctx.position === -1;

  // Running and cycling - time-based
  if (ctx.activityCategory === "run" || ctx.activityCategory === "bike") {
    if (isWarmup) {
      return { type: "time", value: 10, unit: "minutes" };
    }
    if (isCooldown) {
      return { type: "time", value: 5, unit: "minutes" };
    }
    return { type: "time", value: 20, unit: "minutes" };
  }

  // Swimming - distance-based
  if (ctx.activityCategory === "swim") {
    if (isWarmup) {
      return { type: "distance", value: 200, unit: "meters" };
    }
    if (isCooldown) {
      return { type: "distance", value: 100, unit: "meters" };
    }
    return { type: "distance", value: 400, unit: "meters" };
  }

  // Strength training - repetition-based
  if (ctx.activityCategory === "strength") {
    return { type: "repetitions", value: 10, unit: "reps" };
  }

  // Default fallback
  return { type: "time", value: 15, unit: "minutes" };
}

/**
 * Get default intensity target based on activity type and position
 */
export function getDefaultTarget(
  ctx: DefaultsContext,
): IntensityTarget | undefined {
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
export function createDefaultStep(ctx: DefaultsContext): Step {
  const target = getDefaultTarget(ctx);

  return {
    type: "step",
    name: generateStepName(ctx),
    duration: getDefaultDuration(ctx),
    targets: target ? [target] : [],
    notes: "",
  };
}

/**
 * Create a basic repetition structure with smart defaults
 */
export function createDefaultRepetition(
  ctx: DefaultsContext,
  repeatCount: number = 5,
): {
  type: "repetition";
  repeat: number;
  steps: Step[];
} {
  // Create a simple work/rest interval
  const workStep: Step = {
    type: "step",
    name: "Work",
    duration: { type: "time", value: 2, unit: "minutes" },
    targets: getDefaultTarget({ ...ctx, position: 1 })
      ? [getDefaultTarget({ ...ctx, position: 1 })!]
      : [],
    notes: "",
  };

  const restStep: Step = {
    type: "step",
    name: "Rest",
    duration: { type: "time", value: 1, unit: "minutes" },
    targets: getDefaultTarget({ ...ctx, position: 0 })
      ? [getDefaultTarget({ ...ctx, position: 0 })!]
      : [],
    notes: "",
  };

  return {
    type: "repetition",
    repeat: repeatCount,
    steps: [workStep, restStep],
  };
}

/**
 * Quick start templates for common activity structures
 */
export function createQuickStartTemplate(
  activityCategory: PublicActivityCategory,
  activityLocation: PublicActivityLocation,
  templateType: "easy" | "intervals" | "tempo",
): {
  steps: Array<Step | { type: "repetition"; repeat: number; steps: Step[] }>;
} {
  const ctx: DefaultsContext = {
    activityCategory,
    activityLocation,
    position: 0,
    totalSteps: 3,
  };

  switch (templateType) {
    case "easy":
      // Simple: Warmup -> Main -> Cooldown
      return {
        steps: [
          createDefaultStep({ ...ctx, position: 0 }),
          createDefaultStep({ ...ctx, position: 1 }),
          createDefaultStep({ ...ctx, position: 2 }),
        ],
      };

    case "intervals":
      // Warmup -> Intervals (5x work/rest) -> Cooldown
      return {
        steps: [
          createDefaultStep({ ...ctx, position: 0 }),
          createDefaultRepetition(ctx, 5),
          createDefaultStep({ ...ctx, position: -1 }),
        ],
      };

    case "tempo":
      // Warmup -> Tempo block -> Cooldown
      const tempoIntensity =
        activityCategory === "bike"
          ? { type: "%FTP" as const, intensity: 85 }
          : activityCategory === "run"
            ? { type: "%MaxHR" as const, intensity: 85 }
            : { type: "RPE" as const, intensity: 8 };

      const tempoStep: Step = {
        type: "step",
        name: "Tempo",
        duration: { type: "time", value: 20, unit: "minutes" },
        targets: [tempoIntensity],
        notes: "Steady effort at threshold",
      };

      return {
        steps: [
          createDefaultStep({ ...ctx, position: 0 }),
          tempoStep,
          createDefaultStep({ ...ctx, position: -1 }),
        ],
      };

    default:
      return { steps: [createDefaultStep({ ...ctx, position: 0 })] };
  }
}

/**
 * Calculate Intensity Factor (IF) for a step
 */
export function calculateStepIntensityFactor(
  step: Step,
  userSettings: PublicProfilesRow | UserSettings,
): number {
  const target = step.targets?.[0];
  if (!target) return 0;

  switch (target.type) {
    case "%FTP":
      return target.intensity / 100;

    case "watts":
      const ftp = getFtp(userSettings);
      if (ftp) {
        return target.intensity / ftp;
      }
      // Default FTP assumption: 250W for average cyclist
      return target.intensity / 250;

    case "%MaxHR":
      // Convert %MaxHR to rough IF equivalent
      // 85% MaxHR ≈ threshold ≈ IF 1.0
      return Math.max(0, (target.intensity - 50) / 35);

    case "%ThresholdHR":
      return target.intensity / 100;

    case "bpm":
      const thresholdHR = getThresholdHR(userSettings);
      if (thresholdHR) {
        return target.intensity / thresholdHR;
      }
      // Default threshold HR assumption: 170 bpm
      return target.intensity / 170;

    case "RPE":
      // RPE 6-7 ≈ threshold ≈ IF 1.0
      // RPE scale: 1-10, threshold around 7
      return Math.max(0, (target.intensity - 3) / 4);

    default:
      return 0;
  }
}

/**
 * Calculate Training Stress Score (TSS) for a step
 */
export function calculateStepTSS(
  step: Step,
  userSettings: PublicProfilesRow,
): number {
  const durationMs = step.duration ? getDurationMs(step.duration) : 0;
  const durationHours = durationMs / (1000 * 60 * 60);

  if (durationHours === 0) return 0;

  const intensityFactor = calculateStepIntensityFactor(step, userSettings);

  // TSS = (duration in hours) * (IF^2) * 100
  return Math.round(durationHours * Math.pow(intensityFactor, 2) * 100);
}

/**
 * Calculate total TSS for an activity structure
 */
export function calculateTotalTSS(
  steps: Array<Step | { type: "repetition"; repeat: number; steps: Step[] }>,
  userSettings: PublicProfilesRow,
): number {
  const flatSteps = flattenPlanSteps(steps);

  return flatSteps.reduce((totalTSS, step) => {
    return totalTSS + calculateStepTSS(step, userSettings);
  }, 0);
}

/**
 * Calculate average Intensity Factor for an activity
 */
export function calculateAverageIF(
  steps: Array<Step | { type: "repetition"; repeat: number; steps: Step[] }>,
  userSettings: PublicProfilesRow,
): number {
  const flatSteps = flattenPlanSteps(steps);

  if (flatSteps.length === 0) return 0;

  let totalWeightedIF = 0;
  let totalDuration = 0;

  flatSteps.forEach((step) => {
    const durationMs = step.duration ? getDurationMs(step.duration) : 0;
    const intensityFactor = calculateStepIntensityFactor(step, userSettings);

    totalWeightedIF += intensityFactor * durationMs;
    totalDuration += durationMs;
  });

  return totalDuration > 0 ? totalWeightedIF / totalDuration : 0;
}

/**
 * Get sensible default user settings based on activity type
 */
export function getDefaultUserSettings(
  activityCategory: PublicActivityCategory,
): UserSettings {
  if (activityCategory === "bike") {
    return {
      ftp: 250, // Watts - average recreational cyclist
      thresholdHR: 170,
      restingHR: 60,
    };
  }

  if (activityCategory === "run") {
    return {
      thresholdHR: 175, // Typically higher than cycling
      restingHR: 50,
    };
  }

  // Default for all activities
  return {
    thresholdHR: 170,
    restingHR: 55,
  };
}

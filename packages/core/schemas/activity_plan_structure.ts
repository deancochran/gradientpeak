import { z } from "zod";

// ==============================
// ENUMS
// ==============================

export const intensityTypeEnum = z.enum([
  "%FTP",
  "%MaxHR",
  "%ThresholdHR",
  "watts",
  "bpm",
  "speed",
  "cadence",
  "RPE",
]);

export const controlTypeEnum = z.enum(["grade", "resistance", "powerTarget"]);
export const controlUnitEnum = z.enum(["%", "watts", "rpm", "kg", "reps"]);
export const durationUnitEnum = z.enum([
  "seconds",
  "minutes",
  "meters",
  "km",
  "reps",
]);

// ==============================
// CONTROL
// ==============================
export const controlSchema = z.object({
  type: controlTypeEnum.optional(),
  value: z.number(),
  unit: controlUnitEnum.optional(),
});
export type Control = z.infer<typeof controlSchema>;

// ==============================
// FLEXIBLE DURATION
// ==============================
export const durationSchema = z.union([
  z.object({
    type: z.enum(["time", "distance", "repetitions"]),
    value: z.number().nonnegative(),
    unit: durationUnitEnum.optional(),
  }),
  z.literal("untilFinished"), // user manually ends this step (warm-up, cool-down, rest)
]);
export type Duration = z.infer<typeof durationSchema>;

// ==============================
// INTENSITY TARGET
// ==============================
export const intensityTargetSchema = z.object({
  type: intensityTypeEnum,
  intensity: z.number(),
});
export type IntensityTarget = z.infer<typeof intensityTargetSchema>;

// ==============================
// STEP
// ==============================
export const stepSchema = z.object({
  type: z.literal("step"), // constant
  name: z.string().optional(),
  description: z.string().optional(),
  duration: durationSchema.optional(), // supports "untilFinished"
  targets: z.array(intensityTargetSchema).optional(),
  controls: z.array(controlSchema).optional(),
  notes: z.string().optional(),
});
export type Step = z.infer<typeof stepSchema>;

export interface FlattenedStep extends Step {
  index: number;
  fromRepetition?: number;
  originalRepetitionIndex?: number;
}

// ==============================
// REPETITION
// ==============================
export const repetitionSchema = z.object({
  type: z.literal("repetition"), // constant
  repeat: z.number().min(1),
  steps: z.array(stepSchema),
});
export type Repetition = z.infer<typeof repetitionSchema>;

// ==============================
// STEP OR REPETITION UNION
// ==============================
export const stepOrRepetitionSchema = z.union([stepSchema, repetitionSchema]);
export type StepOrRepetition = z.infer<typeof stepOrRepetitionSchema>;

// ==============================
// STRUCTURED WORKOUT PLAN
// ==============================
export const activityPlanStructureSchema = z.object({
  steps: z.array(stepOrRepetitionSchema),
});
export type ActivityPlanStructure = z.infer<typeof activityPlanStructureSchema>;

/**
 * Flatten a nested plan structure into a sequential array of steps
 */
export function flattenPlanSteps(
  steps: StepOrRepetition[],
  acc: FlattenedStep[] = new Array<FlattenedStep>(),
  parentRep?: number,
): FlattenedStep[] {
  for (const step of steps) {
    if (step.type === "step") {
      acc.push({
        ...step,
        index: acc.length,
        fromRepetition: parentRep ?? undefined,
        originalRepetitionIndex: parentRep,
      });
    } else if (step.type === "repetition") {
      for (let i = 0; i < step.repeat; i++) {
        flattenPlanSteps(step.steps, acc, i);
      }
    }
  }
  return acc;
}

/**
 * Convert duration to milliseconds
 */
export function getDurationMs(duration: Duration): number {
  if (duration === "untilFinished") return 0;

  switch (duration.unit) {
    case "seconds":
      return duration.value * 1000;
    case "minutes":
      return duration.value * 60 * 1000;
    case "meters":
    case "km":
      // For distance-based, estimate based on activity type
      // This is a rough estimate - could be enhanced with user's typical pace
      return duration.value * 60 * 1000; // Assume 1 unit = 1 minute
    case "reps":
      // For rep-based, estimate time per rep
      return duration.value * 30 * 1000; // Assume 30 seconds per rep
    default:
      return 0;
  }
}

/**
 * Get color for intensity visualization based on type and value
 */
export function getIntensityColor(intensity: number, type?: string): string {
  if (!intensity || intensity === 0) return "#94a3b8"; // gray for rest/unknown

  switch (type) {
    case "%FTP":
      if (intensity >= 106) return "#dc2626"; // Z5 - Red
      if (intensity >= 91) return "#ea580c"; // Z4 - Orange
      if (intensity >= 76) return "#ca8a04"; // Z3 - Yellow
      if (intensity >= 56) return "#16a34a"; // Z2 - Green
      return "#06b6d4"; // Z1 - Light Blue

    case "watts":
      // Assuming 250W FTP for color coding - could be personalized
      const ftpPercent = (intensity / 250) * 100;
      return getIntensityColor(ftpPercent, "%FTP");

    case "%MaxHR":
    case "%ThresholdHR":
      if (intensity >= 95) return "#dc2626"; // Very High
      if (intensity >= 85) return "#ea580c"; // High
      if (intensity >= 75) return "#ca8a04"; // Moderate
      if (intensity >= 65) return "#16a34a"; // Light
      return "#06b6d4"; // Very Light

    default:
      // Generic intensity color coding
      if (intensity >= 90) return "#dc2626";
      if (intensity >= 70) return "#ea580c";
      if (intensity >= 50) return "#ca8a04";
      if (intensity >= 30) return "#16a34a";
      return "#06b6d4";
  }
}

// ================================
// Target Analysis Functions
// ================================

/**
 * Check if current value is within target range
 */
export function isValueInTargetRange(
  current: number,
  target: IntensityTarget,
): boolean {
  // If only target is specified, use ±5% tolerance
  if (target.intensity !== undefined) {
    const tolerance = target.intensity * 0.05;
    return (
      current >= target.intensity - tolerance &&
      current <= target.intensity + tolerance
    );
  }

  return true;
}

/**
 * Calculate adherence percentage to target
 */
export function calculateAdherence(
  current: number,
  target: IntensityTarget,
): number {
  const targetValue = target.intensity;
  if (targetValue === 0) return 0;

  const difference = Math.abs(current - targetValue);
  const tolerance = targetValue * 0.1; // 10% tolerance

  return Math.max(0, Math.min(100, (1 - difference / tolerance) * 100));
}

/**
 * Format target range for display
 */
export function formatTargetRange(target: IntensityTarget): string {
  const unit = getTargetUnit(target.type);

  if (target.intensity !== undefined) {
    return `${target.intensity}${unit}`;
  }

  return "No target";
}

/**
 * Get unit for target type
 */
export function getTargetUnit(type: string): string {
  switch (type) {
    case "%FTP":
    case "%MaxHR":
    case "%ThresholdHR":
      return "%";
    case "watts":
      return "W";
    case "bpm":
      return " bpm";
    case "speed":
      return " km/h";
    case "cadence":
      return " rpm";
    case "RPE":
      return "/10";
    default:
      return "";
  }
}

/**
 * Get display name for metric type
 */
export function getMetricDisplayName(type: string): string {
  switch (type) {
    case "%FTP":
      return "Power (FTP)";
    case "%MaxHR":
      return "Heart Rate (Max)";
    case "%ThresholdHR":
      return "Heart Rate (LT)";
    case "watts":
      return "Power";
    case "bpm":
      return "Heart Rate";
    case "speed":
      return "Speed";
    case "cadence":
      return "Cadence";
    case "RPE":
      return "Effort (RPE)";
    default:
      return type;
  }
}

/**
 * Format metric value for display
 */
export function formatMetricValue(value: number, type: string): string {
  const unit = getTargetUnit(type);

  switch (type) {
    case "speed":
      return `${value.toFixed(1)}${unit}`;
    case "%FTP":
    case "%MaxHR":
    case "%ThresholdHR":
      return `${Math.round(value)}${unit}`;
    default:
      return `${Math.round(value)}${unit}`;
  }
}

/**
 * Get guidance text based on current vs target
 */
export function getTargetGuidanceText(
  target: IntensityTarget,
  current?: number,
): string {
  if (!current) return "Waiting for data...";

  const inRange = isValueInTargetRange(current, target);
  const targetValue = target.intensity;

  if (inRange) {
    return "Perfect! Stay in this zone.";
  }

  if (current < targetValue) {
    const difference = targetValue - current;
    return `Increase by ${Math.round(difference)}${getTargetUnit(target.type)}`;
  } else {
    const difference = current - targetValue;
    return `Decrease by ${Math.round(difference)}${getTargetUnit(target.type)}`;
  }
}

// ================================
// Workout Utilities
// ================================

/**
 * Workout card interface for UI display
 */
export interface WorkoutCard {
  id: string;
  type: "overview" | "step" | "completion";
  workout?: any;
  step?: FlattenedStep;
  stepNumber?: number;
}

/**
 * Convert percentage-based targets to absolute values using profile
 */
export function convertTargetToAbsolute(
  target: IntensityTarget,
  profile: { ftp?: number; thresholdHr?: number },
): { intensity?: number; unit: string; label: string } {
  switch (target.type) {
    case "%FTP":
      if (profile.ftp && target.intensity) {
        return {
          intensity: Math.round((target.intensity / 100) * profile.ftp),
          unit: "W",
          label: "Power",
        };
      }
      return {
        intensity: target.intensity,
        unit: "% FTP",
        label: "Power",
      };

    case "%ThresholdHR":
      if (profile.thresholdHr && target.intensity) {
        return {
          intensity: Math.round((target.intensity / 100) * profile.thresholdHr),
          unit: "bpm",
          label: "Heart Rate",
        };
      }
      return {
        intensity: target.intensity,
        unit: "% Threshold",
        label: "Heart Rate",
      };

    default:
      return {
        intensity: target.intensity,
        unit: getTargetUnit(target.type),
        label: getMetricDisplayName(target.type),
      };
  }
}

/**
 * Calculate total duration from flattened steps
 */
export function calculateTotalDuration(steps: FlattenedStep[]): number {
  return steps.reduce((total, step) => {
    return total + (step.duration ? getDurationMs(step.duration) : 0);
  }, 0);
}

/**
 * Build workout cards for carousel display
 */
export function buildWorkoutCards(
  workout: any,
  steps: FlattenedStep[],
): WorkoutCard[] {
  return [
    { id: "overview", type: "overview", workout },
    ...steps.map((step, index) => ({
      id: `step-${index}`,
      type: "step" as const,
      step,
      stepNumber: index + 1,
    })),
    { id: "completion", type: "completion" },
  ];
}

/**
 * Calculate progress percentage
 */
export function calculateProgress(
  currentIndex: number,
  totalCards: number,
): number {
  if (totalCards <= 1) return 0;
  return (currentIndex / (totalCards - 1)) * 100;
}

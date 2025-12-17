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

export const durationTypeEnum = z.enum(["time", "distance", "repetitions"]);

export const activityLocationEnum = z.enum(["outdoor", "indoor"]);

export const activityCategoryEnum = z.enum([
  "run",
  "bike",
  "swim",
  "strength",
  "other",
]);

// ==============================
// CONTROL
// ==============================
export const controlSchema = z.object({
  type: controlTypeEnum.optional(),
  value: z
    .number()
    .nonnegative({ message: "Control value must be non-negative" })
    .finite({ message: "Control value must be finite" }),
  unit: controlUnitEnum.optional(),
});

export type Control = z.infer<typeof controlSchema>;

// ==============================
// FLEXIBLE DURATION
// ==============================
export const timeDurationSchema = z.object({
  type: z.literal("time"),
  value: z
    .number()
    .positive({ message: "Duration must be positive" })
    .max(240, { message: "Time duration cannot exceed 240 minutes" })
    .finite(),
  unit: z.enum(["seconds", "minutes"]),
});

export const distanceDurationSchema = z.object({
  type: z.literal("distance"),
  value: z.number().positive({ message: "Distance must be positive" }).finite(),
  unit: z.enum(["meters", "km"]),
});

export const repetitionDurationSchema = z.object({
  type: z.literal("repetitions"),
  value: z
    .number()
    .int({ message: "Repetitions must be a whole number" })
    .positive({ message: "Repetitions must be positive" }),
  unit: z.literal("reps"),
});

export const durationSchema = z.union([
  timeDurationSchema,
  distanceDurationSchema,
  repetitionDurationSchema,
  z.literal("untilFinished"),
]);

export type Duration = z.infer<typeof durationSchema>;
export type TimeDuration = z.infer<typeof timeDurationSchema>;
export type DistanceDuration = z.infer<typeof distanceDurationSchema>;
export type RepetitionDuration = z.infer<typeof repetitionDurationSchema>;

// ==============================
// INTENSITY TARGET
// ==============================
export const percentageFTPTargetSchema = z.object({
  type: z.literal("%FTP"),
  intensity: z
    .number()
    .positive({ message: "Intensity must be positive" })
    .max(500, { message: "FTP percentage cannot exceed 500%" })
    .finite(),
});

export const percentageMaxHRTargetSchema = z.object({
  type: z.literal("%MaxHR"),
  intensity: z
    .number()
    .positive({ message: "Intensity must be positive" })
    .max(200, { message: "Max HR percentage cannot exceed 200%" })
    .finite(),
});

export const percentageThresholdHRTargetSchema = z.object({
  type: z.literal("%ThresholdHR"),
  intensity: z
    .number()
    .positive({ message: "Intensity must be positive" })
    .max(200, { message: "Threshold HR percentage cannot exceed 200%" })
    .finite(),
});

export const wattsTargetSchema = z.object({
  type: z.literal("watts"),
  intensity: z
    .number()
    .nonnegative({ message: "Watts must be non-negative" })
    .max(5000, { message: "Watts cannot exceed 5000" })
    .finite(),
});

export const bpmTargetSchema = z.object({
  type: z.literal("bpm"),
  intensity: z
    .number()
    .positive({ message: "BPM must be positive" })
    .min(30, { message: "BPM must be at least 30" })
    .max(250, { message: "BPM cannot exceed 250" })
    .finite(),
});

export const speedTargetSchema = z.object({
  type: z.literal("speed"),
  intensity: z
    .number()
    .nonnegative({ message: "Speed must be non-negative" })
    .max(100, { message: "Speed cannot exceed 100 km/h" })
    .finite(),
});

export const cadenceTargetSchema = z.object({
  type: z.literal("cadence"),
  intensity: z
    .number()
    .nonnegative({ message: "Cadence must be non-negative" })
    .max(300, { message: "Cadence cannot exceed 300 rpm" })
    .finite(),
});

export const rpeTargetSchema = z.object({
  type: z.literal("RPE"),
  intensity: z
    .number()
    .min(1, { message: "RPE must be at least 1" })
    .max(10, { message: "RPE cannot exceed 10" })
    .finite(),
});

export const intensityTargetSchema = z.discriminatedUnion("type", [
  percentageFTPTargetSchema,
  percentageMaxHRTargetSchema,
  percentageThresholdHRTargetSchema,
  wattsTargetSchema,
  bpmTargetSchema,
  speedTargetSchema,
  cadenceTargetSchema,
  rpeTargetSchema,
]);

export type IntensityTarget = z.infer<typeof intensityTargetSchema>;

// ==============================
// STEP
// ==============================
export const stepSchema = z.object({
  type: z.literal("step"),
  name: z
    .string()
    .min(1, { message: "Step name must be at least 1 character" })
    .max(100, { message: "Step name cannot exceed 100 characters" })
    .default("Step"),
  description: z
    .string()
    .max(500, { message: "Description cannot exceed 500 characters" })
    .optional(),
  duration: durationSchema.optional(),
  targets: z
    .array(intensityTargetSchema)
    .max(2, { message: "Cannot have more than 2 targets per step" })
    .optional(),
  notes: z
    .string()
    .max(1000, { message: "Notes cannot exceed 1000 characters" })
    .optional(),
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
  type: z.literal("repetition"),
  repeat: z
    .number()
    .int({ message: "Repeat count must be a whole number" })
    .min(1, { message: "Must repeat at least once" })
    .max(50, { message: "Cannot repeat more than 50 times" }),
  steps: z
    .array(stepSchema)
    .min(1, { message: "Repetition must have at least one step" })
    .max(20, { message: "Repetition cannot have more than 20 steps" }),
});

export type Repetition = z.infer<typeof repetitionSchema>;

// ==============================
// STEP OR REPETITION UNION
// ==============================
export const stepOrRepetitionSchema = z.discriminatedUnion("type", [
  stepSchema,
  repetitionSchema,
]);

export type StepOrRepetition = z.infer<typeof stepOrRepetitionSchema>;

// ==============================
// STRUCTURED WORKOUT PLAN
// ==============================
export const activityPlanStructureSchema = z.object({
  steps: z
    .array(stepOrRepetitionSchema)
    .max(50, { message: "Plan cannot have more than 50 items" })
    .refine(
      (steps) => {
        // Count total flattened steps to ensure activity isn't too long
        const totalSteps = steps.reduce((count, item) => {
          if (item.type === "step") return count + 1;
          return count + item.repeat * item.steps.length;
        }, 0);
        return totalSteps <= 200;
      },
      {
        message:
          "Total expanded steps cannot exceed 200 (including repetitions)",
      },
    )
    .optional(),
});

export type ActivityPlanStructure = z.infer<typeof activityPlanStructureSchema>;

// ==============================
// COMPLETE ACTIVITY PLAN
// ==============================
export const activityPlanSchema = z
  .object({
    name: z
      .string()
      .min(3, { message: "Name must be at least 3 characters" })
      .max(100, { message: "Name cannot exceed 100 characters" })
      .trim(),
    description: z
      .string()
      .max(1000, { message: "Description cannot exceed 1000 characters" })
      .optional(),
    activity_location: activityLocationEnum,
    activity_category: activityCategoryEnum,
    structure: activityPlanStructureSchema,
    route_id: z.string().uuid().optional(),
    notes: z
      .string()
      .max(1000, { message: "Notes cannot exceed 1000 characters" })
      .optional(),
  })
  .refine(
    (data) => {
      const hasSteps = data.structure.steps && data.structure.steps.length > 0;
      const hasRoute = !!data.route_id;
      return hasSteps || hasRoute;
    },
    {
      message: "Plan must have steps, route, or both",
      path: ["structure"],
    },
  );

export type ActivityPlan = z.infer<typeof activityPlanSchema>;

// ==============================
// CREATE/UPDATE SCHEMAS
// ==============================

// For creating a new plan (no ID required)
export const createActivityPlanSchema = activityPlanSchema;

// For updating an existing plan (partial updates allowed)
export const updateActivityPlanSchema = activityPlanSchema.partial().extend({
  id: z.string().uuid({ message: "Invalid plan ID format" }),
});

export type CreateActivityPlan = z.infer<typeof createActivityPlanSchema>;
export type UpdateActivityPlan = z.infer<typeof updateActivityPlanSchema>;

// ==============================
// UTILITY FUNCTIONS
// ==============================

/**
 * Flatten a nested plan structure into a sequential array of steps
 */
export function flattenPlanSteps(
  steps: StepOrRepetition[],
  acc: FlattenedStep[] = [],
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

  switch (duration.type) {
    case "time":
      switch (duration.unit) {
        case "seconds":
          return duration.value * 1000;
        case "minutes":
          return duration.value * 60 * 1000;
      }
      break;
    case "distance":
      // Estimate based on average pace (rough approximation)
      switch (duration.unit) {
        case "meters":
          return (duration.value / 1000) * 5 * 60 * 1000; // Assume 5 min/km
        case "km":
          return duration.value * 5 * 60 * 1000; // Assume 5 min/km
      }
      break;
    case "repetitions":
      return duration.value * 30 * 1000; // Assume 30 seconds per rep
  }

  return 0;
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
      // Assuming 250W FTP for color coding
      const ftpPercent = (intensity / 250) * 100;
      return getIntensityColor(ftpPercent, "%FTP");

    case "%MaxHR":
    case "%ThresholdHR":
      if (intensity >= 95) return "#dc2626"; // Very High
      if (intensity >= 85) return "#ea580c"; // High
      if (intensity >= 75) return "#ca8a04"; // Moderate
      if (intensity >= 65) return "#16a34a"; // Light
      return "#06b6d4"; // Very Light

    case "RPE":
      if (intensity >= 9) return "#dc2626";
      if (intensity >= 7) return "#ea580c";
      if (intensity >= 5) return "#ca8a04";
      if (intensity >= 3) return "#16a34a";
      return "#06b6d4";

    default:
      if (intensity >= 90) return "#dc2626";
      if (intensity >= 70) return "#ea580c";
      if (intensity >= 50) return "#ca8a04";
      if (intensity >= 30) return "#16a34a";
      return "#06b6d4";
  }
}

/**
 * Check if current value is within target range
 */
export function isValueInTargetRange(
  current: number,
  target: IntensityTarget,
): boolean {
  const tolerance = target.intensity * 0.05;
  return (
    current >= target.intensity - tolerance &&
    current <= target.intensity + tolerance
  );
}

/**
 * Format target range for display
 */
export function formatTargetRange(target: IntensityTarget): string {
  const unit = getTargetUnit(target.type);
  return `${target.intensity}${unit}`;
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

/**
 * Activity card interface for UI display
 */
export interface ActivityCard {
  id: string;
  type: "overview" | "step" | "completion";
  activity?: ActivityPlan;
  step?: FlattenedStep;
  stepNumber?: number;
}

/**
 * Convert percentage-based targets to absolute values using profile
 */
export function convertTargetToAbsolute(
  target: IntensityTarget,
  profile: { ftp?: number; threshold_hr?: number },
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
      if (profile.threshold_hr && target.intensity) {
        return {
          intensity: Math.round(
            (target.intensity / 100) * profile.threshold_hr,
          ),
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
 * Check if an activity type can have a route
 * Note: All activity types can optionally have a route attached
 */
export function canHaveRoute(activityType: string): boolean {
  return true; // Routes are optional for all activity types
}

/**
 * Build activity cards for carousel display
 */
export function buildActivityCards(
  activity: ActivityPlan,
  steps: FlattenedStep[],
): ActivityCard[] {
  return [
    { id: "overview", type: "overview", activity },
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

/**
 * Validate activity plan and return detailed errors
 */
export function validateActivityPlan(data: unknown): {
  success: boolean;
  data?: ActivityPlan;
  errors?: z.ZodError;
} {
  const result = activityPlanSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: result.error };
  }
}

/**
 * Validate activity plan structure only
 */
export function validateActivityPlanStructure(data: unknown): {
  success: boolean;
  data?: ActivityPlanStructure;
  errors?: z.ZodError;
} {
  const result = activityPlanStructureSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: result.error };
  }
}

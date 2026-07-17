import { z } from "zod";
import {
  type ActivityTarget,
  activityTargetMaximumByType,
  activityTargetSchema,
} from "../targets/schema";

/** Device/product integrity limits for plans that can be saved or exported. */
export const ACTIVITY_PLAN_V2_SAVEABLE_LIMITS = {
  maxExpandedDurationSeconds: 7 * 24 * 60 * 60,
  maxExpandedStepCount: 1_000,
  maxIntervalRepetitions: 50,
  maxStepDurationSeconds: 24 * 60 * 60,
  maxStepDistanceMeters: 1_000_000,
  maxStepRepetitionCount: 10_000,
  maxTargetIntensity: activityTargetMaximumByType,
} as const;

// ==============================
// ACTIVITY PLAN STRUCTURE V2
// Simplified flat structure - no nested repetitions
// Repetitions are expanded at creation time into individual steps
// ==============================

/**
 * Duration Types V2
 *
 * NOTE: Step completion is evaluated at runtime based on actual performance.
 * - If user changes pace mid-activity or GPS drifts, completion dynamically adjusts
 * - When paused, distance/duration tracking stops until resumed
 * - All evaluation happens in real-time during recording
 */

// Time-based duration (seconds)
const durationTimeSchemaV2 = z.object({
  type: z.literal("time"),
  seconds: z.number().int().positive(),
});

// Distance-based duration (meters)
const durationDistanceSchemaV2 = z.object({
  type: z.literal("distance"),
  meters: z.number().int().positive(),
});

// Repetition-based duration (count)
// NOTE: Repetitions are evaluated and expanded in the activity plan creation form
// During recording, each step is individual - not labeled as a repetition
const durationRepetitionsSchemaV2 = z.object({
  type: z.literal("repetitions"),
  count: z.number().int().positive(),
});

// Until finished (manual completion)
const durationUntilFinishedSchemaV2 = z.object({
  type: z.literal("untilFinished"),
});

export const durationSchemaV2 = z.discriminatedUnion("type", [
  durationTimeSchemaV2,
  durationDistanceSchemaV2,
  durationRepetitionsSchemaV2,
  durationUntilFinishedSchemaV2,
]);

export type DurationV2 = z.infer<typeof durationSchemaV2>;

// ==============================
// INTENSITY TARGETS V2
// NOTE: Ranges removed - step completion is evaluated at runtime based on actual performance
// Dynamic tolerances are applied during recording (see target_helpers.ts)
// ==============================

export const intensityTargetSchemaV2 = activityTargetSchema;

export type IntensityTargetV2 = ActivityTarget;

/** Converts the persisted/UI V2 speed target in km/h to runtime/export m/s. */
export function activityPlanSpeedKphToMetersPerSecond(speedKph: number): number {
  return speedKph / 3.6;
}

/** Converts runtime/import m/s to the persisted/UI V2 speed target in km/h. */
export function activityPlanSpeedMetersPerSecondToKph(speedMetersPerSecond: number): number {
  return speedMetersPerSecond * 3.6;
}

// ==============================
// INTERVAL STEP V2 (Nested inside intervals)
// ==============================

export const intervalStepSchemaV2 = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).default("Step"),
  description: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),

  // Duration (required)
  duration: durationSchemaV2,

  // Multiple targets (optional)
  targets: z.array(intensityTargetSchemaV2).max(3).optional(),
});

export type IntervalStepV2 = z.infer<typeof intervalStepSchemaV2>;

// ==============================
// INTERVAL V2 (Container for steps with repetitions)
// ==============================

export const intervalSchemaV2 = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  repetitions: z
    .number()
    .int()
    .min(1)
    .max(ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxIntervalRepetitions)
    .default(1),
  steps: z.array(intervalStepSchemaV2).min(1).max(20),
  notes: z.string().max(1000).optional(),
});

export type IntervalV2 = z.infer<typeof intervalSchemaV2>;

// ==============================
// ACTIVITY PLAN STRUCTURE V2 (Updated)
// ==============================

export const activityPlanStructureSchemaV2 = z.object({
  version: z.literal(2),
  intervals: z.array(intervalSchemaV2).min(1).max(50),
});

export type ActivityPlanStructureV2 = z.infer<typeof activityPlanStructureSchemaV2>;

type ActivityPlanStructureValidationIssue = {
  message: string;
  path: (string | number)[];
};

export function getSaveableActivityPlanStructureIssues(
  structure: ActivityPlanStructureV2,
): ActivityPlanStructureValidationIssue[] {
  const issues: ActivityPlanStructureValidationIssue[] = [];
  let expandedDurationSeconds = 0;
  let expandedStepCount = 0;

  structure.intervals.forEach((interval, intervalIndex) => {
    expandedStepCount += interval.steps.length * interval.repetitions;

    interval.steps.forEach((step, stepIndex) => {
      const durationPath = ["intervals", intervalIndex, "steps", stepIndex, "duration"];

      if (step.duration.type === "untilFinished") {
        issues.push({
          path: durationPath,
          message:
            "Saved steps need an explicit time, distance, or repetitions duration. 'Until finished' cannot produce trustworthy IF/TSS.",
        });
      }

      if (step.duration.type === "time") {
        expandedDurationSeconds += step.duration.seconds * interval.repetitions;

        if (step.duration.seconds > ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepDurationSeconds) {
          issues.push({
            path: [...durationPath, "seconds"],
            message: `Saved steps cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepDurationSeconds} seconds.`,
          });
        }
      }

      if (
        step.duration.type === "distance" &&
        step.duration.meters > ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepDistanceMeters
      ) {
        issues.push({
          path: [...durationPath, "meters"],
          message: `Saved steps cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepDistanceMeters} meters.`,
        });
      }

      if (
        step.duration.type === "repetitions" &&
        step.duration.count > ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepRepetitionCount
      ) {
        issues.push({
          path: [...durationPath, "count"],
          message: `Saved repetition steps cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepRepetitionCount} repetitions.`,
        });
      }

      if (!step.targets?.[0]) {
        issues.push({
          path: ["intervals", intervalIndex, "steps", stepIndex, "targets"],
          message: "Each saved step needs an intensity target.",
        });
      }

      step.targets?.forEach((target, targetIndex) => {
        const maximum = ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxTargetIntensity[target.type];

        if (target.intensity > maximum) {
          issues.push({
            path: [
              "intervals",
              intervalIndex,
              "steps",
              stepIndex,
              "targets",
              targetIndex,
              "intensity",
            ],
            message: `Saved ${target.type} targets cannot exceed ${maximum}.`,
          });
        }
      });
    });
  });

  if (expandedStepCount > ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedStepCount) {
    issues.push({
      path: ["intervals"],
      message: `Saved plans cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedStepCount} expanded steps.`,
    });
  }

  if (expandedDurationSeconds > ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedDurationSeconds) {
    issues.push({
      path: ["intervals"],
      message: `Saved plans cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedDurationSeconds} seconds of expanded duration.`,
    });
  }

  return issues;
}

export const saveableActivityPlanStructureSchemaV2 = activityPlanStructureSchemaV2.superRefine(
  (structure, ctx) => {
    getSaveableActivityPlanStructureIssues(structure).forEach((issue) => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: issue.path,
        message: issue.message,
      });
    });
  },
);

// ==============================
// MINIMAL STRUCTURE HELPERS
// For route-only or casual activity plans
// ==============================

/**
 * Create a minimal "follow route" structure
 * Used when user only provides a route without specific intervals
 */
export function createFollowRouteStructure(): ActivityPlanStructureV2 {
  return {
    version: 2,
    intervals: [
      {
        id: crypto.randomUUID(),
        name: "Follow Route",
        repetitions: 1,
        steps: [
          {
            id: crypto.randomUUID(),
            name: "Follow Route",
            duration: { type: "untilFinished" },
            targets: [],
          },
        ],
      },
    ],
  };
}

/**
 * Create a minimal "free activity" structure
 * Used when user only provides a description for casual activities
 */
export function createFreeActivityStructure(
  activityName: string = "Free Activity",
): ActivityPlanStructureV2 {
  return {
    version: 2,
    intervals: [
      {
        id: crypto.randomUUID(),
        name: activityName,
        repetitions: 1,
        steps: [
          {
            id: crypto.randomUUID(),
            name: activityName,
            duration: { type: "untilFinished" },
            targets: [],
          },
        ],
      },
    ],
  };
}

// ==============================
// DEPRECATED: Old flat step structure (kept for migration)
// ==============================

/**
 * @deprecated Use IntervalStepV2 instead. This is kept only for migration purposes.
 */
export const planStepSchemaV2 = z.object({
  name: z.string().min(1).max(100).default("Step"),
  description: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  duration: durationSchemaV2,
  targets: z.array(intensityTargetSchemaV2).max(3).optional(),
  segmentName: z.string().max(100).optional(),
  segmentIndex: z.number().int().nonnegative().optional(),
  originalRepetitionCount: z.number().int().positive().optional(),
});

/**
 * @deprecated Use IntervalStepV2 instead. This is kept only for migration purposes.
 */
export type PlanStepV2 = z.infer<typeof planStepSchemaV2>;

// ==============================
// VALIDATION HELPERS
// ==============================

/**
 * Validate activity plan structure V2
 */
export function validateActivityPlanStructureV2(data: unknown): {
  success: boolean;
  data?: ActivityPlanStructureV2;
  errors?: z.ZodError;
} {
  const result = activityPlanStructureSchemaV2.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: result.error };
  }
}

// ==============================
// DISPLAY HELPERS
// ==============================

/**
 * Get intensity color for visualization (works with both IntervalStepV2 and deprecated PlanStepV2)
 */
export function getStepIntensityColor(step: IntervalStepV2 | PlanStepV2): string {
  const primaryTarget = step.targets?.[0];
  if (!primaryTarget) return "#94a3b8"; // gray for no target

  const intensity = primaryTarget.intensity;
  const type = primaryTarget.type;

  switch (type) {
    case "%FTP":
      if (intensity >= 106) return "#dc2626"; // Z5 - Red
      if (intensity >= 91) return "#ea580c"; // Z4 - Orange
      if (intensity >= 76) return "#ca8a04"; // Z3 - Yellow
      if (intensity >= 56) return "#16a34a"; // Z2 - Green
      return "#06b6d4"; // Z1 - Light Blue

    case "%MaxHR":
    case "%ThresholdHR":
      if (intensity >= 95) return "#dc2626";
      if (intensity >= 85) return "#ea580c";
      if (intensity >= 75) return "#ca8a04";
      if (intensity >= 65) return "#16a34a";
      return "#06b6d4";

    case "RPE":
      if (intensity >= 9) return "#dc2626";
      if (intensity >= 7) return "#ea580c";
      if (intensity >= 5) return "#ca8a04";
      if (intensity >= 3) return "#16a34a";
      return "#06b6d4";

    default:
      return "#06b6d4";
  }
}

/**
 * Format intensity target for display with units
 */
export function formatIntensityTarget(target: IntensityTargetV2): string {
  switch (target.type) {
    case "%FTP":
      return `${Math.round(target.intensity)}% FTP`;
    case "%MaxHR":
      return `${Math.round(target.intensity)}% MaxHR`;
    case "%ThresholdHR":
      return `${Math.round(target.intensity)}% ThresholdHR`;
    case "watts":
      return `${Math.round(target.intensity)}W`;
    case "bpm":
      return `${Math.round(target.intensity)} bpm`;
    case "speed":
      return `${target.intensity.toFixed(1)} km/h`;
    case "cadence":
      return `${Math.round(target.intensity)} rpm`;
    case "RPE":
      return `RPE ${target.intensity}/10`;
    default:
      return `No Target Intensity`;
  }
}

/**
 * Format all targets for a step
 */
export function formatStepTargets(step: IntervalStepV2 | PlanStepV2): string {
  if (!step.targets || step.targets.length === 0) return "No targets";
  return step.targets.map(formatIntensityTarget).join(" + ");
}

import { z } from "zod";

// ==============================
// ACTIVITY PLAN STRUCTURE V2
// Simplified flat structure - no nested repetitions
// Repetitions are expanded at creation time into individual steps
// ==============================

/**
 * Duration Types V2
 *
 * NOTE: Step completion is evaluated at runtime based on actual performance.
 * - If user changes pace mid-workout or GPS drifts, completion dynamically adjusts
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

const intensityTargetFTPSchemaV2 = z.object({
  type: z.literal("%FTP"),
  intensity: z.number().positive().max(500),
});

const intensityTargetMaxHRSchemaV2 = z.object({
  type: z.literal("%MaxHR"),
  intensity: z.number().positive().max(200),
});

const intensityTargetThresholdHRSchemaV2 = z.object({
  type: z.literal("%ThresholdHR"),
  intensity: z.number().positive().max(200),
});

const intensityTargetWattsSchemaV2 = z.object({
  type: z.literal("watts"),
  intensity: z.number().nonnegative().max(5000),
});

const intensityTargetBPMSchemaV2 = z.object({
  type: z.literal("bpm"),
  intensity: z.number().positive().min(30).max(250),
});

const intensityTargetSpeedSchemaV2 = z.object({
  type: z.literal("speed"),
  intensity: z.number().nonnegative().max(100), // m/s
});

const intensityTargetCadenceSchemaV2 = z.object({
  type: z.literal("cadence"),
  intensity: z.number().nonnegative().max(300),
});

const intensityTargetRPESchemaV2 = z.object({
  type: z.literal("RPE"),
  intensity: z.number().min(1).max(10),
});

export const intensityTargetSchemaV2 = z.discriminatedUnion("type", [
  intensityTargetFTPSchemaV2,
  intensityTargetMaxHRSchemaV2,
  intensityTargetThresholdHRSchemaV2,
  intensityTargetWattsSchemaV2,
  intensityTargetBPMSchemaV2,
  intensityTargetSpeedSchemaV2,
  intensityTargetCadenceSchemaV2,
  intensityTargetRPESchemaV2,
]);

export type IntensityTargetV2 = z.infer<typeof intensityTargetSchemaV2>;

// ==============================
// PLAN STEP V2 (Flat structure)
// ==============================

export const planStepSchemaV2 = z.object({
  name: z.string().min(1).max(100).default("Step"),
  description: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),

  // Duration (required)
  duration: durationSchemaV2,

  // Multiple targets (optional)
  targets: z.array(intensityTargetSchemaV2).max(3).optional(),

  // Optional metadata for grouping/display
  segmentName: z.string().max(100).optional(),
  segmentIndex: z.number().int().nonnegative().optional(),
  originalRepetitionCount: z.number().int().positive().optional(), // Track if from repetition
});

export type PlanStepV2 = z.infer<typeof planStepSchemaV2>;

// ==============================
// ACTIVITY PLAN STRUCTURE V2
// ==============================

export const activityPlanStructureSchemaV2 = z.object({
  version: z.literal(2),
  steps: z.array(planStepSchemaV2).min(1).max(200),
});

export type ActivityPlanStructureV2 = z.infer<
  typeof activityPlanStructureSchemaV2
>;

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
 * Get intensity color for visualization
 */
export function getStepIntensityColor(step: PlanStepV2): string {
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
 * Format intensity target for display
 */
export function formatIntensityTarget(target: IntensityTargetV2): string {
  switch (target.type) {
    case "%FTP":
    case "%MaxHR":
    case "%ThresholdHR":
      return `${Math.round(target.intensity)}%`;
    case "watts":
      return `${Math.round(target.intensity)}W`;
    case "bpm":
      return `${Math.round(target.intensity)} bpm`;
    case "speed":
      return `${target.intensity.toFixed(1)} m/s`;
    case "cadence":
      return `${Math.round(target.intensity)} rpm`;
    case "RPE":
      return `${target.intensity}/10`;
    default:
      return `${target.intensity}`;
  }
}

/**
 * Format all targets for a step
 */
export function formatStepTargets(step: PlanStepV2): string {
  if (!step.targets || step.targets.length === 0) return "No targets";
  return step.targets.map(formatIntensityTarget).join(" + ");
}

/**
 * Group steps by segment for display
 */
export function groupStepsBySegment(
  steps: PlanStepV2[],
): Array<{ segmentName: string; steps: PlanStepV2[] }> {
  const groups: Array<{ segmentName: string; steps: PlanStepV2[] }> = [];
  let currentGroup: { segmentName: string; steps: PlanStepV2[] } | null = null;

  for (const step of steps) {
    const segmentName = step.segmentName || "Main";

    if (!currentGroup || currentGroup.segmentName !== segmentName) {
      currentGroup = { segmentName, steps: [] };
      groups.push(currentGroup);
    }

    currentGroup.steps.push(step);
  }

  return groups;
}

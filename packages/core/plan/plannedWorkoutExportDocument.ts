import { z } from "zod";
import {
  ACTIVITY_PLAN_V2_SAVEABLE_LIMITS,
  type ActivityPlanStructureV2,
  activityPlanSpeedKphToMetersPerSecond,
  type DurationV2,
  type IntensityTargetV2,
} from "../schemas/activity_plan_v2";
import {
  type ActivityTargetCategory,
  activityTargetCategorySchemaValues,
} from "../schemas/activity_target_capabilities";
import type { ActivityPlanTargetAnchors } from "./activityPlanProviderReadiness";

const exportDurationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("time"),
    value: z.number().positive().max(ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepDurationSeconds),
    unit: z.literal("seconds"),
  }),
  z.object({
    kind: z.literal("distance"),
    value: z.number().positive().max(ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepDistanceMeters),
    unit: z.literal("meters"),
  }),
  z.object({
    kind: z.literal("repetitions"),
    value: z.number().int().positive().max(ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepRepetitionCount),
    unit: z.literal("count"),
  }),
  z.object({ kind: z.literal("open") }),
]);

const relativeExportTargetSchema = z.object({
  kind: z.literal("relative"),
  metric: z.enum(["power", "heart_rate"]),
  basis: z.enum(["ftp", "maximum_heart_rate", "threshold_heart_rate"]),
  value: z.number().nonnegative(),
  unit: z.literal("percent"),
  resolvedValue: z.number().nonnegative().optional(),
  resolvedUnit: z.enum(["watts", "beats_per_minute"]).optional(),
});

const absoluteExportTargetSchema = z.object({
  kind: z.literal("absolute"),
  metric: z.enum(["power", "heart_rate", "speed", "cadence", "perceived_effort"]),
  sourceValue: z.number().nonnegative(),
  sourceUnit: z.enum([
    "watts",
    "beats_per_minute",
    "kilometers_per_hour",
    "revolutions_per_minute",
    "rpe",
  ]),
  value: z.number().nonnegative(),
  unit: z.enum(["watts", "beats_per_minute", "meters_per_second", "revolutions_per_minute", "rpe"]),
});

export const plannedWorkoutExportTargetSchema = z.discriminatedUnion("kind", [
  relativeExportTargetSchema,
  absoluteExportTargetSchema,
]);

export const plannedWorkoutExportStepSchema = z.object({
  kind: z.literal("step"),
  sourceStepId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  duration: exportDurationSchema,
  targets: z.array(plannedWorkoutExportTargetSchema).max(3),
});

export const plannedWorkoutExportRepeatSchema = z.object({
  kind: z.literal("repeat"),
  sourceIntervalId: z.string().uuid(),
  name: z.string().min(1).max(100),
  notes: z.string().max(1000).optional(),
  count: z.number().int().min(1).max(ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxIntervalRepetitions),
  steps: z.array(plannedWorkoutExportStepSchema).min(1).max(20),
});

/** Provider-neutral, deterministic workout representation with explicit normalized units. */
export const plannedWorkoutExportDocumentSchema = z
  .object({
    version: z.literal(1),
    event: z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(100),
      description: z.string().max(1000).optional(),
      scheduledAt: z.string().datetime().optional(),
    }),
    sport: z.enum(activityTargetCategorySchemaValues),
    blocks: z.array(plannedWorkoutExportRepeatSchema).min(1).max(50),
  })
  .superRefine((document, context) => {
    let expandedStepCount = 0;
    let expandedTimeSeconds = 0;

    document.blocks.forEach((block) => {
      expandedStepCount += block.steps.length * block.count;
      block.steps.forEach((step) => {
        if (step.duration.kind === "time") {
          expandedTimeSeconds += step.duration.value * block.count;
        }
      });
    });

    if (expandedStepCount > ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedStepCount) {
      context.addIssue({
        code: "custom",
        path: ["blocks"],
        message: `Workout cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedStepCount} expanded steps.`,
      });
    }
    if (expandedTimeSeconds > ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedDurationSeconds) {
      context.addIssue({
        code: "custom",
        path: ["blocks"],
        message: `Workout cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedDurationSeconds} seconds of expanded time.`,
      });
    }
  });

export type PlannedWorkoutExportDocument = z.infer<typeof plannedWorkoutExportDocumentSchema>;
export type PlannedWorkoutExportTarget = z.infer<typeof plannedWorkoutExportTargetSchema>;

export type PlannedWorkoutExportEventMetadata = {
  id: string;
  name: string;
  description?: string;
  scheduledAt?: string;
  sport: ActivityTargetCategory;
};

function mapDuration(duration: DurationV2): z.infer<typeof exportDurationSchema> {
  switch (duration.type) {
    case "time":
      return { kind: "time", value: duration.seconds, unit: "seconds" };
    case "distance":
      return { kind: "distance", value: duration.meters, unit: "meters" };
    case "repetitions":
      return { kind: "repetitions", value: duration.count, unit: "count" };
    case "untilFinished":
      return { kind: "open" };
  }
}

function mapTarget(
  target: IntensityTargetV2,
  anchors: ActivityPlanTargetAnchors,
): PlannedWorkoutExportTarget {
  switch (target.type) {
    case "%FTP":
      return {
        kind: "relative",
        metric: "power",
        basis: "ftp",
        value: target.intensity,
        unit: "percent",
        ...(anchors.ftpWatts != null
          ? {
              resolvedValue: (target.intensity / 100) * anchors.ftpWatts,
              resolvedUnit: "watts" as const,
            }
          : {}),
      };
    case "%MaxHR":
      return {
        kind: "relative",
        metric: "heart_rate",
        basis: "maximum_heart_rate",
        value: target.intensity,
        unit: "percent",
        ...(anchors.maxHeartRateBpm != null
          ? {
              resolvedValue: (target.intensity / 100) * anchors.maxHeartRateBpm,
              resolvedUnit: "beats_per_minute" as const,
            }
          : {}),
      };
    case "%ThresholdHR":
      return {
        kind: "relative",
        metric: "heart_rate",
        basis: "threshold_heart_rate",
        value: target.intensity,
        unit: "percent",
        ...(anchors.thresholdHeartRateBpm != null
          ? {
              resolvedValue: (target.intensity / 100) * anchors.thresholdHeartRateBpm,
              resolvedUnit: "beats_per_minute" as const,
            }
          : {}),
      };
    case "watts":
      return {
        kind: "absolute",
        metric: "power",
        sourceValue: target.intensity,
        sourceUnit: "watts",
        value: target.intensity,
        unit: "watts",
      };
    case "bpm":
      return {
        kind: "absolute",
        metric: "heart_rate",
        sourceValue: target.intensity,
        sourceUnit: "beats_per_minute",
        value: target.intensity,
        unit: "beats_per_minute",
      };
    case "speed":
      return {
        kind: "absolute",
        metric: "speed",
        sourceValue: target.intensity,
        sourceUnit: "kilometers_per_hour",
        value: activityPlanSpeedKphToMetersPerSecond(target.intensity),
        unit: "meters_per_second",
      };
    case "cadence":
      return {
        kind: "absolute",
        metric: "cadence",
        sourceValue: target.intensity,
        sourceUnit: "revolutions_per_minute",
        value: target.intensity,
        unit: "revolutions_per_minute",
      };
    case "RPE":
      return {
        kind: "absolute",
        metric: "perceived_effort",
        sourceValue: target.intensity,
        sourceUnit: "rpe",
        value: target.intensity,
        unit: "rpe",
      };
  }
}

/** Maps persisted V2 data without timestamps, provider behavior, or lossy target selection. */
export function mapActivityPlanToPlannedWorkoutExportDocument(input: {
  anchors?: ActivityPlanTargetAnchors;
  event: PlannedWorkoutExportEventMetadata;
  structure: ActivityPlanStructureV2;
}): PlannedWorkoutExportDocument {
  const { sport, ...event } = input.event;
  const anchors = input.anchors ?? {};

  return plannedWorkoutExportDocumentSchema.parse({
    version: 1,
    event,
    sport,
    blocks: input.structure.intervals.map((interval) => ({
      kind: "repeat",
      sourceIntervalId: interval.id,
      name: interval.name,
      ...(interval.notes == null ? {} : { notes: interval.notes }),
      count: interval.repetitions,
      steps: interval.steps.map((step) => ({
        kind: "step",
        sourceStepId: step.id,
        name: step.name,
        ...(step.description == null ? {} : { description: step.description }),
        ...(step.notes == null ? {} : { notes: step.notes }),
        duration: mapDuration(step.duration),
        targets: (step.targets ?? []).map((target) => mapTarget(target, anchors)),
      })),
    })),
  });
}

import { z } from "zod";
import type {
  ActivityPlanDuration,
  ActivityPlanStructureV3,
  ActivityPlanTarget,
} from "../activity-plan/v3-schema";
import { ACTIVITY_PLAN_V3_LIMITS } from "../activity-plan/v3-validation";
import { type CanonicalSport, canonicalSportSchema } from "../schemas/sport";
import type { ActivityPlanTargetAnchors } from "./activityPlanProviderReadiness";

const exportDurationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("time"), value: z.number().positive(), unit: z.literal("seconds") }),
  z.object({
    kind: z.literal("distance"),
    value: z.number().positive(),
    unit: z.literal("meters"),
  }),
  z.object({
    kind: z.literal("repetitions"),
    value: z.number().int().positive(),
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
  targets: z.array(plannedWorkoutExportTargetSchema).min(1).max(3),
});
export const plannedWorkoutExportRepeatSchema = z.object({
  kind: z.literal("repeat"),
  sourceSegmentId: z.string().uuid().optional(),
  category: canonicalSportSchema.optional(),
  sourceIntervalId: z.string().uuid(),
  name: z.string().min(1).max(100),
  notes: z.string().max(1000).optional(),
  count: z.number().int().min(1).max(ACTIVITY_PLAN_V3_LIMITS.maxIntervalRepetitions),
  steps: z
    .array(plannedWorkoutExportStepSchema)
    .min(1)
    .max(ACTIVITY_PLAN_V3_LIMITS.maxStepsPerInterval),
});

const exportActivitySegmentSchema = z.object({
  kind: z.literal("activity"),
  sourceSegmentId: z.string().uuid(),
  name: z.string().min(1).max(100),
  notes: z.string().max(1000).optional(),
  category: canonicalSportSchema,
  blocks: z.array(plannedWorkoutExportRepeatSchema).min(1),
});
const exportBoundarySegmentSchema = z.object({
  kind: z.enum(["rest", "transition"]),
  sourceSegmentId: z.string().uuid(),
  name: z.string().min(1).max(100),
  notes: z.string().max(1000).optional(),
  duration: z.object({
    kind: z.literal("time"),
    value: z.number().positive(),
    unit: z.literal("seconds"),
  }),
});

/** Lossless provider-neutral V3 representation, plus an explicitly labeled legacy projection. */
export const plannedWorkoutExportDocumentSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  event: z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(100),
    description: z.string().max(1000).optional(),
    scheduledAt: z.string().datetime().optional(),
  }),
  sport: canonicalSportSchema,
  blocks: z.array(plannedWorkoutExportRepeatSchema),
  segments: z
    .array(z.discriminatedUnion("kind", [exportActivitySegmentSchema, exportBoundarySegmentSchema]))
    .min(1)
    .optional(),
  categories: z.array(canonicalSportSchema).min(1).optional(),
  legacyProjection: z
    .object({
      lossless: z.boolean(),
      sport: canonicalSportSchema,
      blocks: z.array(plannedWorkoutExportRepeatSchema),
    })
    .optional(),
});

export type PlannedWorkoutExportDocument = z.infer<typeof plannedWorkoutExportDocumentSchema>;
export type PlannedWorkoutExportTarget = z.infer<typeof plannedWorkoutExportTargetSchema>;
export type PlannedWorkoutExportEventMetadata = {
  id: string;
  name: string;
  description?: string;
  scheduledAt?: string;
};

function mapDuration(duration: ActivityPlanDuration): z.infer<typeof exportDurationSchema> {
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
  target: ActivityPlanTarget,
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
        ...(anchors.ftpWatts == null
          ? {}
          : {
              resolvedValue: (target.intensity / 100) * anchors.ftpWatts,
              resolvedUnit: "watts" as const,
            }),
      };
    case "%MaxHR":
      return {
        kind: "relative",
        metric: "heart_rate",
        basis: "maximum_heart_rate",
        value: target.intensity,
        unit: "percent",
        ...(anchors.maxHeartRateBpm == null
          ? {}
          : {
              resolvedValue: (target.intensity / 100) * anchors.maxHeartRateBpm,
              resolvedUnit: "beats_per_minute" as const,
            }),
      };
    case "%ThresholdHR":
      return {
        kind: "relative",
        metric: "heart_rate",
        basis: "threshold_heart_rate",
        value: target.intensity,
        unit: "percent",
        ...(anchors.thresholdHeartRateBpm == null
          ? {}
          : {
              resolvedValue: (target.intensity / 100) * anchors.thresholdHeartRateBpm,
              resolvedUnit: "beats_per_minute" as const,
            }),
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
        value: target.intensity / 3.6,
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

/** Maps every authored segment; no boundary or secondary target is discarded. */
export function mapActivityPlanToPlannedWorkoutExportDocument(input: {
  anchors?: ActivityPlanTargetAnchors;
  event: PlannedWorkoutExportEventMetadata;
  structure: ActivityPlanStructureV3;
}): PlannedWorkoutExportDocument {
  const anchors = input.anchors ?? {};
  const categories: CanonicalSport[] = [];
  const blocks: z.infer<typeof plannedWorkoutExportRepeatSchema>[] = [];
  const segments = input.structure.segments.map((segment) => {
    if (segment.role !== "activity") {
      return {
        kind: segment.role,
        sourceSegmentId: segment.id,
        name: segment.name,
        ...(segment.notes == null ? {} : { notes: segment.notes }),
        duration: {
          kind: "time" as const,
          value: segment.duration.seconds,
          unit: "seconds" as const,
        },
      };
    }
    if (!categories.includes(segment.category)) categories.push(segment.category);
    const segmentBlocks = segment.intervals.map((interval) => ({
      kind: "repeat" as const,
      sourceSegmentId: segment.id,
      category: segment.category,
      sourceIntervalId: interval.id,
      name: interval.name,
      ...(interval.notes == null ? {} : { notes: interval.notes }),
      count: interval.repetitions,
      steps: interval.steps.map((step) => ({
        kind: "step" as const,
        sourceStepId: step.id,
        name: step.name,
        ...(step.description == null ? {} : { description: step.description }),
        ...(step.notes == null ? {} : { notes: step.notes }),
        duration: mapDuration(step.duration),
        targets: step.targets.map((target) => mapTarget(target, anchors)),
      })),
    }));
    blocks.push(...segmentBlocks);
    return {
      kind: "activity" as const,
      sourceSegmentId: segment.id,
      name: segment.name,
      ...(segment.notes == null ? {} : { notes: segment.notes }),
      category: segment.category,
      blocks: segmentBlocks,
    };
  });
  const primaryCategory = categories[0];
  if (!primaryCategory) throw new Error("Activity-plan export requires an activity segment.");
  const lossless =
    categories.length === 1 &&
    input.structure.segments.every((segment) => segment.role === "activity");
  return plannedWorkoutExportDocumentSchema.parse({
    version: 2,
    event: input.event,
    sport: primaryCategory,
    blocks,
    segments,
    categories,
    legacyProjection: { lossless, sport: primaryCategory, blocks },
  });
}

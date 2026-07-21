import { z } from "zod";

import { canonicalSportSchema } from "../schemas/sport";
import { type ActivityTarget, saveableActivityTargetSchema } from "../targets/schema";
import { ACTIVITY_PLAN_V3_LIMITS, addActivityPlanV3DocumentIssues } from "./v3-validation";

export const activityPlanTimeDurationSchema = z
  .object({
    type: z.literal("time"),
    seconds: z.number().int().positive().max(ACTIVITY_PLAN_V3_LIMITS.maxStepDurationSeconds),
  })
  .strict();

const activityPlanDistanceDurationSchema = z
  .object({
    type: z.literal("distance"),
    meters: z.number().int().positive().max(ACTIVITY_PLAN_V3_LIMITS.maxStepDistanceMeters),
  })
  .strict();

const activityPlanRepetitionDurationSchema = z
  .object({
    type: z.literal("repetitions"),
    count: z.number().int().positive().max(ACTIVITY_PLAN_V3_LIMITS.maxStepRepetitionCount),
  })
  .strict();

const activityPlanUntilFinishedDurationSchema = z
  .object({ type: z.literal("untilFinished") })
  .strict();

/** Modern saveable activity-plan-owned completion contracts. */
export const activityPlanDurationSchema = z.discriminatedUnion("type", [
  activityPlanTimeDurationSchema,
  activityPlanDistanceDurationSchema,
  activityPlanRepetitionDurationSchema,
  activityPlanUntilFinishedDurationSchema,
]);
export type ActivityPlanDuration = z.infer<typeof activityPlanDurationSchema>;

/** Target payloads retain the established units; speed is persisted in km/h. */
export const activityPlanTargetSchema = saveableActivityTargetSchema;
export type ActivityPlanTarget = ActivityTarget;

export const activityPlanIntervalStepSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100).default("Step"),
    description: z.string().max(500).optional(),
    notes: z.string().max(1000).optional(),
    duration: activityPlanDurationSchema,
    targets: z.array(activityPlanTargetSchema).min(1).max(3),
  })
  .strict();
export type ActivityPlanIntervalStep = z.infer<typeof activityPlanIntervalStepSchema>;

export const activityPlanIntervalSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    repetitions: z
      .number()
      .int()
      .min(1)
      .max(ACTIVITY_PLAN_V3_LIMITS.maxIntervalRepetitions)
      .default(1),
    steps: z
      .array(activityPlanIntervalStepSchema)
      .min(1)
      .max(ACTIVITY_PLAN_V3_LIMITS.maxStepsPerInterval),
    notes: z.string().max(1000).optional(),
  })
  .strict();
export type ActivityPlanInterval = z.infer<typeof activityPlanIntervalSchema>;

const segmentBase = {
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  notes: z.string().max(1000).optional(),
};

export const activityPlanActivitySegmentSchema = z
  .object({
    ...segmentBase,
    role: z.literal("activity"),
    category: canonicalSportSchema,
    intervals: z
      .array(activityPlanIntervalSchema)
      .min(1)
      .max(ACTIVITY_PLAN_V3_LIMITS.maxIntervalsPerActivity),
  })
  .strict();

const boundarySegment = <T extends "transition" | "rest">(role: T) =>
  z
    .object({
      ...segmentBase,
      role: z.literal(role),
      duration: activityPlanTimeDurationSchema,
    })
    .strict();

export const activityPlanTransitionSegmentSchema = boundarySegment("transition");
export const activityPlanRestSegmentSchema = boundarySegment("rest");
export const activityPlanSegmentSchema = z.discriminatedUnion("role", [
  activityPlanActivitySegmentSchema,
  activityPlanTransitionSegmentSchema,
  activityPlanRestSegmentSchema,
]);

const activityPlanStructureShapeSchemaV3 = z
  .object({
    version: z.literal(3, {
      error:
        "[ACTIVITY_PLAN_UNSUPPORTED_VERSION] Only activity-plan structure version 3 is accepted.",
    }),
    segments: z.array(activityPlanSegmentSchema).min(1).max(ACTIVITY_PLAN_V3_LIMITS.maxSegments),
  })
  .strict();

export type ActivityPlanActivitySegment = z.infer<typeof activityPlanActivitySegmentSchema>;
export type ActivityPlanTransitionSegment = z.infer<typeof activityPlanTransitionSegmentSchema>;
export type ActivityPlanRestSegment = z.infer<typeof activityPlanRestSegmentSchema>;
export type ActivityPlanSegmentV3 = z.infer<typeof activityPlanSegmentSchema>;
/** Strict authored and persisted V3 contract, including document-wide invariants. */
export const activityPlanStructureSchemaV3 = activityPlanStructureShapeSchemaV3
  .superRefine(addActivityPlanV3DocumentIssues)
  .brand<"ValidatedActivityPlanStructureV3">();

/** Branded output available only after strict document-wide V3 validation. */
export type ActivityPlanStructureV3 = z.output<typeof activityPlanStructureSchemaV3>;
/** Mutable authoring shape validated and branded only when persisted or executed. */
export type EditableActivityPlanStructure = {
  version: 3;
  segments: ActivityPlanSegmentV3[];
};

export function validateActivityPlanStructureV3(data: unknown) {
  return activityPlanStructureSchemaV3.safeParse(data);
}

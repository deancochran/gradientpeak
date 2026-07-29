import { z } from "zod";

import { canonicalActivityCategorySchema } from "../schemas/activity-category";
import { type ActivityTarget, saveableActivityTargetSchema } from "../targets/schema";
import { ACTIVITY_PLAN_V3_LIMITS, addActivityPlanV3DocumentIssues } from "./v3-validation";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const activityPlanIdSchema = z
  .string()
  .uuid()
  .refine((value) => value.toLowerCase() !== NIL_UUID, {
    message: "ActivityPlan IDs must not use the nil UUID.",
  });

const codePointBoundedString = (minimum: number, maximum: number) =>
  z.string().refine(
    (value) => {
      const length = Array.from(value).length;
      return length >= minimum && length <= maximum;
    },
    { message: `String must contain between ${minimum} and ${maximum} Unicode characters.` },
  );

const activityPlanNameSchema = codePointBoundedString(1, 100);
const activityPlanDescriptionSchema = codePointBoundedString(0, 500);
const activityPlanNotesSchema = codePointBoundedString(0, 1_000);

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
    id: activityPlanIdSchema,
    name: activityPlanNameSchema,
    description: activityPlanDescriptionSchema.optional(),
    notes: activityPlanNotesSchema.optional(),
    duration: activityPlanDurationSchema,
    targets: z.array(activityPlanTargetSchema).min(1).max(3),
  })
  .strict();
export type ActivityPlanIntervalStep = z.infer<typeof activityPlanIntervalStepSchema>;

export const activityPlanIntervalSchema = z
  .object({
    id: activityPlanIdSchema,
    name: activityPlanNameSchema,
    repetitions: z.number().int().min(1).max(ACTIVITY_PLAN_V3_LIMITS.maxIntervalRepetitions),
    steps: z
      .array(activityPlanIntervalStepSchema)
      .min(1)
      .max(ACTIVITY_PLAN_V3_LIMITS.maxStepsPerInterval),
    notes: activityPlanNotesSchema.optional(),
  })
  .strict();
export type ActivityPlanInterval = z.infer<typeof activityPlanIntervalSchema>;

const segmentBase = {
  id: activityPlanIdSchema,
  name: activityPlanNameSchema,
  notes: activityPlanNotesSchema.optional(),
};

export const activityPlanActivitySegmentSchema = z
  .object({
    ...segmentBase,
    role: z.literal("activity"),
    activity_category: canonicalActivityCategorySchema,
    intervals: z
      .array(activityPlanIntervalSchema)
      .min(1)
      .max(ACTIVITY_PLAN_V3_LIMITS.maxIntervalsPerActivity),
  })
  .strict();

const boundarySegment = (role: "rest") =>
  z
    .object({
      ...segmentBase,
      role: z.literal(role),
      duration: activityPlanTimeDurationSchema,
    })
    .strict();

export const activityPlanRestSegmentSchema = boundarySegment("rest");
export const activityPlanSegmentSchema = z.discriminatedUnion("role", [
  activityPlanActivitySegmentSchema,
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
export type ActivityPlanRestSegment = z.infer<typeof activityPlanRestSegmentSchema>;
export type ActivityPlanSegmentV3 = z.infer<typeof activityPlanSegmentSchema>;
/** The sole persisted and executable V3 contract, including document-wide invariants. */
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

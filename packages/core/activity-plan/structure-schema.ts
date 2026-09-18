import { z } from "zod";

import { canonicalActivityCategorySchema } from "../schemas/activity-category";
import { type ActivityTarget, saveableActivityTargetSchema } from "../targets/schema";
import { ACTIVITY_PLAN_LIMITS, addActivityPlanDocumentIssues } from "./structure-validation";

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
    seconds: z.number().int().positive().max(ACTIVITY_PLAN_LIMITS.maxStepDurationSeconds),
  })
  .strict();

const activityPlanDistanceDurationSchema = z
  .object({
    type: z.literal("distance"),
    meters: z.number().int().positive().max(ACTIVITY_PLAN_LIMITS.maxStepDistanceMeters),
  })
  .strict();

const activityPlanRepetitionDurationSchema = z
  .object({
    type: z.literal("repetitions"),
    count: z.number().int().positive().max(ACTIVITY_PLAN_LIMITS.maxStepRepetitionCount),
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
    purpose: z.enum(["warmup", "work", "recovery", "cooldown", "technique"]).optional(),
    duration: activityPlanDurationSchema,
    targets: z.array(activityPlanTargetSchema).min(1).max(3),
  })
  .strict();
export type ActivityPlanIntervalStep = z.infer<typeof activityPlanIntervalStepSchema>;

export const activityPlanIntervalSchema = z
  .object({
    id: activityPlanIdSchema,
    name: activityPlanNameSchema,
    repetitions: z.number().int().min(1).max(ACTIVITY_PLAN_LIMITS.maxIntervalRepetitions),
    steps: z
      .array(activityPlanIntervalStepSchema)
      .min(1)
      .max(ACTIVITY_PLAN_LIMITS.maxStepsPerInterval),
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
    intervals: z
      .array(activityPlanIntervalSchema)
      .min(1)
      .max(ACTIVITY_PLAN_LIMITS.maxIntervalsPerActivity),
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

const activityPlanStructureShapeSchema = z
  .object({
    version: z.literal(3, {
      error:
        "[ACTIVITY_PLAN_UNSUPPORTED_VERSION] Only activity-plan structure version 3 is accepted.",
    }),
    activity_category: canonicalActivityCategorySchema,
    segments: z.array(activityPlanSegmentSchema).min(1).max(ACTIVITY_PLAN_LIMITS.maxSegments),
  })
  .strict();

export type ActivityPlanActivitySegment = z.infer<typeof activityPlanActivitySegmentSchema>;
export type ActivityPlanRestSegment = z.infer<typeof activityPlanRestSegmentSchema>;
export type ActivityPlanSegment = z.infer<typeof activityPlanSegmentSchema>;
/** The sole persisted and executable activity-plan contract, including document-wide invariants. */
export const activityPlanStructureSchema = activityPlanStructureShapeSchema
  .superRefine(addActivityPlanDocumentIssues)
  .brand<"ValidatedActivityPlanStructure">();

/** Branded output available only after strict document-wide validation. */
export type ActivityPlanStructure = z.output<typeof activityPlanStructureSchema>;
/** Mutable authoring shape validated and branded only when persisted or executed. */
export type EditableActivityPlanStructure = {
  version: 3;
  activity_category: z.infer<typeof canonicalActivityCategorySchema>;
  segments: ActivityPlanSegment[];
};

export function validateActivityPlanStructure(data: unknown) {
  return activityPlanStructureSchema.safeParse(data);
}

function canonicalActivityPlanJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Activity plan contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalActivityPlanJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalActivityPlanJson(nested)}`)
      .join(",")}}`;
  }
  throw new Error(`Activity plan contains unsupported ${typeof value}`);
}

/** Canonical, cross-runtime hash input for the sole executable V3 structure contract. */
export function getCanonicalActivityPlanStructureHashInput(input: unknown): string {
  return canonicalActivityPlanJson(activityPlanStructureSchema.parse(input));
}

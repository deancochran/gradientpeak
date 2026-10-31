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
const optionalText = (maximum: number) =>
  codePointBoundedString(1, maximum)
    .refine((value) => value.trim().length > 0, {
      message: "Optional text must not be blank when supplied.",
    })
    .optional();

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
export const activityPlanDurationSchema = z.discriminatedUnion("type", [
  activityPlanTimeDurationSchema,
  activityPlanDistanceDurationSchema,
  activityPlanRepetitionDurationSchema,
  activityPlanUntilFinishedDurationSchema,
]);
export type ActivityPlanDuration = z.infer<typeof activityPlanDurationSchema>;
export const activityPlanTargetSchema = saveableActivityTargetSchema;
export type ActivityPlanTarget = ActivityTarget;

export const activityPlanStepSchema = z
  .object({
    type: z.literal("step"),
    id: activityPlanIdSchema,
    name: optionalText(100),
    instructions: optionalText(1_000),
    duration: activityPlanDurationSchema,
    targets: z.array(activityPlanTargetSchema).max(3),
  })
  .strict();
export type ActivityPlanStep = z.infer<typeof activityPlanStepSchema>;
export const activityPlanRepeatSchema = z
  .object({
    type: z.literal("repeat"),
    id: activityPlanIdSchema,
    count: z.number().int().min(2).max(ACTIVITY_PLAN_LIMITS.maxRepeatCount),
    steps: z.array(activityPlanStepSchema).min(1).max(ACTIVITY_PLAN_LIMITS.maxStepsPerRepeat),
  })
  .strict();
export type ActivityPlanRepeat = z.infer<typeof activityPlanRepeatSchema>;
export const activityPlanItemSchema = z.discriminatedUnion("type", [
  activityPlanStepSchema,
  activityPlanRepeatSchema,
]);
export type ActivityPlanItem = z.infer<typeof activityPlanItemSchema>;

const activityPlanStructureShapeSchema = z
  .object({
    version: z.literal(5, {
      error:
        "[ACTIVITY_PLAN_UNSUPPORTED_VERSION] Only activity-plan structure version 5 is accepted.",
    }),
    activity_category: canonicalActivityCategorySchema,
    items: z.array(activityPlanItemSchema).min(1).max(ACTIVITY_PLAN_LIMITS.maxItems),
  })
  .strict();
export const activityPlanStructureSchema = activityPlanStructureShapeSchema
  .superRefine(addActivityPlanDocumentIssues)
  .brand<"ValidatedActivityPlanStructure">();
export type ActivityPlanStructure = z.output<typeof activityPlanStructureSchema>;
export type EditableActivityPlanStructure = z.input<typeof activityPlanStructureSchema>;
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
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalActivityPlanJson(nested)}`)
      .join(",")}}`;
  throw new Error(`Activity plan contains unsupported ${typeof value}`);
}
/** Canonical, cross-runtime hash input for the sole executable V5 structure contract. */
export function getCanonicalActivityPlanStructureHashInput(input: unknown): string {
  return canonicalActivityPlanJson(activityPlanStructureSchema.parse(input));
}

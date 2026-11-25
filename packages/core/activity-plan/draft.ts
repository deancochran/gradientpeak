import { z } from "zod";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";
import { activityTargetTypeSchema } from "../targets/schema";
import { activityPlanAuthoringStructureSchema } from "./authoring";
import {
  type ActivityPlanStructure,
  activityPlanDurationSchema,
  activityPlanStepSchema,
} from "./structure-schema";
import { ACTIVITY_PLAN_LIMITS } from "./structure-validation";

export const activityPlanDraftTargetSchema = z.union([
  z.object({ type: z.literal("rest") }).strict(),
  z
    .object({
      type: activityTargetTypeSchema.exclude(["rest"]),
      intensity: z.number().finite().nullable(),
    })
    .strict(),
]);
export type ActivityPlanDraftTarget = z.output<typeof activityPlanDraftTargetSchema>;
export const activityPlanDraftStepSchema = z
  .object({
    type: z.literal("step"),
    id: activityPlanStepSchema.shape.id,
    name: activityPlanStepSchema.shape.name,
    instructions: activityPlanStepSchema.shape.instructions,
    duration: activityPlanDurationSchema.nullable(),
    targets: z.array(activityPlanDraftTargetSchema).max(3),
  })
  .strict();
export type ActivityPlanDraftStep = z.output<typeof activityPlanDraftStepSchema>;
export const activityPlanDraftRepeatSchema = z
  .object({
    type: z.literal("repeat"),
    id: activityPlanStepSchema.shape.id,
    count: z.number().int().min(2).max(ACTIVITY_PLAN_LIMITS.maxRepeatCount),
    steps: z.array(activityPlanDraftStepSchema).max(ACTIVITY_PLAN_LIMITS.maxStepsPerRepeat),
  })
  .strict();
export type ActivityPlanDraftRepeat = z.output<typeof activityPlanDraftRepeatSchema>;
export const activityPlanDraftItemSchema = z.discriminatedUnion("type", [
  activityPlanDraftStepSchema,
  activityPlanDraftRepeatSchema,
]);
export type ActivityPlanDraftItem = z.output<typeof activityPlanDraftItemSchema>;
const activityPlanDraftInputSchema = z
  .object({
    version: z.literal(5),
    activity_category: canonicalActivityCategorySchema.nullable(),
    items: z.array(activityPlanDraftItemSchema).max(ACTIVITY_PLAN_LIMITS.maxItems),
  })
  .strict();
/** Drafts permit an empty root/repeat and incomplete duration or target values; they are not executable. */
export const activityPlanDraftStructureSchema = activityPlanDraftInputSchema.superRefine(
  (draft, context) => {
    const ids = new Set<string>();
    const check = (id: string, path: (string | number)[]) => {
      if (ids.has(id))
        context.addIssue({
          code: "custom",
          path,
          message: "[ACTIVITY_PLAN_DUPLICATE_ID] Step and repeat IDs must be globally unique.",
        });
      ids.add(id);
    };
    draft.items.forEach((item, index) => {
      check(item.id, ["items", index, "id"]);
      if (item.type === "repeat")
        item.steps.forEach((step, childIndex) => {
          check(step.id, ["items", index, "steps", childIndex, "id"]);
        });
    });
  },
);
export type ActivityPlanDraftStructure = z.output<typeof activityPlanDraftStructureSchema>;
export type ActivityPlanDraftResolution =
  | { status: "valid"; structure: ActivityPlanStructure }
  | { status: "invalid"; issues: readonly string[] };
export function resolveActivityPlanDraft(input: unknown): ActivityPlanDraftResolution {
  const draft = activityPlanDraftStructureSchema.safeParse(input);
  if (!draft.success)
    return { status: "invalid", issues: draft.error.issues.map((issue) => issue.message) };
  const parsed = activityPlanAuthoringStructureSchema.safeParse(draft.data);
  return parsed.success
    ? { status: "valid", structure: parsed.data }
    : { status: "invalid", issues: parsed.error.issues.map((issue) => issue.message) };
}

import { canonicalActivityCategorySchema } from "@repo/core";
import { activityPlanDocumentSchema, resolveActivityPlanVariant } from "@repo/core/activity-plan";
import { z } from "zod";

export class InvalidStoredActivityPlanError extends Error {
  constructor() {
    super("Stored activity plan is not valid");
    this.name = "InvalidStoredActivityPlanError";
  }
}

export const activityPlanExecutionDtoSchema = z
  .object({
    activity_category: canonicalActivityCategorySchema,
  })
  .strict();

export type ActivityPlanExecutionDto = z.infer<typeof activityPlanExecutionDtoSchema>;

/** Maps a persisted or relation-loaded plan to the public execution DTO. */
export function toActivityPlanExecutionDto<T extends { structure: unknown }>(
  plan: T,
): T & ActivityPlanExecutionDto {
  const parsed = activityPlanDocumentSchema.safeParse(plan.structure);
  if (!parsed.success) {
    throw new InvalidStoredActivityPlanError();
  }
  const resolved = resolveActivityPlanVariant(parsed.data);
  const execution = activityPlanExecutionDtoSchema.parse({
    activity_category: resolved.structure.activity_category,
  });

  return {
    ...plan,
    ...execution,
  };
}

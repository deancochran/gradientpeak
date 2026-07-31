import { canonicalActivityCategorySchema } from "@repo/core";
import { activityPlanStructureSchema } from "@repo/core/activity-plan";
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
  const parsed = activityPlanStructureSchema.safeParse(plan.structure);
  if (!parsed.success) {
    throw new InvalidStoredActivityPlanError();
  }
  const activitySegment = parsed.data.segments.find((segment) => segment.role === "activity");
  if (!activitySegment) throw new InvalidStoredActivityPlanError();
  const execution = activityPlanExecutionDtoSchema.parse({
    activity_category: activitySegment.activity_category,
  });

  return {
    ...plan,
    ...execution,
  };
}

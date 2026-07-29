import { canonicalActivityCategorySchema } from "@repo/core";
import { activityPlanStructureSchemaV3 } from "@repo/core/activity-plan";
import { z } from "zod";

export class InvalidStoredActivityPlanError extends Error {
  constructor() {
    super("Stored activity plan is not valid V3");
    this.name = "InvalidStoredActivityPlanError";
  }
}

export const activityPlanExecutionDtoSchema = z
  .object({
    activity_category: canonicalActivityCategorySchema,
  })
  .strict();

export type ActivityPlanExecutionDto = z.infer<typeof activityPlanExecutionDtoSchema>;

export function hasActivityPlanExecutionDto(value: unknown): value is ActivityPlanExecutionDto {
  return activityPlanExecutionDtoSchema.safeParse(value).success;
}

/** Maps a persisted or relation-loaded plan to the public execution DTO. */
export function toActivityPlanExecutionDto<T extends { structure: unknown }>(
  plan: T,
): T & ActivityPlanExecutionDto {
  const parsed = activityPlanStructureSchemaV3.safeParse(plan.structure);
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

/**
 * Collection reads must preserve the Event even when its historical plan no
 * longer satisfies the strict V3 contract. The Event still carries its plan
 * foreign key, so callers can distinguish unavailable from unlinked.
 */
export function toAvailableActivityPlanExecutionDto<T extends { structure: unknown }>(
  plan: T | null,
): (T & ActivityPlanExecutionDto) | null {
  if (!plan) return null;

  try {
    return toActivityPlanExecutionDto(plan);
  } catch (error) {
    if (error instanceof InvalidStoredActivityPlanError) return null;
    throw error;
  }
}

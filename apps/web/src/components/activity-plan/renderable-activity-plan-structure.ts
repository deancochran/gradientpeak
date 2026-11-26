import { activityPlanStructureSchema } from "@repo/core/activity-plan";

/** Public sharing uses the exact V4 document; legacy segments are deliberately not hydrated. */
export function toRenderableActivityPlanStructure(input: unknown): unknown {
  const parsed = activityPlanStructureSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

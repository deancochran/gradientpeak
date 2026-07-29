import { z } from "zod";

/** Ordered canonical activity categories used by shared activity, recording, and planning contracts. */
export const canonicalActivityCategoryValues = [
  "run",
  "bike",
  "swim",
  "strength",
  "other",
] as const;

export const canonicalActivityCategorySchema = z.enum(canonicalActivityCategoryValues);

/** ActivityCategories for goal targets that have a measurable endurance or general target. */
export const goalTargetActivityCategorySchema = canonicalActivityCategorySchema.exclude([
  "strength",
]);

/** ActivityCategories supported by activity-effort measurements. */
export const activityEffortCategorySchema = canonicalActivityCategorySchema.extract([
  "run",
  "bike",
  "swim",
]);

export const planningActivityCategorySchema = z.union([
  canonicalActivityCategorySchema,
  z.literal("mixed"),
]);

export type CanonicalActivityCategory = z.infer<typeof canonicalActivityCategorySchema>;
export type GoalTargetActivityCategory = z.infer<typeof goalTargetActivityCategorySchema>;
export type ActivityEffortCategoryValue = z.infer<typeof activityEffortCategorySchema>;
export type PlanningActivityCategory = z.infer<typeof planningActivityCategorySchema>;

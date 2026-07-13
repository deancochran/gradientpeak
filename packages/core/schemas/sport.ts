import { z } from "zod";

/** Ordered canonical activity categories used by shared activity, recording, and planning contracts. */
export const canonicalSportValues = ["run", "bike", "swim", "strength", "other"] as const;

export const canonicalSportSchema = z.enum(canonicalSportValues);

/** Sports for goal targets that have a measurable endurance or general target. */
export const goalTargetSportSchema = canonicalSportSchema.exclude(["strength"]);

/** Sports supported by activity-effort measurements. */
export const activityEffortSportSchema = canonicalSportSchema.extract(["run", "bike", "swim"]);

export const planningSportSchema = z.union([canonicalSportSchema, z.literal("mixed")]);

export type CanonicalSport = z.infer<typeof canonicalSportSchema>;
export type GoalTargetSport = z.infer<typeof goalTargetSportSchema>;
export type ActivityEffortSport = z.infer<typeof activityEffortSportSchema>;
export type PlanningSport = z.infer<typeof planningSportSchema>;

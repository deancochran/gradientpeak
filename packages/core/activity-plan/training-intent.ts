import { z } from "zod";

export const activityPlanTrainingIntentSchema = z.enum([
  "recovery",
  "aerobic_base",
  "durable_endurance",
  "threshold_development",
  "race_specific",
  "vo2max",
  "anaerobic_capacity",
  "muscular_endurance",
  "speed_skill",
  "technique",
  "strength_support",
  "general_maintenance",
]);

export type ActivityPlanTrainingIntent = z.infer<typeof activityPlanTrainingIntentSchema>;

export const activityPlanIntentSchema = z
  .object({ training_intent: activityPlanTrainingIntentSchema })
  .strict();

export type ActivityPlanIntent = z.infer<typeof activityPlanIntentSchema>;

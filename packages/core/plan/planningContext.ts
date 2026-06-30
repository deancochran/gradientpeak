import { z } from "zod";
import { athletePlanningContextSchema } from "./athletePlanningContext";
import { planningGoalSchema } from "./planningGoals";
import { planningPreferencesSchema } from "./planningPreferences";
import { dateOnlySchema, planningScheduleSchema } from "./planningSchedule";
import { plannedTrainingSessionSchema } from "./planningSessions";

export const planningContextSchema = z
  .object({
    anchorDate: dateOnlySchema,
    athleteContext: athletePlanningContextSchema,
    goals: z.array(planningGoalSchema),
    preferences: planningPreferencesSchema,
    sessions: z.array(plannedTrainingSessionSchema),
    scheduling: planningScheduleSchema,
  })
  .strict();

export type PlanningContext = z.infer<typeof planningContextSchema>;

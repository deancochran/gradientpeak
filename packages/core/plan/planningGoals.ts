import { z } from "zod";
import {
  canonicalGoalActivityCategorySchema,
  canonicalGoalObjectiveSchema,
} from "../schemas/goals/profile_goals";
import { dateOnlySchema } from "./planningSchedule";

export const planningGoalSchema = z
  .object({
    localId: z.string().min(1),
    sourceProfileGoalId: z.string().min(1).nullable().optional(),
    title: z.string(),
    targetOffsetDays: z.number().int().min(0).nullable(),
    targetDate: dateOnlySchema.nullable().optional(),
    priority: z.number().int().min(0).max(10).default(10),
    activityCategory: canonicalGoalActivityCategorySchema.nullable(),
    objective: canonicalGoalObjectiveSchema.nullable(),
  })
  .strict();

export type PlanningGoal = z.infer<typeof planningGoalSchema>;

import { canonicalGoalActivityCategorySchema, dateOnlySchema } from "@repo/core";
import { z } from "zod";

/** PostgreSQL UTC microsecond timestamp plus the stable goal-id tie breaker. */
const cursorSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\|[0-9a-f-]{36}$/i)
  .max(64);

export const coachAthleteGoalsRequestSchema = z
  .object({
    organizationId: z.string().uuid(),
    athleteProfileId: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: cursorSchema.nullable().default(null),
  })
  .strict();

export const coachAthleteGoalSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    targetDate: dateOnlySchema,
    category: canonicalGoalActivityCategorySchema,
    priority: z.number().int().min(0).max(10),
    status: z.enum(["draft", "ready", "in_progress", "completed", "needs_update"]),
  })
  .strict();

export const coachAthleteGoalsResponseSchema = z
  .object({
    items: z.array(coachAthleteGoalSummarySchema),
    nextCursor: cursorSchema.nullable(),
  })
  .strict();

export type CoachAthleteGoalsRequest = z.output<typeof coachAthleteGoalsRequestSchema>;
export type CoachAthleteGoalsResponse = z.output<typeof coachAthleteGoalsResponseSchema>;

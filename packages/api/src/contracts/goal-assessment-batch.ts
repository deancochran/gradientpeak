import { z } from "zod";

import { projectionFreshnessSchema } from "../application/athlete-intelligence/published-athlete-state";

export const goalAssessmentBatchRequestSchema = z
  .object({
    goalIds: z
      .array(z.string().uuid())
      .min(1)
      .max(100)
      .superRefine((goalIds, context) => {
        if (new Set(goalIds).size !== goalIds.length) {
          context.addIssue({ code: "custom", message: "Goal IDs must be unique" });
        }
      }),
  })
  .strict();

const compactGoalReadinessSchema = z
  .object({
    status: z.enum(["ready", "watch", "not_ready"]),
    value: z.number().min(0).max(100),
  })
  .strict();

export const goalAssessmentBatchEntrySchema = z
  .object({
    goalId: z.string().uuid(),
    readiness: compactGoalReadinessSchema.nullable(),
    freshness: projectionFreshnessSchema,
    confidence: z.number().min(0).max(1),
    revision: z.number().int().nonnegative().nullable(),
    computedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const goalAssessmentBatchResponseSchema = z
  .object({ entries: z.array(goalAssessmentBatchEntrySchema).max(100) })
  .strict();

export type GoalAssessmentBatchRequest = z.input<typeof goalAssessmentBatchRequestSchema>;
export type GoalAssessmentBatchResponse = z.output<typeof goalAssessmentBatchResponseSchema>;

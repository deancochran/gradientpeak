import { thresholdGoalProgressResultSchema } from "@repo/core";
import { z } from "zod";

import { calculatedThresholdHistoryItemSchema } from "./threshold-overview";

export const goalProgressRequestSchema = z
  .object({
    goalId: z.string().uuid(),
  })
  .strict();

export const goalPortfolioRequestSchema = z.object({}).strict();

const compactPortfolioGoalSchema = z
  .object({
    activityCategory: z.string().nullable(),
    id: z.string().uuid(),
    priority: z.number().int().min(0).max(10),
    targetDate: z.iso.date(),
    title: z.string().min(1).max(100),
  })
  .strict();

export const goalPortfolioResponseSchema = z
  .object({
    activeGoalCount: z.number().int().nonnegative(),
    computedAt: z.string().datetime({ offset: true }),
    freshness: z.enum(["fresh", "stale", "unavailable"]),
    planningDate: z.iso.date(),
    publishedRevision: z.number().int().nonnegative().nullable(),
    selectedGoal: compactPortfolioGoalSchema.nullable(),
    totalGoalCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((portfolio, context) => {
    if (portfolio.activeGoalCount === 0 && portfolio.selectedGoal !== null) {
      context.addIssue({
        code: "custom",
        path: ["selectedGoal"],
        message: "A portfolio without active goals cannot select a priority goal",
      });
    }
  });

const goalProgressProvenanceSchema = z
  .object({
    baseline: calculatedThresholdHistoryItemSchema.nullable(),
    current: calculatedThresholdHistoryItemSchema.nullable(),
  })
  .strict();

const goalProgressPublicationSchema = z
  .object({
    computedAt: z.string().datetime({ offset: true }).nullable(),
    status: z.enum(["available", "stale", "unavailable"]),
    publishedRevision: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const goalProgressResponseSchema = z
  .object({
    result: thresholdGoalProgressResultSchema,
    provenance: goalProgressProvenanceSchema.nullable(),
    publication: goalProgressPublicationSchema.nullable(),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.result.status === "unsupported") {
      if (response.provenance !== null || response.publication !== null) {
        context.addIssue({
          code: "custom",
          path: ["provenance"],
          message: "Unsupported goals must not imply threshold evidence was evaluated",
        });
      }
      return;
    }

    if (!response.provenance || !response.publication) {
      context.addIssue({
        code: "custom",
        path: ["provenance"],
        message: "Supported goal progress requires publication and provenance metadata",
      });
      return;
    }
    for (const key of ["baseline", "current"] as const) {
      const observation = response.result[key];
      const provenance = response.provenance[key];
      if (observation === null && provenance !== null) {
        context.addIssue({
          code: "custom",
          path: ["provenance", key],
          message: "Threshold provenance cannot exist without its progress observation",
        });
      } else if (observation !== null && provenance?.thresholdId !== observation.thresholdId) {
        context.addIssue({
          code: "custom",
          path: ["provenance", key, "thresholdId"],
          message: "Threshold provenance must match its progress observation",
        });
      }
    }
  });

export type GoalProgressRequest = z.infer<typeof goalProgressRequestSchema>;
export type GoalProgressResponse = z.infer<typeof goalProgressResponseSchema>;
export type GoalPortfolioResponse = z.output<typeof goalPortfolioResponseSchema>;

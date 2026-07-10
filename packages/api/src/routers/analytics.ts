import { calculateCriticalPower, calculateSeasonBestCurve } from "@repo/core/calculations";
import { publicActivityCategorySchema, publicEffortTypeSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOwnedBestEfforts } from "../application/analytics/getOwnedBestEfforts";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const analyticsInputSchema = z.object({
  activity_category: publicActivityCategorySchema,
  effort_type: publicEffortTypeSchema,
  days: z.number().optional().default(90),
});

const predictPerformanceInputSchema = analyticsInputSchema.extend({
  duration: z.number().positive(),
});

const predictPerformanceOutputSchema = z.object({
  predicted_value: z.number(),
  unit: z.string(),
  model: z.object({
    cp: z.number(),
    wPrime: z.number(),
    error: z.number(),
  }),
});

export const analyticsRouter = createTRPCRouter({
  getSeasonBestCurve: protectedProcedure
    .input(analyticsInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const efforts = await getOwnedBestEfforts(db, input, ctx.session.user.id);

      return calculateSeasonBestCurve(efforts, {
        days: input.days,
        activity_category: input.activity_category,
        effort_type: input.effort_type,
      });
    }),

  predictPerformance: protectedProcedure
    .input(predictPerformanceInputSchema)
    .output(predictPerformanceOutputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const efforts = await getOwnedBestEfforts(db, input, ctx.session.user.id);

      const curve = calculateSeasonBestCurve(efforts, {
        days: input.days,
        activity_category: input.activity_category,
        effort_type: input.effort_type,
      });

      const model = calculateCriticalPower(curve);

      if (!model) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Insufficient data to calculate performance model. Need at least 2 max efforts between 3 and 30 minutes.",
        });
      }

      const predictedValue = model.cp + model.wPrime * (1 / input.duration);

      return {
        predicted_value: Math.round(predictedValue),
        unit: input.effort_type === "power" ? "watts" : "m/s",
        model,
      };
    }),
});

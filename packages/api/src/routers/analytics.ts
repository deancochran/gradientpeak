import {
  calculateCriticalPower,
  calculateSeasonBestCurve,
  estimatePowerForDuration,
} from "@repo/core/calculations";
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
    source: z.literal("observed-curve-fit"),
    cp: z.number(),
    wPrime: z.number(),
    error: z.number(),
    fitMinDurationSeconds: z.number(),
    fitMaxDurationSeconds: z.number(),
    pointCount: z.number().int().positive(),
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
      if (input.activity_category !== "bike" || input.effort_type !== "power") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Critical-power prediction is only supported for bike power efforts.",
        });
      }

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
            "Insufficient data to calculate performance model. Need at least 3 observed max efforts between 3 and 30 minutes, including short and long coverage.",
        });
      }

      let predictedValue: number;
      try {
        predictedValue = estimatePowerForDuration(model, input.duration);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Prediction duration must be within the observed fit span and 180-1800 seconds (${model.fitMinDurationSeconds}-${model.fitMaxDurationSeconds} seconds).`,
        });
      }

      return {
        predicted_value: predictedValue,
        unit: "watts",
        model,
      };
    }),
});

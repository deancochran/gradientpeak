import {
  calculateSeasonBestCurve,
  estimatePowerForDuration,
  evaluateCriticalPower,
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
  days: z.number().int().min(1).max(365).optional().default(90),
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
    rSquared: z.number(),
    /** @deprecated Compatibility alias for rSquared. */
    error: z.number(),
    rmseWatts: z.number().nonnegative(),
    maxAbsoluteResidualWatts: z.number().nonnegative(),
    fitMinDurationSeconds: z.number(),
    fitMaxDurationSeconds: z.number(),
    pointCount: z.number().int().positive(),
    activityCount: z.number().int().positive(),
    residuals: z.array(
      z.object({
        pointId: z.string(),
        durationSeconds: z.number().positive(),
        observedWatts: z.number().positive(),
        predictedWatts: z.number().positive(),
        residualWatts: z.number(),
      }),
    ),
    stability: z.object({
      maxCpChangeRatio: z.number().nonnegative(),
      maxWPrimeChangeRatio: z.number().nonnegative(),
      maxPredictionChangeRatio: z.number().nonnegative(),
    }),
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

      const evaluation = evaluateCriticalPower(curve);

      if (evaluation.status === "abstained") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Critical-power model abstained: ${evaluation.reason}.`,
        });
      }
      const model = evaluation.model;

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

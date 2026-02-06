import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  calculateSeasonBestCurve,
  calculateCriticalPower,
} from "@repo/core/calculations";
import { BestEffortSchema } from "@repo/core/schemas/activity_efforts";
import { publicActivityCategorySchema } from "@repo/supabase";

export const analyticsRouter = createTRPCRouter({
  getSeasonBestCurve: protectedProcedure
    .input(
      z.object({
        activity_category: publicActivityCategorySchema,
        effort_type: z.enum(["power", "speed"]),
        days: z.number().optional().default(90),
      }),
    )
    .output(z.array(BestEffortSchema))
    .query(async ({ ctx, input }) => {
      const { activity_category, effort_type, days } = input;
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Fetch efforts from DB
      const { data: effortsRaw, error } = await ctx.supabase
        .from("activity_efforts")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .eq("activity_category", activity_category)
        .eq("effort_type", effort_type)
        .gte("recorded_at", cutoffDate.toISOString());

      if (error) {
        throw new Error(`Failed to fetch activity efforts: ${error.message}`);
      }

      // Filter out null activity_ids and ensure type safety
      const efforts = (effortsRaw || [])
        .filter((e) => e.activity_id !== null)
        .map((e) => ({
          ...e,
          activity_id: e.activity_id as string,
        }));

      // Calculate curve
      return calculateSeasonBestCurve(efforts, {
        days,
        activity_category,
        effort_type,
      });
    }),

  predictPerformance: protectedProcedure
    .input(
      z.object({
        activity_category: publicActivityCategorySchema,
        effort_type: z.enum(["power", "speed"]),
        duration: z.number().positive(), // Duration in seconds
        days: z.number().optional().default(90),
      }),
    )
    .output(
      z.object({
        predicted_value: z.number(),
        unit: z.string(),
        model: z.object({
          cp: z.number(),
          wPrime: z.number(),
          error: z.number(),
        }),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { activity_category, effort_type, duration, days } = input;
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Fetch efforts from DB
      const { data: effortsRaw, error } = await ctx.supabase
        .from("activity_efforts")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .eq("activity_category", activity_category)
        .eq("effort_type", effort_type)
        .gte("recorded_at", cutoffDate.toISOString());

      if (error) {
        throw new Error(`Failed to fetch activity efforts: ${error.message}`);
      }

      // Filter out null activity_ids and ensure type safety
      const efforts = (effortsRaw || [])
        .filter((e) => e.activity_id !== null)
        .map((e) => ({
          ...e,
          activity_id: e.activity_id as string,
        }));

      // Calculate curve
      const curve = calculateSeasonBestCurve(efforts, {
        days,
        activity_category,
        effort_type,
      });

      // Calculate Critical Power / Speed
      const model = calculateCriticalPower(curve);

      if (!model) {
        throw new Error(
          "Insufficient data to calculate performance model. Need at least 2 max efforts between 3 and 30 minutes.",
        );
      }

      // Predict value
      // Power = CP + W' * (1/Time)
      const predictedValue = model.cp + model.wPrime * (1 / duration);

      return {
        predicted_value: Math.round(predictedValue),
        unit: effort_type === "power" ? "watts" : "m/s",
        model,
      };
    }),
});

import { calculateCriticalPower, calculateSeasonBestCurve } from "@repo/core/calculations";
import { type BestEffort, BestEffortSchema } from "@repo/core/schemas/activity_efforts";
import {
  activityEfforts,
  publicActivityCategorySchema,
  publicActivityEffortsRowSchema,
  publicEffortTypeSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { z } from "zod";
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

async function getOwnedBestEfforts(
  db: ReturnType<typeof getRequiredDb>,
  input: z.infer<typeof analyticsInputSchema>,
  profileId: string,
): Promise<BestEffort[]> {
  const cutoffDate = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(activityEfforts)
    .where(
      and(
        eq(activityEfforts.profile_id, profileId),
        eq(activityEfforts.activity_category, input.activity_category),
        eq(activityEfforts.effort_type, input.effort_type),
        gte(activityEfforts.recorded_at, cutoffDate),
        isNotNull(activityEfforts.activity_id),
      ),
    );

  return rows.map((row) => toBestEffort(publicActivityEffortsRowSchema.parse(row)));
}

function toBestEffort(row: z.infer<typeof publicActivityEffortsRowSchema>): BestEffort {
  return BestEffortSchema.parse({
    activity_category: row.activity_category,
    duration_seconds: row.duration_seconds,
    effort_type: row.effort_type,
    value: row.value,
    unit: row.unit,
    recorded_at: row.recorded_at.toISOString(),
  });
}

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

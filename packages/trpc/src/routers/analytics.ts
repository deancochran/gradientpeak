import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Analytics-specific schemas
const trainingLoadParamsSchema = z.object({
  period: z.number().min(1).max(365).default(30),
  projection: z.number().min(1).max(90).optional(),
  includeProjection: z.boolean().default(false),
});

const performanceTrendsParamsSchema = z.object({
  period: z.number().min(1).max(365).default(30),
  sport: z.string().optional(),
  metric: z.string().optional(),
});

export const analyticsRouter = createTRPCRouter({
  trainingLoad: protectedProcedure
    .input(trainingLoadParamsSchema)
    .query(async ({ ctx, input }) => {
      try {
        // Calculate training load from activities
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - input.period);

        const { data: activities, error } = await ctx.supabase
          .from("activities")
          .select("started_at, duration, tss, activity_type")
          .eq("profile_id", ctx.session.user.id)
          .gte("started_at", startDate.toISOString())
          .lte("started_at", endDate.toISOString())
          .order("started_at", { ascending: true });

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        // Calculate weekly training load
        const weeklyLoad = [];
        const currentWeek = new Date();

        for (let i = 0; i < Math.ceil(input.period / 7); i++) {
          const weekStart = new Date(currentWeek);
          weekStart.setDate(currentWeek.getDate() - (i * 7) - 6);
          const weekEnd = new Date(currentWeek);
          weekEnd.setDate(currentWeek.getDate() - (i * 7));

          const weekActivities = activities?.filter(activity => {
            const activityDate = new Date(activity.started_at);
            return activityDate >= weekStart && activityDate <= weekEnd;
          }) || [];

          const totalTSS = weekActivities.reduce((sum, activity) => sum + (activity.tss || 0), 0);
          const totalDuration = weekActivities.reduce((sum, activity) => sum + (activity.duration || 0), 0);

          weeklyLoad.push({
            week: `${weekStart.getFullYear()}-W${Math.ceil((weekStart.getTime() - new Date(weekStart.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`,
            tss: totalTSS,
            duration: totalDuration,
            activities: weekActivities.length,
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
          });
        }

        // Calculate moving averages
        const acuteLoad = weeklyLoad.slice(0, 1).reduce((sum, week) => sum + week.tss, 0); // Last week
        const chronicLoad = weeklyLoad.slice(0, 4).reduce((sum, week) => sum + week.tss, 0) / 4; // Last 4 weeks average
        const rampRate = chronicLoad > 0 ? acuteLoad / chronicLoad : 1;

        return {
          weeklyLoad: weeklyLoad.reverse(),
          summary: {
            acuteLoad,
            chronicLoad,
            rampRate,
            totalTSS: activities?.reduce((sum, a) => sum + (a.tss || 0), 0) || 0,
            totalActivities: activities?.length || 0,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to calculate training load",
        });
      }
    }),

  performanceTrends: protectedProcedure
    .input(performanceTrendsParamsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - input.period);

        let query = ctx.supabase
          .from("activities")
          .select("started_at, average_power, max_power, average_heart_rate, max_heart_rate, activity_type, duration")
          .eq("profile_id", ctx.session.user.id)
          .gte("started_at", startDate.toISOString())
          .lte("started_at", endDate.toISOString())
          .order("started_at", { ascending: true });

        if (input.sport) {
          query = query.eq("activity_type", input.sport);
        }

        const { data: activities, error } = await query;

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        // Group activities by week and calculate trends
        const weeklyTrends = [];
        const currentWeek = new Date();

        for (let i = 0; i < Math.ceil(input.period / 7); i++) {
          const weekStart = new Date(currentWeek);
          weekStart.setDate(currentWeek.getDate() - (i * 7) - 6);
          const weekEnd = new Date(currentWeek);
          weekEnd.setDate(currentWeek.getDate() - (i * 7));

          const weekActivities = activities?.filter(activity => {
            const activityDate = new Date(activity.started_at);
            return activityDate >= weekStart && activityDate <= weekEnd;
          }) || [];

          if (weekActivities.length > 0) {
            const avgPower = weekActivities.reduce((sum, a) => sum + (a.average_power || 0), 0) / weekActivities.length;
            const maxPower = Math.max(...weekActivities.map(a => a.max_power || 0));
            const avgHR = weekActivities.reduce((sum, a) => sum + (a.average_heart_rate || 0), 0) / weekActivities.length;
            const maxHR = Math.max(...weekActivities.map(a => a.max_heart_rate || 0));

            weeklyTrends.push({
              week: `${weekStart.getFullYear()}-W${Math.ceil((weekStart.getTime() - new Date(weekStart.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`,
              averagePower: avgPower,
              maxPower: maxPower,
              averageHeartRate: avgHR,
              maxHeartRate: maxHR,
              activities: weekActivities.length,
              weekStart: weekStart.toISOString(),
              weekEnd: weekEnd.toISOString(),
            });
          }
        }

        return {
          trends: weeklyTrends.reverse(),
          summary: {
            totalActivities: activities?.length || 0,
            avgPower: activities?.reduce((sum, a) => sum + (a.average_power || 0), 0) / (activities?.length || 1),
            avgHeartRate: activities?.reduce((sum, a) => sum + (a.average_heart_rate || 0), 0) / (activities?.length || 1),
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to calculate performance trends",
        });
      }
    }),
});

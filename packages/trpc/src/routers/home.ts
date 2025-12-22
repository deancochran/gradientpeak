import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { addEstimationToPlans } from "../utils/estimation-helpers";

const upcomingDaysSchema = z.object({
  days: z.number().min(1).max(7).default(4),
});

export const homeRouter = createTRPCRouter({
  /**
   * getDashboard - Optimized endpoint for home screen
   *
   * Returns minimal data needed for a simple MVP home screen:
   * - Today's activity (if any)
   * - Upcoming activities (next N days)
   * - Basic stats (last 30 days)
   * - Training plan existence check
   */
  getDashboard: protectedProcedure
    .input(upcomingDaysSchema.optional())
    .query(async ({ ctx, input }) => {
      const upcomingDays = input?.days || 4;
      const userId = ctx.session.user.id;

      // 1. Get training plan (lightweight check)
      const { data: plan } = await ctx.supabase
        .from("training_plans")
        .select("id, name, description")
        .eq("profile_id", userId)
        .maybeSingle();

      // 2. Get today's and upcoming activities in one query
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + upcomingDays);

      const { data: plannedActivities, error: activitiesError } =
        await ctx.supabase
          .from("planned_activities")
          .select(
            `
          id,
          scheduled_date,
          notes,
          activity_plan:activity_plans (*)
        `,
          )
          .eq("profile_id", userId)
          .gte("scheduled_date", today.toISOString())
          .lt("scheduled_date", futureDate.toISOString())
          .order("scheduled_date", { ascending: true });

      if (activitiesError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: activitiesError.message,
        });
      }

      // Add estimations to activity plans
      let activitiesWithEstimations = plannedActivities || [];
      if (activitiesWithEstimations.length > 0) {
        const plans = activitiesWithEstimations
          .map((pa) => pa.activity_plan)
          .filter(
            (p): p is NonNullable<typeof p> => p !== null && p !== undefined,
          );

        if (plans.length > 0) {
          const plansWithEstimation = await addEstimationToPlans(
            plans,
            ctx.supabase,
            userId,
          );

          // Map back to planned activities
          const plansMap = new Map(plansWithEstimation.map((p) => [p.id, p]));
          activitiesWithEstimations = activitiesWithEstimations.map((pa) => ({
            ...pa,
            activity_plan:
              pa.activity_plan && plansMap.get(pa.activity_plan.id)
                ? plansMap.get(pa.activity_plan.id)!
                : pa.activity_plan,
          }));
        }
      }

      // Separate today's activity from upcoming
      const todayStr = today.toISOString().split("T")[0];
      const todaysActivity = activitiesWithEstimations.find((pa) => {
        const activityDate = new Date(pa.scheduled_date);
        const activityDateStr = activityDate.toISOString().split("T")[0];
        return activityDateStr === todayStr;
      });

      const upcomingActivities = activitiesWithEstimations.filter((pa) => {
        const activityDate = new Date(pa.scheduled_date);
        const activityDateStr = activityDate.toISOString().split("T")[0];
        return activityDateStr !== todayStr;
      });

      // 3. Get basic stats for last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: activities, error: statsError } = await ctx.supabase
        .from("activities")
        .select("duration_seconds, distance_meters, metrics, type, started_at")
        .eq("profile_id", userId)
        .gte("started_at", thirtyDaysAgo.toISOString())
        .lte("started_at", new Date().toISOString());

      if (statsError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: statsError.message,
        });
      }

      // Calculate simple stats
      const totalActivities = activities?.length || 0;
      const totalDuration =
        activities?.reduce((sum, a) => sum + (a.duration_seconds || 0), 0) || 0;
      const totalDistance =
        activities?.reduce((sum, a) => sum + (a.distance_meters || 0), 0) || 0;
      const totalTSS =
        activities?.reduce((sum, a) => {
          const metrics = (a.metrics as Record<string, any>) || {};
          return sum + (metrics.tss || 0);
        }, 0) || 0;

      // Count unique days with activities
      const uniqueDays = new Set(
        activities?.map((a) => a.started_at.split("T")[0]) || [],
      ).size;

      return {
        plan: plan || null,
        todaysActivity: todaysActivity || null,
        upcomingActivities: upcomingActivities || [],
        stats: {
          totalActivities,
          totalDuration,
          totalDistance: totalDistance / 1000, // Convert to km
          totalTSS: Math.round(totalTSS),
          daysActive: uniqueDays,
          avgTSSPerDay: uniqueDays > 0 ? Math.round(totalTSS / uniqueDays) : 0,
        },
      };
    }),
});

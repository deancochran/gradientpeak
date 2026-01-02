import {
  calculateATL,
  calculateCTL,
  calculateTSB,
  getFormStatus,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { addEstimationToPlans } from "../utils/estimation-helpers";

const upcomingDaysSchema = z.object({
  days: z.number().min(1).max(14).default(7),
});

export const homeRouter = createTRPCRouter({
  /**
   * getDashboard - Optimized endpoint for home screen
   *
   * Consolidated endpoint providing:
   * - Active Plan Status
   * - Schedule (Next N days)
   * - Weekly Summary (Planned vs Actual)
   * - Fitness Trends (Last 42 days + Current Status)
   */
  getDashboard: protectedProcedure
    .input(upcomingDaysSchema.optional())
    .query(async ({ ctx, input }) => {
      const upcomingDays = input?.days || 7;
      const userId = ctx.session.user.id;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // --- 1. Fetch Active Plan ---
      const { data: plan } = await ctx.supabase
        .from("training_plans")
        .select("id, name, description, is_active, structure")
        .eq("profile_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      // Extract phase from structure if available
      const planPhase =
        (plan?.structure as any)?.periodization?.currentPhase || null;

      // --- 2. Calculate Dates ---
      // For trends: Need 42 days of history + 42 days buffer for CTL seeding
      const trendDays = 42;
      const seedDays = 42;
      const historyStart = new Date(today);
      historyStart.setDate(today.getDate() - (trendDays + seedDays));

      const chartStart = new Date(today);
      chartStart.setDate(today.getDate() - trendDays);

      // For schedule: Next N days
      const scheduleEnd = new Date(today);
      scheduleEnd.setDate(today.getDate() + upcomingDays);

      // For weekly summary: Current Week (Sun-Sat)
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // --- 3. Fetch Activities (Actual) ---
      // Fetching enough history for trends and current week stats
      const { data: activities, error: activitiesError } = await ctx.supabase
        .from("activities")
        .select(
          "id, started_at, duration_seconds, distance_meters, metrics, type",
        )
        .eq("profile_id", userId)
        .gte("started_at", historyStart.toISOString())
        .lte("started_at", today.toISOString()) // Up to now
        .order("started_at", { ascending: true });

      if (activitiesError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: activitiesError.message,
        });
      }

      // --- 4. Fetch Planned Activities (Future & Current Week) ---
      // We need planned activities for the Schedule (Future) AND for the Weekly Summary (Past days of this week)
      // So we fetch from startOfWeek to scheduleEnd
      const { data: plannedActivities, error: plannedError } =
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
          .gte("scheduled_date", startOfWeek.toISOString())
          .lt("scheduled_date", scheduleEnd.toISOString())
          .order("scheduled_date", { ascending: true });

      if (plannedError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: plannedError.message,
        });
      }

      // --- 5. Process Estimations for Planned Activities ---
      let activitiesWithEstimations = plannedActivities || [];
      if (activitiesWithEstimations.length > 0) {
        const plans = activitiesWithEstimations
          .map((pa) => pa.activity_plan)
          .filter((p): p is NonNullable<typeof p> => !!p);

        if (plans.length > 0) {
          const plansWithEstimation = await addEstimationToPlans(
            plans,
            ctx.supabase,
            userId,
          );
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

      // --- 6. Calculate Fitness Trends (CTL/ATL/TSB) ---
      const tssByDate = new Map<string, number>();
      activities?.forEach((a) => {
        if (!a.started_at) return;
        const dateStr = a.started_at.split("T")[0];
        const tss = (a.metrics as any)?.tss || 0;
        tssByDate.set(dateStr, (tssByDate.get(dateStr) || 0) + tss);
      });

      let currentCTL = 0;
      let currentATL = 0;
      const fitnessTrends = [];
      let todayStatus = { ctl: 0, atl: 0, tsb: 0, form: "fresh" };

      // Iterate day by day from historyStart
      const dayCount = Math.floor(
        (today.getTime() - historyStart.getTime()) / (1000 * 60 * 60 * 24),
      );

      for (let i = 0; i <= dayCount; i++) {
        const date = new Date(historyStart);
        date.setDate(historyStart.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];

        const tss = tssByDate.get(dateStr) || 0;
        currentCTL = calculateCTL(currentCTL, tss);
        currentATL = calculateATL(currentATL, tss);
        const tsb = calculateTSB(currentCTL, currentATL);

        // Only add to result if within chart range
        if (date >= chartStart) {
          fitnessTrends.push({
            date: dateStr,
            ctl: Math.round(currentCTL * 10) / 10,
            atl: Math.round(currentATL * 10) / 10,
            tsb: Math.round(tsb * 10) / 10,
          });
        }

        if (dateStr === today.toISOString().split("T")[0]) {
          todayStatus = {
            ctl: Math.round(currentCTL * 10) / 10,
            atl: Math.round(currentATL * 10) / 10,
            tsb: Math.round(tsb * 10) / 10,
            form: getFormStatus(tsb),
          };
        }
      }

      // --- 7. Calculate Consistency (Streak) ---
      // Iterate backwards from yesterday
      let streak = 0;
      const uniqueActivityDays = new Set(
        activities
          ?.filter((a) => a.started_at)
          .map((a) => a.started_at!.split("T")[0]),
      );
      // Check today
      if (uniqueActivityDays.has(today.toISOString().split("T")[0])) {
        streak++;
      }
      // Check previous days
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - 1);
      while (true) {
        if (uniqueActivityDays.has(checkDate.toISOString().split("T")[0])) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }

      // --- 8. Weekly Summary (Planned vs Actual) ---
      // Actuals
      const weeklyActuals =
        activities?.filter((a) => {
          const d = new Date(a.started_at);
          return d >= startOfWeek && d <= endOfWeek;
        }) || [];

      const weeklyActualStats = {
        distance:
          weeklyActuals.reduce((sum, a) => sum + (a.distance_meters || 0), 0) /
          1000, // km
        duration: weeklyActuals.reduce(
          (sum, a) => sum + (a.duration_seconds || 0),
          0,
        ),
        tss: Math.round(
          weeklyActuals.reduce(
            (sum, a) => sum + ((a.metrics as any)?.tss || 0),
            0,
          ),
        ),
        count: weeklyActuals.length,
      };

      // Planned
      const weeklyPlanned = activitiesWithEstimations.filter((pa) => {
        const d = new Date(pa.scheduled_date);
        return d >= startOfWeek && d <= endOfWeek;
      });

      const weeklyPlannedStats = {
        distance:
          weeklyPlanned.reduce(
            (sum, pa) =>
              sum + ((pa.activity_plan as any)?.estimated_distance || 0),
            0,
          ) / 1000,
        duration: weeklyPlanned.reduce(
          (sum, pa) =>
            sum + ((pa.activity_plan as any)?.estimated_duration || 0),
          0,
        ),
        tss: Math.round(
          weeklyPlanned.reduce(
            (sum, pa) => sum + ((pa.activity_plan as any)?.estimated_tss || 0),
            0,
          ),
        ),
        count: weeklyPlanned.length,
      };

      // --- 9. Schedule (Future) ---
      const todayStr = today.toISOString().split("T")[0];

      // Check which planned activities have been completed by matching with actual activities
      const completedActivityMap = new Map<string, boolean>();
      plannedActivities?.forEach((pa) => {
        if (!pa.scheduled_date) return;
        const paDate = pa.scheduled_date.split("T")[0];
        const hasActivity = activities?.some(
          (a) => a.started_at && a.started_at.split("T")[0] === paDate,
        );
        if (hasActivity) {
          completedActivityMap.set(pa.id, true);
        }
      });

      const schedule = activitiesWithEstimations
        .filter((pa) => {
          const d = new Date(pa.scheduled_date);
          // Include today + future
          return d >= today && d < scheduleEnd;
        })
        .map((pa) => ({
          id: pa.id,
          date: pa.scheduled_date,
          isToday: pa.scheduled_date.startsWith(todayStr),
          isCompleted: completedActivityMap.get(pa.id) || false,
          activityName: pa.activity_plan?.name || "Activity",
          activityType: pa.activity_plan?.activity_category || "generic",
          estimatedDuration: (pa.activity_plan as any)?.estimated_duration || 0,
          estimatedDistance: (pa.activity_plan as any)?.estimated_distance || 0,
          estimatedTSS: (pa.activity_plan as any)?.estimated_tss || 0,
        }));

      const todaysActivity = schedule.find((s) => s.isToday) || null;

      // --- 10. Calculate Projected Fitness (Future CTL based on plan) ---
      const projectionDays = 42; // Project 42 days into future
      const projectionEnd = new Date(today);
      projectionEnd.setDate(today.getDate() + projectionDays);

      // Fetch future planned activities for projection
      const { data: futureActivities } = await ctx.supabase
        .from("planned_activities")
        .select(
          `
          id,
          scheduled_date,
          activity_plan:activity_plans (*)
        `,
        )
        .eq("profile_id", userId)
        .gte("scheduled_date", today.toISOString())
        .lt("scheduled_date", projectionEnd.toISOString())
        .order("scheduled_date", { ascending: true });

      const projectedFitness = [];
      let projectedCTL = currentCTL;
      let projectedATL = currentATL;

      // Process future activities with estimations
      let futureWithEstimations = futureActivities || [];
      if (futureWithEstimations.length > 0) {
        const futurePlans = futureWithEstimations
          .map((pa) => pa.activity_plan)
          .filter((p): p is NonNullable<typeof p> => !!p);

        if (futurePlans.length > 0) {
          const futurePlansWithEstimation = await addEstimationToPlans(
            futurePlans,
            ctx.supabase,
            userId,
          );
          const futurePlansMap = new Map(
            futurePlansWithEstimation.map((p) => [p.id, p]),
          );

          futureWithEstimations = futureWithEstimations.map((pa) => ({
            ...pa,
            activity_plan:
              pa.activity_plan && futurePlansMap.get(pa.activity_plan.id)
                ? futurePlansMap.get(pa.activity_plan.id)!
                : pa.activity_plan,
          }));
        }
      }

      // Create map of future TSS by date
      const futureTssByDate = new Map<string, number>();
      futureWithEstimations.forEach((pa) => {
        if (!pa.scheduled_date) return;
        const dateStr = pa.scheduled_date.split("T")[0];
        const tss = (pa.activity_plan as any)?.estimated_tss || 0;
        futureTssByDate.set(dateStr, (futureTssByDate.get(dateStr) || 0) + tss);
      });

      // Project CTL forward
      for (let i = 1; i <= projectionDays; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];

        const plannedTss = futureTssByDate.get(dateStr) || 0;
        projectedCTL = calculateCTL(projectedCTL, plannedTss);
        projectedATL = calculateATL(projectedATL, plannedTss);
        const projectedTsb = calculateTSB(projectedCTL, projectedATL);

        projectedFitness.push({
          date: dateStr,
          ctl: Math.round(projectedCTL * 10) / 10,
          atl: Math.round(projectedATL * 10) / 10,
          tsb: Math.round(projectedTsb * 10) / 10,
          plannedTss,
        });
      }

      // --- 11. Calculate Ideal CTL Curve from Training Plan ---
      // This creates the "where you should be" line based on periodization
      const idealFitnessCurve = [];
      let goalMetrics = null;

      if (plan && plan.structure) {
        const structure = plan.structure as any;
        const periodization = structure.periodization_template;

        if (periodization) {
          // Extract periodization parameters
          const startingCTL = periodization.starting_ctl || currentCTL;
          const targetCTL = periodization.target_ctl;
          const rampRate = periodization.ramp_rate || 0.05; // Default 5% weekly increase
          const targetDateStr = periodization.target_date;

          if (targetCTL && targetDateStr) {
            const targetDate = new Date(targetDateStr);

            // Set goal metrics for display
            goalMetrics = {
              targetCTL,
              targetDate: targetDateStr,
              description: `Target ${targetCTL} CTL by ${targetDate.toLocaleDateString()}`,
            };

            // Calculate the ideal curve from chart start to target date
            // This shows where user should be at each point in time
            const curveStart =
              chartStart < new Date() ? chartStart : new Date();
            const daysToTarget = Math.floor(
              (targetDate.getTime() - curveStart.getTime()) /
                (1000 * 60 * 60 * 24),
            );

            if (daysToTarget > 0) {
              let idealCTL = startingCTL;

              for (
                let i = 0;
                i <= daysToTarget && i <= trendDays + projectionDays;
                i++
              ) {
                const date = new Date(curveStart);
                date.setDate(curveStart.getDate() + i);
                const dateStr = date.toISOString().split("T")[0];

                // Calculate ideal CTL progression using exponential growth
                // CTL should increase by rampRate per week
                const weeksPassed = i / 7;
                idealCTL = startingCTL * Math.pow(1 + rampRate, weeksPassed);

                // Cap at target CTL
                if (idealCTL > targetCTL) {
                  idealCTL = targetCTL;
                }

                // Only add points that are in our display range
                const dateObj = new Date(dateStr);
                if (dateObj >= chartStart) {
                  idealFitnessCurve.push({
                    date: dateStr,
                    ctl: Math.round(idealCTL * 10) / 10,
                  });
                }
              }
            }
          }
        }

        // Check for legacy goal structure
        if (!goalMetrics && structure.goal) {
          goalMetrics = {
            targetCTL: structure.goal.targetCTL || null,
            targetDate: structure.goal.targetDate || null,
            description: structure.goal.description || null,
          };
        }
      }

      // --- 12. Calculate Plan Adherence ---
      const adherence =
        weeklyPlannedStats.tss > 0
          ? Math.round((weeklyActualStats.tss / weeklyPlannedStats.tss) * 100)
          : null;

      return {
        activePlan: plan
          ? {
              id: plan.id,
              name: plan.name,
              phase: planPhase,
            }
          : null,
        currentStatus: todayStatus,
        consistency: {
          streak,
          weeklyCount: weeklyActualStats.count,
        },
        weeklySummary: {
          actual: weeklyActualStats,
          planned: weeklyPlannedStats,
          adherence, // Percentage
        },
        schedule, // List of upcoming (including today)
        trends: fitnessTrends, // Historical actual CTL/ATL/TSB
        projectedFitness, // Future projected CTL/ATL/TSB based on plan
        idealFitnessCurve, // Ideal CTL progression from training plan periodization
        goalMetrics, // User's fitness goal
        todaysActivity, // Convenience field
      };
    }),
});

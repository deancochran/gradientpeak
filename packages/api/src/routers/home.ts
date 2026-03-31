import { calculateAge, calculateRollingTrainingQuality, getFormStatus } from "@repo/core";
import { buildDailyTssByDateSeries, replayTrainingLoadByDate } from "@repo/core/load";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { buildDynamicStressSeries } from "../lib/activity-analysis";
import { featureFlags } from "../lib/features";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { addEstimationToPlans } from "../utils/estimation-helpers";
import { buildWorkloadEnvelopes } from "../utils/workload";

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

      const { data: profile, error: profileError } = await ctx.supabase
        .from("profiles")
        .select("dob, gender")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: profileError.message,
        });
      }

      const userAge = calculateAge(profile?.dob ?? null);
      const userGender =
        profile?.gender === "male" || profile?.gender === "female" ? profile.gender : null;
      const effectiveAge = featureFlags.personalizationAgeConstants ? userAge : undefined;
      const effectiveGender = featureFlags.personalizationGenderAdjustment ? userGender : undefined;

      // --- 1. Fetch Active Plan & Settings ---
      const [
        { data: nextPlannedEvent, error: nextPlannedEventError },
        { data: profileSettingsData },
      ] = await Promise.all([
        ctx.supabase
          .from("events")
          .select("training_plan_id, starts_at")
          .eq("profile_id", userId)
          .eq("event_type", "planned_activity")
          .not("training_plan_id", "is", null)
          .gte("starts_at", today.toISOString())
          .order("starts_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        ctx.supabase
          .from("profile_training_settings")
          .select("settings")
          .eq("profile_id", userId)
          .maybeSingle(),
      ]);

      if (nextPlannedEventError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: nextPlannedEventError.message,
        });
      }

      let plan: {
        id: string;
        name: string;
        description: string | null;
        structure: unknown;
      } | null = null;

      if (nextPlannedEvent?.training_plan_id) {
        const { data: activePlan, error: activePlanError } = await ctx.supabase
          .from("training_plans")
          .select("id, name, description, structure")
          .eq("id", nextPlannedEvent.training_plan_id)
          .or(`profile_id.eq.${userId},is_system_template.eq.true,template_visibility.eq.public`)
          .maybeSingle();

        if (activePlanError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: activePlanError.message,
          });
        }

        plan = activePlan;
      }

      const planStructure = (plan?.structure as any) ?? null;

      // Extract phase from structure if available
      const planPhase = planStructure?.periodization?.currentPhase ?? null;

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
        .select("*")
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

      const { byActivityId: derivedActivityMap, byDate: tssByDate } =
        await buildDynamicStressSeries({
          supabase: ctx.supabase,
          profileId: userId,
          activities: activities || [],
        });

      const rollingTrainingQuality =
        featureFlags.personalizationTrainingQuality && activities
          ? calculateRollingTrainingQuality(
              activities.map((activity: any) => ({
                started_at: activity.started_at,
                tss: derivedActivityMap.get(activity.id)?.tss ?? null,
                intensity_factor: derivedActivityMap.get(activity.id)?.intensity_factor ?? null,
              })),
            )
          : undefined;

      // --- 4. Fetch Planned Activities (Future & Current Week) ---
      // We need planned activities for the Schedule (Future) AND for the Weekly Summary (Past days of this week)
      // So we fetch from startOfWeek to scheduleEnd
      const { data: plannedActivitiesRaw, error: plannedError } = await ctx.supabase
        .from("events")
        .select(
          `
          id,
          starts_at,
          notes,
          activity_plan:activity_plans (*)
        `,
        )
        .eq("profile_id", userId)
        .eq("event_type", "planned_activity")
        .gte("starts_at", startOfWeek.toISOString())
        .lt("starts_at", scheduleEnd.toISOString())
        .order("starts_at", { ascending: true });

      if (plannedError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: plannedError.message,
        });
      }

      const plannedActivities = (plannedActivitiesRaw || []).map((planned: any) => ({
        ...planned,
        scheduled_date: planned.starts_at?.split("T")[0] ?? "",
      }));

      // --- 5. Process Estimations for Planned Activities ---
      let activitiesWithEstimations = plannedActivities || [];
      if (activitiesWithEstimations.length > 0) {
        const plans = activitiesWithEstimations
          .map((pa: any) => pa.activity_plan)
          .filter((p): p is NonNullable<typeof p> => !!p);

        if (plans.length > 0) {
          const plansWithEstimation = await addEstimationToPlans(plans, ctx.supabase, userId);
          const plansMap = new Map(plansWithEstimation.map((p: any) => [p.id, p]));

          activitiesWithEstimations = activitiesWithEstimations.map((pa: any) => ({
            ...pa,
            activity_plan:
              pa.activity_plan && plansMap.get(pa.activity_plan.id)
                ? (plansMap.get(pa.activity_plan.id)! as unknown as typeof pa.activity_plan)
                : pa.activity_plan,
          }));
        }
      }

      // --- 6. Calculate Fitness Trends (CTL/ATL/TSB) ---
      const fitnessTrends = [];
      let todayStatus = { ctl: 0, atl: 0, tsb: 0, form: "fresh" };

      // Apply Global CTL Override if enabled
      const settings = profileSettingsData?.settings as any;
      const baselineFitness = settings?.baseline_fitness;
      let effectiveHistoryStart = historyStart;
      let initialCTL = 0;
      let initialATL = 0;

      if (baselineFitness?.is_enabled && baselineFitness.override_date) {
        const overrideDate = new Date(baselineFitness.override_date);
        if (!Number.isNaN(overrideDate.getTime())) {
          initialCTL = baselineFitness.override_ctl ?? 0;
          initialATL = baselineFitness.override_atl ?? 0;

          // If the override date is before our history start, we need to decay it up to history start
          if (overrideDate < historyStart) {
            const decayEnd = new Date(historyStart);
            decayEnd.setDate(historyStart.getDate() - 1);
            if (decayEnd >= overrideDate) {
              const decayed = replayTrainingLoadByDate({
                dailyTss: buildDailyTssByDateSeries({
                  startDate: overrideDate.toISOString().split("T")[0]!,
                  endDate: decayEnd.toISOString().split("T")[0]!,
                  tssByDate: {},
                }),
                initialCTL,
                initialATL,
                userAge: effectiveAge,
                userGender: effectiveGender,
                trainingQuality: rollingTrainingQuality,
              });
              const lastDecayPoint = decayed.at(-1);
              if (lastDecayPoint) {
                initialCTL = lastDecayPoint.ctl;
                initialATL = lastDecayPoint.atl;
              }
            }
          } else if (overrideDate > historyStart && overrideDate <= today) {
            // If the override date is within our window, we start calculating from the override date
            effectiveHistoryStart = new Date(overrideDate);
            // Clear any TSS before the override date to avoid double counting
            for (const [dateStr] of tssByDate.entries()) {
              if (new Date(dateStr) < overrideDate) {
                tssByDate.delete(dateStr);
              }
            }
          }
        }
      }

      const historicalReplay = replayTrainingLoadByDate({
        dailyTss: buildDailyTssByDateSeries({
          startDate: effectiveHistoryStart.toISOString().split("T")[0]!,
          endDate: today.toISOString().split("T")[0]!,
          tssByDate,
        }),
        initialCTL,
        initialATL,
        userAge: effectiveAge,
        userGender: effectiveGender,
        trainingQuality: rollingTrainingQuality,
      });

      for (const point of historicalReplay) {
        const date = new Date(`${point.date}T00:00:00.000Z`);
        if (date >= chartStart) {
          fitnessTrends.push({
            date: point.date,
            ctl: Math.round(point.ctl * 10) / 10,
            atl: Math.round(point.atl * 10) / 10,
            tsb: Math.round(point.tsb * 10) / 10,
          });
        }

        if (point.date === today.toISOString().split("T")[0]) {
          todayStatus = {
            ctl: Math.round(point.ctl * 10) / 10,
            atl: Math.round(point.atl * 10) / 10,
            tsb: Math.round(point.tsb * 10) / 10,
            form: getFormStatus(point.tsb),
          };
        }
      }

      const latestHistoricalLoad = historicalReplay.at(-1);
      const currentCTL = latestHistoricalLoad?.ctl ?? initialCTL;
      const currentATL = latestHistoricalLoad?.atl ?? initialATL;

      // --- 7. Calculate Consistency (Streak) ---
      // Iterate backwards from yesterday
      let streak = 0;
      const uniqueActivityDays = new Set(
        activities?.filter((a: any) => a.started_at).map((a: any) => a.started_at!.split("T")[0]),
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
        activities?.filter((a: any) => {
          const d = new Date(a.started_at);
          return d >= startOfWeek && d <= endOfWeek;
        }) || [];

      const weeklyActualStats = {
        distance:
          weeklyActuals.reduce((sum: any, a: any) => sum + (a.distance_meters || 0), 0) / 1000, // km
        duration: weeklyActuals.reduce((sum: any, a: any) => sum + (a.duration_seconds || 0), 0),
        tss: Math.round(
          weeklyActuals.reduce(
            (sum: any, a: any) => sum + (derivedActivityMap.get(a.id)?.tss || 0),
            0,
          ),
        ),
        count: weeklyActuals.length,
      };

      // Planned
      const weeklyPlanned = activitiesWithEstimations.filter((pa: any) => {
        const d = new Date(pa.scheduled_date);
        return d >= startOfWeek && d <= endOfWeek;
      });

      const weeklyPlannedStats = {
        distance:
          weeklyPlanned.reduce(
            (sum, pa) => sum + ((pa.activity_plan as any)?.estimated_distance || 0),
            0,
          ) / 1000,
        duration: weeklyPlanned.reduce(
          (sum, pa) => sum + ((pa.activity_plan as any)?.estimated_duration || 0),
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

      // --- 9. Current Workload Envelopes (ACWR/Monotony) ---
      const workloadWindowStart = new Date(today);
      workloadWindowStart.setDate(today.getDate() - 27);
      const workload = buildWorkloadEnvelopes(
        (activities || []).map((activity: any) => ({
          started_at: activity.started_at,
          tss: derivedActivityMap.get(activity.id)?.tss ?? null,
        })),
        workloadWindowStart,
        today,
      );

      // --- 10. Schedule (Future) ---
      const todayStr = today.toISOString().split("T")[0]!;

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
        .filter((pa: any) => {
          const d = new Date(pa.scheduled_date);
          // Include today + future
          return d >= today && d < scheduleEnd;
        })
        .map((pa: any) => ({
          id: pa.id,
          date: pa.scheduled_date,
          isToday: pa.scheduled_date?.startsWith(todayStr) || false,
          isCompleted: completedActivityMap.get(pa.id) || false,
          activityName: pa.activity_plan?.name || "Activity",
          activityType: pa.activity_plan?.activity_category || "generic",
          estimatedDuration: (pa.activity_plan as any)?.estimated_duration || 0,
          estimatedDistance: (pa.activity_plan as any)?.estimated_distance || 0,
          estimatedTSS: (pa.activity_plan as any)?.estimated_tss || 0,
        }));

      const todaysActivity = schedule.find((s) => s.isToday) || null;

      // --- 11. Calculate Projected Fitness (Future CTL based on plan) ---
      const projectionDays = 42; // Project 42 days into future
      const projectionEnd = new Date(today);
      projectionEnd.setDate(today.getDate() + projectionDays);

      // Fetch future planned activities for projection
      const { data: futureActivitiesRaw } = await ctx.supabase
        .from("events")
        .select(
          `
          id,
          starts_at,
          activity_plan:activity_plans (*)
        `,
        )
        .eq("profile_id", userId)
        .eq("event_type", "planned_activity")
        .gte("starts_at", today.toISOString())
        .lt("starts_at", projectionEnd.toISOString())
        .order("starts_at", { ascending: true });

      const futureActivities = (futureActivitiesRaw || []).map((planned: any) => ({
        ...planned,
        scheduled_date: planned.starts_at?.split("T")[0] ?? "",
      }));

      const projectedFitness = [];

      // Process future activities with estimations
      let futureWithEstimations = futureActivities || [];
      if (futureWithEstimations.length > 0) {
        const futurePlans = futureWithEstimations
          .map((pa: any) => pa.activity_plan)
          .filter((p): p is NonNullable<typeof p> => !!p);

        if (futurePlans.length > 0) {
          const futurePlansWithEstimation = await addEstimationToPlans(
            futurePlans,
            ctx.supabase,
            userId,
          );
          const futurePlansMap = new Map(futurePlansWithEstimation.map((p: any) => [p.id, p]));

          futureWithEstimations = futureWithEstimations.map((pa: any) => ({
            ...pa,
            activity_plan:
              pa.activity_plan && futurePlansMap.get(pa.activity_plan.id)
                ? (futurePlansMap.get(pa.activity_plan.id)! as unknown as typeof pa.activity_plan)
                : pa.activity_plan,
          }));
        }
      }

      // Create map of future TSS by date
      const futureTssByDate = new Map<string, number>();
      futureWithEstimations.forEach((pa) => {
        if (!pa.scheduled_date) return;
        const dateStr = pa.scheduled_date.split("T")[0]!; // Non-null assertion after check
        const tss = (pa.activity_plan as any)?.estimated_tss || 0;
        futureTssByDate.set(dateStr, (futureTssByDate.get(dateStr) || 0) + tss);
      });

      const projectionReplay = replayTrainingLoadByDate({
        dailyTss: buildDailyTssByDateSeries({
          startDate: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]!,
          endDate: projectionEnd.toISOString().split("T")[0]!,
          tssByDate: futureTssByDate,
        }),
        initialCTL: currentCTL,
        initialATL: currentATL,
        userAge: effectiveAge,
        userGender: effectiveGender,
        trainingQuality: rollingTrainingQuality,
      });

      for (const point of projectionReplay) {
        projectedFitness.push({
          date: point.date,
          ctl: Math.round(point.ctl * 10) / 10,
          atl: Math.round(point.atl * 10) / 10,
          tsb: Math.round(point.tsb * 10) / 10,
          plannedTss: point.tss,
        });
      }

      // --- 12. Calculate Ideal CTL Curve from Training Plan ---
      // This creates the "where you should be" line based on periodization
      const idealFitnessCurve = [];
      let goalMetrics = null;

      if (planStructure) {
        const structure = planStructure;
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
            const curveStart = chartStart < new Date() ? chartStart : new Date();
            const daysToTarget = Math.floor(
              (targetDate.getTime() - curveStart.getTime()) / (1000 * 60 * 60 * 24),
            );

            if (daysToTarget > 0) {
              let idealCTL = startingCTL;

              for (let i = 0; i <= daysToTarget && i <= trendDays + projectionDays; i++) {
                const date = new Date(curveStart);
                date.setDate(curveStart.getDate() + i);
                const dateStr = date.toISOString().split("T")[0]!;

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

      // --- 13. Calculate Plan Adherence ---
      const adherence =
        weeklyPlannedStats.tss > 0
          ? Math.round((weeklyActualStats.tss / weeklyPlannedStats.tss) * 100)
          : null;

      let firstTargetType = undefined;
      if (
        planStructure &&
        planStructure.goals &&
        planStructure.goals[0] &&
        planStructure.goals[0].targets &&
        planStructure.goals[0].targets[0]
      ) {
        firstTargetType = planStructure.goals[0].targets[0].target_type;
      }

      return {
        activePlan: plan
          ? {
              id: plan.id,
              name: plan.name || "Active Plan",
              phase: planPhase,
              targetType: firstTargetType,
            }
          : null,
        currentStatus: todayStatus,
        workload,
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
        personalizationTelemetry: {
          flags: {
            age_constants: featureFlags.personalizationAgeConstants,
            gender_adjustment: featureFlags.personalizationGenderAdjustment,
            training_quality: featureFlags.personalizationTrainingQuality,
            ramp_learning: featureFlags.personalizationRampLearning,
          },
          user_age: effectiveAge ?? null,
          user_gender: effectiveGender ?? null,
          training_quality: rollingTrainingQuality ?? null,
        },
      };
    }),
});

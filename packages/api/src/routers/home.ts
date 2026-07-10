import { calculateAge, calculateRollingTrainingQuality, getFormStatus } from "@repo/core";
import { buildDailyTssByDateSeries, replayTrainingLoadByDate } from "@repo/core/load";
import { type ProfileTrainingSettingsRow, schema, type TrainingPlanRow } from "@repo/db";
import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { listActivitySummariesInRange } from "../application/home/activitySummaries";
import { loadPlannedActivitiesWithEstimations } from "../application/home/plannedActivities";
import { getRequiredDb } from "../db";
import {
  createActivityAnalysisStore,
  createEventReadRepository,
} from "../infrastructure/repositories";
import { buildDynamicStressSeries } from "../lib/activity-analysis";
import { featureFlags } from "../lib/features";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { buildWorkloadEnvelopes } from "../utils/workload";

const upcomingDaysSchema = z.object({
  days: z.number().min(1).max(14).default(7),
});

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const profileTrainingSettingsRowSchema = z
  .object({
    settings: z.unknown(),
  })
  .strict();

const dashboardTrainingPlanRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    structure: z.unknown(),
  })
  .strict();

const nextPlannedEventRowSchema = z
  .object({
    training_plan_id: z.string().nullable(),
    starts_at: z.date(),
  })
  .strict();

const profileRowSchema = z
  .object({
    dob: z.date().nullable().optional(),
    gender: z.enum(["male", "female"]).nullable().optional(),
  })
  .strict();

const planStructureSchema = z
  .object({
    periodization: z
      .object({
        currentPhase: z.string().nullable().optional(),
      })
      .partial()
      .optional(),
    periodization_template: z
      .object({
        starting_ctl: z.number().nullable().optional(),
        target_ctl: z.number().nullable().optional(),
        ramp_rate: z.number().nullable().optional(),
        target_date: z.string().nullable().optional(),
      })
      .partial()
      .optional(),
    goals: z
      .array(
        z
          .object({
            targets: z
              .array(
                z
                  .object({
                    target_type: z.string().nullable().optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
    goal: z
      .object({
        targetCTL: z.number().nullable().optional(),
        targetDate: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const workloadEnvelopeSchema = z
  .object({
    value: z.number().nullable().optional(),
    source: z.string().optional(),
    status: z.string().optional(),
    coverageDays: z.number().optional(),
    requiredDays: z.number().optional(),
    reasonCode: z.string().optional(),
    current: z.number().optional(),
    previous: z.number().optional(),
  })
  .strict();

const scheduleItemSchema = z
  .object({
    id: z.string(),
    date: isoDateSchema,
    isToday: z.boolean(),
    isCompleted: z.boolean(),
    activityName: z.string(),
    activityType: z.string(),
    estimatedDuration: z.number(),
    estimatedDistance: z.number(),
    estimatedTSS: z.number(),
  })
  .strict();

const dashboardResponseSchema = z
  .object({
    activePlan: z
      .object({
        id: z.string(),
        name: z.string(),
        phase: z.string().nullable(),
        targetType: z.string().nullable().optional(),
      })
      .strict()
      .nullable(),
    currentStatus: z
      .object({
        ctl: z.number(),
        atl: z.number(),
        tsb: z.number(),
        form: z.string(),
      })
      .strict(),
    workload: z
      .object({
        acwr: workloadEnvelopeSchema,
        monotony: workloadEnvelopeSchema,
      })
      .catchall(workloadEnvelopeSchema),
    consistency: z
      .object({
        streak: z.number(),
        weeklyCount: z.number(),
      })
      .strict(),
    weeklySummary: z
      .object({
        actual: z
          .object({
            distance: z.number(),
            duration: z.number(),
            tss: z.number(),
            count: z.number(),
          })
          .strict(),
        planned: z
          .object({
            distance: z.number(),
            duration: z.number(),
            tss: z.number(),
            count: z.number(),
          })
          .strict(),
        adherence: z.number().nullable(),
      })
      .strict(),
    schedule: z.array(scheduleItemSchema),
    trends: z.array(
      z
        .object({
          date: isoDateSchema,
          ctl: z.number(),
          atl: z.number(),
          tsb: z.number(),
        })
        .strict(),
    ),
    projectedFitness: z.array(
      z
        .object({
          date: isoDateSchema,
          ctl: z.number(),
          atl: z.number(),
          tsb: z.number(),
          plannedTss: z.number(),
        })
        .strict(),
    ),
    idealFitnessCurve: z.array(
      z
        .object({
          date: isoDateSchema,
          ctl: z.number(),
        })
        .strict(),
    ),
    goalMetrics: z
      .object({
        targetCTL: z.number().nullable(),
        targetDate: z.string().nullable(),
        description: z.string().nullable(),
      })
      .strict()
      .nullable(),
    todaysActivity: scheduleItemSchema.nullable(),
    personalizationTelemetry: z
      .object({
        flags: z
          .object({
            age_constants: z.boolean(),
            gender_adjustment: z.boolean(),
            training_quality: z.boolean(),
            ramp_learning: z.boolean(),
          })
          .strict(),
        user_age: z.number().nullable(),
        user_gender: z.enum(["male", "female"]).nullable(),
        training_quality: z.number().nullable(),
      })
      .strict(),
  })
  .strict();

type DashboardTrainingPlanRow = Pick<TrainingPlanRow, "id" | "name" | "description" | "structure">;

type ProfileTrainingSettingsSqlRow = Pick<ProfileTrainingSettingsRow, "settings">;

async function getProfileTrainingSettings(db: ReturnType<typeof getRequiredDb>, profileId: string) {
  const result = await db.execute(sql<ProfileTrainingSettingsSqlRow>`
    select settings
    from profile_training_settings
    where profile_id = ${profileId}
    limit 1
  `);

  const row = ((result as unknown as { rows: unknown[] }).rows ?? [])[0];
  return row ? profileTrainingSettingsRowSchema.parse(row) : null;
}

async function getAccessibleTrainingPlan(
  db: ReturnType<typeof getRequiredDb>,
  input: { planId: string; profileId: string },
): Promise<DashboardTrainingPlanRow | null> {
  const result = await db.execute(sql<DashboardTrainingPlanRow>`
    select id, name, description, structure
    from training_plans
    where id = ${input.planId}
      and (
        profile_id = ${input.profileId}
        or is_system_template = true
        or template_visibility = 'public'
      )
    limit 1
  `);

  const row = ((result as unknown as { rows: unknown[] }).rows ?? [])[0];
  return row ? dashboardTrainingPlanRowSchema.parse(row) : null;
}

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
      const db = getRequiredDb(ctx);
      const estimationStore = createEventReadRepository(db);
      const userId = ctx.session.user.id;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [rawProfile] = await db
        .select({ dob: schema.profiles.dob, gender: schema.profiles.gender })
        .from(schema.profiles)
        .where(eq(schema.profiles.id, userId))
        .limit(1);

      const profile = rawProfile ? profileRowSchema.parse(rawProfile) : null;

      const userAge = calculateAge(profile?.dob?.toISOString() ?? null);
      const userGender =
        profile?.gender === "male" || profile?.gender === "female" ? profile.gender : null;
      const effectiveAge = featureFlags.personalizationAgeConstants ? userAge : undefined;
      const effectiveGender = featureFlags.personalizationGenderAdjustment ? userGender : undefined;

      // --- 1. Fetch Active Plan & Settings ---
      const [rawNextPlannedEvent, profileSettingsData] = await Promise.all([
        db
          .select({
            training_plan_id: schema.eventScheduleLinks.training_plan_id,
            starts_at: schema.events.starts_at,
          })
          .from(schema.events)
          .innerJoin(
            schema.eventScheduleLinks,
            eq(schema.eventScheduleLinks.event_id, schema.events.id),
          )
          .where(
            and(
              eq(schema.events.profile_id, userId),
              eq(schema.events.event_type, "planned_activity"),
              gte(schema.events.starts_at, today),
              isNotNull(schema.eventScheduleLinks.training_plan_id),
            ),
          )
          .orderBy(asc(schema.events.starts_at))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        getProfileTrainingSettings(db, userId),
      ]);

      const nextPlannedEvent = rawNextPlannedEvent
        ? nextPlannedEventRowSchema.parse(rawNextPlannedEvent)
        : null;

      let plan: {
        id: string;
        name: string;
        description: string | null;
        structure: unknown;
      } | null = null;

      if (nextPlannedEvent?.training_plan_id) {
        plan = await getAccessibleTrainingPlan(db, {
          planId: nextPlannedEvent.training_plan_id,
          profileId: userId,
        });
      }

      const planStructure = plan?.structure ? planStructureSchema.parse(plan.structure) : null;

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
      const activities = await listActivitySummariesInRange(db, {
        profileId: userId,
        startedAtGte: historyStart,
        startedAtLte: today,
      });

      const { byActivityId: derivedActivityMap, byDate: tssByDate } =
        await buildDynamicStressSeries({
          store: createActivityAnalysisStore(db),
          profileId: userId,
          activities,
        });

      const rollingTrainingQuality =
        featureFlags.personalizationTrainingQuality && activities.length > 0
          ? calculateRollingTrainingQuality(
              activities.map((activity) => ({
                started_at: activity.started_at.toISOString(),
                tss: derivedActivityMap.get(activity.id)?.tss ?? null,
                intensity_factor: derivedActivityMap.get(activity.id)?.intensity_factor ?? null,
              })),
            )
          : undefined;

      // --- 4. Fetch Planned Activities (Future & Current Week) ---
      // We need planned activities for the Schedule (Future) AND for the Weekly Summary (Past days of this week)
      // So we fetch from startOfWeek to scheduleEnd
      const { plannedActivities, activitiesWithEstimations } =
        await loadPlannedActivitiesWithEstimations(db, {
          estimationStore,
          profileId: userId,
          startsAtGte: startOfWeek,
          startsAtLt: scheduleEnd,
        });

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
        activities
          .map((activity) => activity.started_at.toISOString().split("T")[0])
          .filter(Boolean),
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
      const weeklyActuals = activities.filter((activity) => {
        const d = new Date(activity.started_at);
        return d >= startOfWeek && d <= endOfWeek;
      });

      const weeklyActualStats = {
        distance:
          weeklyActuals.reduce((sum, activity) => sum + (activity.distance_meters || 0), 0) / 1000,
        duration: weeklyActuals.reduce(
          (sum, activity) => sum + (activity.duration_seconds || 0),
          0,
        ),
        tss: Math.round(
          weeklyActuals.reduce(
            (sum, activity) => sum + (derivedActivityMap.get(activity.id)?.tss || 0),
            0,
          ),
        ),
        count: weeklyActuals.length,
      };

      // Planned
      const startOfWeekStr = startOfWeek.toISOString().split("T")[0]!;
      const endOfWeekStr = endOfWeek.toISOString().split("T")[0]!;

      const weeklyPlanned = activitiesWithEstimations.filter((pa: any) => {
        const scheduledDate = pa.scheduled_date?.split("T")[0];
        if (!scheduledDate) return false;

        return scheduledDate >= startOfWeekStr && scheduledDate <= endOfWeekStr;
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
        activities.map((activity) => ({
          started_at: activity.started_at.toISOString(),
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
        const hasActivity = activities.some(
          (activity) => activity.started_at.toISOString().split("T")[0] === paDate,
        );
        if (hasActivity) {
          completedActivityMap.set(pa.id, true);
        }
      });

      const scheduleEndStr = scheduleEnd.toISOString().split("T")[0]!;

      const schedule = activitiesWithEstimations
        .filter((pa: any) => {
          const scheduledDate = pa.scheduled_date?.split("T")[0];
          if (!scheduledDate) return false;

          // Include today + future using stable date-only comparisons.
          return scheduledDate >= todayStr && scheduledDate < scheduleEndStr;
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
      const { activitiesWithEstimations: futureWithEstimations } =
        await loadPlannedActivitiesWithEstimations(db, {
          estimationStore,
          profileId: userId,
          startsAtGte: today,
          startsAtLt: projectionEnd,
        });

      const projectedFitness = [];

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
                idealCTL = startingCTL * (1 + rampRate) ** weeksPassed;

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

      let firstTargetType;
      if (planStructure?.goals?.[0]?.targets?.[0]) {
        firstTargetType = planStructure.goals[0].targets[0].target_type;
      }

      return dashboardResponseSchema.parse({
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
      });
    }),
});

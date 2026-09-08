import {
  activityObservationQuantificationBundleSchema,
  activityPlanStructureSchema,
  bindPrescriptionQuantificationToScheduledEvent,
  calculateRollingTrainingQuality,
  canonicalActivityCategorySchema,
  canonicalTrainingPlanStructureSchema,
  createObservationQuantificationBundle,
  createPrescriptionQuantificationBundle,
  createUnavailableActivityPlanPlanningEstimate,
  getLoadBalanceStatus,
  getPlannedEstimate,
  loadCoverageSchema,
  loadSeriesIdentitySchema,
} from "@repo/core";
import {
  addDaysDateOnlyUtc,
  getCalendarDateInIanaZone,
  isValidIanaTimeZone,
} from "@repo/core/calendar";
import { commonLoadHistoryResultSchema } from "@repo/core/load";
import {
  activityArtifactLinks,
  activityArtifacts,
  activitySourceReferences,
  schema,
  type TrainingPlanRow,
} from "@repo/db";
import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { readAthleteReadModel } from "../application/athlete-intelligence/athlete-read-model";
import {
  loadPlannedActivitiesWithEstimations,
  type PlannedActivityWithEstimation,
} from "../application/home/plannedActivities";
import { getEffectivePlanLoad } from "../application/training-plan";
import {
  getCurrentPlanningWeek,
  getPlanningDateRange,
} from "../application/training-plan/current-planning-week";
import { getRequiredDb } from "../db";
import { createEventReadRepository } from "../infrastructure/repositories";
import { featureFlags } from "../lib/features";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { buildWorkloadEnvelopes, resolveActivitySourceIntegrity } from "../utils/workload";

function unavailableScheduledQuantification(
  item: Pick<PlannedActivityWithEstimation, "id" | "scheduled_date">,
  asOf: Date,
) {
  return createUnavailableActivityPlanPlanningEstimate({
    asOf: asOf.toISOString(),
    stage: "scheduled",
    scheduledEventId: item.id,
    reason: "source_missing",
  }).prescriptionQuantification;
}

function scheduledQuantificationSource(item: PlannedActivityWithEstimation, asOf: Date) {
  const prescriptionQuantification = item.activity_plan?.prescriptionQuantification;
  if (!prescriptionQuantification || prescriptionQuantification.members.length === 0) {
    return unavailableScheduledQuantification(item, asOf);
  }
  return bindPrescriptionQuantificationToScheduledEvent({
    prescriptionQuantification,
    eventId: item.id,
  });
}

function scheduledQuantification(item: PlannedActivityWithEstimation, asOf: Date) {
  return scheduledQuantificationSource(item, asOf);
}

export function getPlanCategoryComposition(structure: unknown) {
  const parsed = activityPlanStructureSchema.safeParse(structure);
  return parsed.success ? [parsed.data.activity_category] : [];
}

export function getScheduleExecutionPresentation(plan: { activity_category: string } | null) {
  return {
    activity_category: plan?.activity_category ?? null,
  };
}

const upcomingDaysSchema = z.object({
  days: z.number().min(1).max(14).default(7),
});

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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

const workloadEnvelopeSchema = z
  .object({
    value: z.number().nullable(),
    status: z.enum(["insufficient_history", "provisional", "stable"]),
    coverageDays: z.number().int().nonnegative(),
    requiredDays: z.number().int().positive(),
    source: z.enum(["common_load", "none"]),
    reasonCode: z.string().optional(),
    identity: loadSeriesIdentitySchema.optional(),
    coverage: loadCoverageSchema.optional(),
    coverageComplete: z.boolean().optional(),
  })
  .strict();

const scheduleItemSchema = z
  .object({
    id: z.string(),
    date: isoDateSchema,
    isToday: z.boolean(),
    isCompleted: z.boolean(),
    activityName: z.string(),
    activity_category: canonicalActivityCategorySchema.nullable(),
    estimatedDuration: z.number().nonnegative().nullable(),
    estimatedDistance: z.number().nullable(),
    load: z.number().nonnegative().nullable(),
    objectiveIntensity: z.number().nonnegative().nullable(),
  })
  .strict();

const dashboardResponseSchema = z
  .object({
    activePlan: z
      .object({
        id: z.string(),
        name: z.string(),
      })
      .strict()
      .nullable(),
    commonLoadHistory: commonLoadHistoryResultSchema,
    currentLoadStatus: z
      .object({
        longTermLoad: z.number(),
        recentLoad: z.number(),
        loadBalance: z.number(),
        loadBalanceStatus: z.string(),
        maturity: z.enum(["establishing_baseline", "provisional", "mature"]),
        coverageStatus: z.enum(["complete", "partial"]),
      })
      .strict()
      .nullable(),
    trainingLoadState: z
      .object({
        status: z.enum(["available", "unavailable"]),
        reason: z.enum(["complete_common_load_series", "incomplete_common_load_series"]),
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
        observationQuantification: activityObservationQuantificationBundleSchema,
        actual: z
          .object({
            distance: z.number().nullable(),
            duration: z.number().nullable(),
            load: z.number().nullable(),
            loadComplete: z.boolean(),
            count: z.number(),
          })
          .strict(),
        planned: z
          .object({
            distance: z.number().nullable(),
            duration: z.number().nonnegative().nullable(),
            load: z.number().nonnegative().nullable(),
            loadComplete: z.boolean(),
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
          longTermLoad: z.number(),
          recentLoad: z.number(),
          loadBalance: z.number(),
        })
        .strict(),
    ),
    projectedLoad: z.array(
      z
        .object({
          date: isoDateSchema,
          longTermLoad: z.number(),
          recentLoad: z.number(),
          loadBalance: z.number(),
          plannedLoad: z.number(),
          status: z.enum(["complete", "partial"]),
        })
        .strict(),
    ),
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

/**
 * Projects the common Load state from the server-owned effective plan composition.
 * Missing or partial planned load cannot be projected as if it were a rest day.
 */
export function projectCommonLoad(input: {
  current: { longTermLoad: number; recentLoad: number };
  currentDate: string;
  days: number;
  sourceComplete?: boolean;
  items: Array<{ date: string; commonLoad: { status: string; load?: number | null } }>;
}) {
  if (input.sourceComplete === false) return null;
  const plannedByDate = new Map<string, number>();
  for (const item of input.items) {
    if (item.commonLoad.status !== "complete" || item.commonLoad.load === null) return null;
    if (typeof item.commonLoad.load !== "number" || !Number.isFinite(item.commonLoad.load)) {
      return null;
    }
    plannedByDate.set(item.date, (plannedByDate.get(item.date) ?? 0) + item.commonLoad.load);
  }

  let longTermLoad = input.current.longTermLoad;
  let recentLoad = input.current.recentLoad;
  return Array.from({ length: input.days }, (_, index) => {
    const date = addDaysDateOnlyUtc(input.currentDate, index + 1);
    const plannedLoad = plannedByDate.get(date) ?? 0;
    longTermLoad += (plannedLoad - longTermLoad) / 42;
    recentLoad += (plannedLoad - recentLoad) / 7;
    return {
      date,
      longTermLoad: Math.round(longTermLoad * 10) / 10,
      recentLoad: Math.round(recentLoad * 10) / 10,
      loadBalance: Math.round((longTermLoad - recentLoad) * 10) / 10,
      plannedLoad: Math.round(plannedLoad * 10) / 10,
      status: "complete" as const,
    };
  });
}

type DashboardTrainingPlanRow = Pick<TrainingPlanRow, "id" | "name" | "description" | "structure">;

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
        or content_visibility = 'public'
        or (
          content_visibility = 'followers'
          and exists (
            select 1 from follows f
            where f.follower_id = ${input.profileId}
              and f.following_id = training_plans.profile_id
              and f.status = 'accepted'
          )
        )
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
      const now = new Date();
      const analyticsStart = new Date(now.getTime() - 90 * 86_400_000);
      const athleteReadModel = await readAthleteReadModel({
        db,
        profileId: userId,
        now,
        sections: {
          status: true,
          currentBaseline: { includePlanningContext: true },
          loadHistory: true,
          activityAnalytics: {
            startAt: analyticsStart.toISOString(),
            endAt: now.toISOString(),
            groupBy: "day",
            peakMetric: "common_load",
            peakLimit: 5,
          },
        },
      });
      const commonLoadHistory =
        athleteReadModel.loadHistory?.result ??
        commonLoadHistoryResultSchema.parse({
          status: "unavailable",
          policyVersion: "common_load_history_v1",
          reason: "invalid_input",
          context: {
            path: "publishedRevision",
            message: "Current published athlete state is required for Common Load history",
          },
        });
      const availableCommonLoadHistory =
        commonLoadHistory.status === "available" ? commonLoadHistory : null;
      const latestCommonLoadPoint = availableCommonLoadHistory?.points.at(-1) ?? null;
      const profileTimezone = athleteReadModel.currentBaseline?.planningTimezone.trim();
      const planningTimezone =
        profileTimezone && isValidIanaTimeZone(profileTimezone) ? profileTimezone : "UTC";
      const todayDate = getCalendarDateInIanaZone(now.toISOString(), planningTimezone);
      // Presentation uses the profile-local midnight, while completed-activity
      // reads extend through that same local day's end.
      const todayRange = getPlanningDateRange({
        startDate: todayDate,
        endDate: todayDate,
        timezone: planningTimezone,
      });
      const today = todayRange.startInstant;
      const planningContext = athleteReadModel.currentBaseline?.planningContext ?? null;
      const userAge = planningContext?.demographics.ageYears.value ?? undefined;
      const userGender = planningContext?.demographics.gender ?? null;
      const effectiveAge = featureFlags.personalizationAgeConstants ? userAge : undefined;
      const effectiveGender = featureFlags.personalizationGenderAdjustment ? userGender : undefined;

      // --- 1. Fetch Active Plan & Settings ---
      const rawNextPlannedEvent = await db
        .select({
          training_plan_id: schema.events.training_plan_id,
          starts_at: schema.events.starts_at,
        })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.profile_id, userId),
            eq(schema.events.event_type, "planned"),
            gte(schema.events.scheduled_date, todayDate),
            isNotNull(schema.events.training_plan_id),
          ),
        )
        .orderBy(asc(schema.events.scheduled_date), asc(schema.events.starts_at))
        .limit(1)
        .then((rows) => rows[0] ?? null);

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

      if (plan?.structure) {
        canonicalTrainingPlanStructureSchema.parse(plan.structure);
      }

      // --- 2. Calculate Dates ---
      // The canonical read model owns the historical replay window.
      const trendDays = 42;
      const chartStartDate = addDaysDateOnlyUtc(todayDate, -trendDays);

      // For schedule: Next N days, bounded by profile-local calendar dates.
      const scheduleEndDate = addDaysDateOnlyUtc(todayDate, upcomingDays);

      // For weekly summary: Current Week (Sun-Sat)
      const currentWeek = getCurrentPlanningWeek(now, planningTimezone);

      const activityAnalytics =
        athleteReadModel.activityAnalytics?.status === "available"
          ? athleteReadModel.activityAnalytics.dashboard
          : null;
      const activityPoints = activityAnalytics?.performance.dataPoints ?? [];

      const rollingTrainingQuality =
        featureFlags.personalizationTrainingQuality && activityPoints.length > 0
          ? calculateRollingTrainingQuality(
              activityPoints.flatMap((activity) =>
                (activity.observationQuantification?.members ?? []).map((member) => ({
                  started_at: activity.date,
                  common_load: member.commonLoad,
                })),
              ),
            )
          : undefined;

      // --- 4. Fetch Planned Activities (Future & Current Week) ---
      // We need planned activities for the Schedule (Future) AND for the Weekly Summary (Past days of this week)
      // So we fetch from startOfWeek to scheduleEnd
      const { activitiesWithEstimations } = await loadPlannedActivitiesWithEstimations(db, {
        profileId: userId,
        scheduledDateGte: currentWeek.startDate,
        scheduledDateLt: scheduleEndDate,
      });

      // --- 6. Primary fitness trends use the canonical daily common Load history. ---
      const commonHistoryPoints =
        commonLoadHistory.status === "available" ? commonLoadHistory.points : [];
      const fitnessTrends = commonHistoryPoints
        .filter((point) => point.date >= chartStartDate)
        .map((point) => ({
          date: point.date,
          longTermLoad: Math.round(point.longTermLoad * 10) / 10,
          recentLoad: Math.round(point.recentLoad * 10) / 10,
          loadBalance: Math.round(point.loadBalance * 10) / 10,
        }));

      // --- 7. Calculate Consistency (Streak) ---
      // Iterate backwards from yesterday
      let streak = 0;
      const uniqueActivityDays = new Set(
        activityPoints
          .map((activity) => getCalendarDateInIanaZone(activity.date, planningTimezone))
          .filter(Boolean),
      );
      // Check today
      if (uniqueActivityDays.has(todayDate)) {
        streak++;
      }
      // Check previous days
      let checkDate = addDaysDateOnlyUtc(todayDate, -1);
      while (true) {
        if (uniqueActivityDays.has(checkDate)) {
          streak++;
          checkDate = addDaysDateOnlyUtc(checkDate, -1);
        } else {
          break;
        }
      }

      // --- 8. Weekly Summary (Planned vs Actual) ---
      // Actuals
      const weeklyActuals = activityPoints.filter((activity) => {
        const activityDate = getCalendarDateInIanaZone(activity.date, planningTimezone);
        return activityDate >= currentWeek.startDate && activityDate <= currentWeek.endDate;
      });
      const weeklyActualQuantification = createObservationQuantificationBundle({
        members: weeklyActuals.flatMap(
          (activity) => activity.observationQuantification?.members ?? [],
        ),
      });
      const weeklyActualSummary = weeklyActualQuantification.summary;
      const weeklyActualLoad = weeklyActualSummary.commonLoad;

      const weeklyActualStats = {
        distance:
          weeklyActualSummary.distance.value === null
            ? null
            : weeklyActualSummary.distance.value / 1000,
        duration: weeklyActualSummary.duration.active.value,
        load: weeklyActualLoad.status === "complete" ? Math.round(weeklyActualLoad.load) : null,
        loadComplete: weeklyActualLoad.status === "complete",
        count: weeklyActuals.length,
      };

      // Planned
      const startOfWeekStr = currentWeek.startDate;
      const endOfWeekStr = currentWeek.endDate;

      const weeklyPlanned = activitiesWithEstimations.filter(
        (plannedActivity) =>
          plannedActivity.scheduled_date >= startOfWeekStr &&
          plannedActivity.scheduled_date <= endOfWeekStr,
      );
      const weeklyPlannedQuantification = createPrescriptionQuantificationBundle({
        members: weeklyPlanned.flatMap(
          (plannedActivity) => scheduledQuantification(plannedActivity, now).members,
        ),
      });
      const weeklyPlannedSummary = weeklyPlannedQuantification.summary;
      const weeklyPlannedLoad = weeklyPlannedSummary.commonLoad;

      const weeklyPlannedStats = {
        distance:
          weeklyPlannedSummary.distance.value === null
            ? null
            : weeklyPlannedSummary.distance.value / 1000,
        duration:
          weeklyPlannedSummary.duration.elapsed.status === "complete"
            ? weeklyPlannedSummary.duration.elapsed.value
            : null,
        load: weeklyPlannedLoad.status === "complete" ? Math.round(weeklyPlannedLoad.load) : null,
        loadComplete: weeklyPlannedLoad.status === "complete",
        count: weeklyPlanned.length,
      };

      // --- 9. Current Workload Envelopes (ACWR/Monotony) ---
      const workloadWindowStartDate = addDaysDateOnlyUtc(todayDate, -27);
      const workloadWindowStart = getPlanningDateRange({
        startDate: workloadWindowStartDate,
        endDate: workloadWindowStartDate,
        timezone: planningTimezone,
      }).startInstant;
      const workloadActivityIds = activityPoints.map((activity) => activity.activityId);
      const workloadSourceRows =
        workloadActivityIds.length === 0
          ? []
          : await db
              .select({
                activityId: activityArtifactLinks.activity_id,
                artifactId: activityArtifactLinks.artifact_id,
              })
              .from(activityArtifactLinks)
              .innerJoin(
                activityArtifacts,
                and(
                  eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
                  eq(activityArtifacts.profile_id, activityArtifactLinks.profile_id),
                  eq(activityArtifacts.availability, "accepted"),
                ),
              )
              .where(
                and(
                  eq(activityArtifactLinks.profile_id, userId),
                  inArray(activityArtifactLinks.activity_id, workloadActivityIds),
                  eq(activityArtifactLinks.role, "source"),
                  eq(activityArtifactLinks.is_current, true),
                ),
              );
      const workloadProviderRows =
        workloadActivityIds.length === 0
          ? []
          : await db
              .select({
                activityId: activitySourceReferences.activity_id,
                provider: activitySourceReferences.provider,
                externalId: activitySourceReferences.provider_external_id,
              })
              .from(activitySourceReferences)
              .where(
                and(
                  eq(activitySourceReferences.profile_id, userId),
                  inArray(activitySourceReferences.activity_id, workloadActivityIds),
                ),
              );
      const sourceEvidenceByActivity = new Map<
        string,
        {
          currentArtifactIds: string[];
          providerReferences: Array<{ provider: string; externalId: string }>;
        }
      >();
      const sourceEvidenceFor = (activityId: string) => {
        const existing = sourceEvidenceByActivity.get(activityId);
        if (existing) return existing;
        const created = { currentArtifactIds: [], providerReferences: [] };
        sourceEvidenceByActivity.set(activityId, created);
        return created;
      };
      for (const row of workloadSourceRows) {
        sourceEvidenceFor(row.activityId).currentArtifactIds.push(row.artifactId);
      }
      for (const row of workloadProviderRows) {
        if (!row.activityId) continue;
        sourceEvidenceFor(row.activityId).providerReferences.push({
          provider: row.provider,
          externalId: row.externalId,
        });
      }
      const workload = buildWorkloadEnvelopes(
        activityPoints.map((activity) => {
          const evidence =
            sourceEvidenceByActivity.get(activity.activityId) ??
            ({ currentArtifactIds: [], providerReferences: [] } as const);
          return {
            started_at: activity.date,
            sourceIntegrity: resolveActivitySourceIntegrity({
              evidence,
              observationQuantification: activity.observationQuantification,
            }),
            observationQuantification: activity.observationQuantification,
          };
        }),
        workloadWindowStart,
        today,
        { planningTimezone },
      );

      // --- 10. Schedule (Future) ---
      const todayStr = todayDate;

      const scheduleEndStr = scheduleEndDate;

      const schedule = activitiesWithEstimations
        .filter((plannedActivity) => {
          const scheduledDate = plannedActivity.scheduled_date;
          // Include today + future using stable date-only comparisons.
          return scheduledDate >= todayStr && scheduledDate < scheduleEndStr;
        })
        .map((plannedActivity) => {
          const prescriptionQuantification = scheduledQuantification(plannedActivity, now);
          const plannedEstimate = getPlannedEstimate(prescriptionQuantification);
          const completeValue = (quantity: { status: string; value: number | null }) =>
            quantity.status === "known" || quantity.status === "estimated" ? quantity.value : null;
          const objectiveIntensity =
            plannedActivity.activity_plan?.planProjection?.objectiveIntensity;
          const execution = plannedActivity.activity_plan
            ? { activity_category: plannedActivity.activity_plan.activity_category }
            : null;
          return {
            id: plannedActivity.id,
            date: plannedActivity.scheduled_date,
            isToday: plannedActivity.scheduled_date === todayStr,
            isCompleted:
              Boolean(plannedActivity.linked_activity_id) || plannedActivity.status === "completed",
            activityName: plannedActivity.activity_plan?.name || "Activity",
            ...getScheduleExecutionPresentation(execution),
            estimatedDuration: completeValue(plannedEstimate.durationSeconds),
            estimatedDistance: completeValue(plannedEstimate.distanceMeters),
            load: completeValue(plannedEstimate.load),
            objectiveIntensity:
              objectiveIntensity?.status === "available" ? objectiveIntensity.value : null,
          };
        });

      const todaysActivity = schedule.find((s) => s.isToday) || null;

      // --- 11. Calculate Projected Fitness (Future CTL based on plan) ---
      const projectionDays = 42; // Project 42 days into future
      const projectionStartDate = athleteReadModel.currentBaseline?.currentPlanningDate ?? null;
      const projectionEndDate = projectionStartDate
        ? addDaysDateOnlyUtc(projectionStartDate, projectionDays)
        : null;
      const effectiveProjection =
        projectionStartDate && projectionEndDate
          ? await getEffectivePlanLoad({
              db,
              profileId: userId,
              repository: estimationStore,
              request: { startDate: projectionStartDate, endDate: projectionEndDate },
            })
          : null;
      // Missing history or an unavailable effective plan intentionally produces no curve.
      // In particular, missing planned Load is not treated as a rest day.
      const projectedLoad =
        latestCommonLoadPoint &&
        projectionStartDate &&
        effectiveProjection?.status === "available" &&
        effectiveProjection.effective.status === "available"
          ? (projectCommonLoad({
              current: {
                longTermLoad: latestCommonLoadPoint.longTermLoad,
                recentLoad: latestCommonLoadPoint.recentLoad,
              },
              currentDate: projectionStartDate,
              days: projectionDays,
              sourceComplete: effectiveProjection.effective.firm.status === "complete",
              items: effectiveProjection.effective.firmItems,
            }) ?? [])
          : [];

      // --- 12. Calculate Plan Adherence ---
      const adherence =
        weeklyActualStats.loadComplete &&
        weeklyActualStats.load !== null &&
        weeklyPlannedStats.load !== null &&
        weeklyPlannedStats.loadComplete &&
        weeklyPlannedStats.load > 0
          ? Math.round((weeklyActualStats.load / weeklyPlannedStats.load) * 100)
          : null;
      return dashboardResponseSchema.parse({
        activePlan: plan
          ? {
              id: plan.id,
              name: plan.name || "Active Plan",
            }
          : null,
        commonLoadHistory,
        currentLoadStatus:
          latestCommonLoadPoint && availableCommonLoadHistory
            ? {
                longTermLoad: latestCommonLoadPoint.longTermLoad,
                recentLoad: latestCommonLoadPoint.recentLoad,
                loadBalance: latestCommonLoadPoint.loadBalance,
                loadBalanceStatus: getLoadBalanceStatus(latestCommonLoadPoint.loadBalance),
                maturity: availableCommonLoadHistory.maturity.status,
                coverageStatus: availableCommonLoadHistory.coverageStatus,
              }
            : null,
        trainingLoadState: {
          status: availableCommonLoadHistory ? "available" : "unavailable",
          reason: availableCommonLoadHistory
            ? "complete_common_load_series"
            : "incomplete_common_load_series",
        },
        workload,
        consistency: {
          streak,
          weeklyCount: weeklyActualStats.count,
        },
        weeklySummary: {
          observationQuantification: weeklyActualQuantification,
          actual: weeklyActualStats,
          planned: weeklyPlannedStats,
          adherence, // Percentage
        },
        schedule, // List of upcoming (including today)
        trends: fitnessTrends,
        projectedLoad,
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

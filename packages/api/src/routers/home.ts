import {
  activityObservationQuantificationBundleSchema,
  activityPlanPrescriptionQuantificationBundleSchema,
  activityPlanStructureSchema,
  activityPrescriptionQuantificationBundleSchema,
  addDaysDateOnlyUtc,
  bindPrescriptionQuantificationToScheduledEvent,
  calculateRollingTrainingQuality,
  canonicalActivityCategorySchema,
  canonicalTrainingPlanStructureSchema,
  createPrescriptionQuantificationBundle,
  createUnavailableActivityPlanPlanningEstimate,
  getLoadBalanceStatus,
  loadCoverageSchema,
  loadSeriesIdentitySchema,
} from "@repo/core";
import {
  commonLoadAggregateSchema,
  commonLoadHistoryResultSchema,
  commonLoadResultSchema,
} from "@repo/core/load";
import { calculateAge } from "@repo/core/profile/date-of-birth";
import { getScheduledDateKey, isValidIanaTimeZone } from "@repo/core/utils/schedule-date";
import { schema, type TrainingPlanRow } from "@repo/db";
import { and, asc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { readCurrentProfileCommonLoadHistory } from "../application/activities/read-current-profile-common-load-history";
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
import {
  createActivityAnalysisStore,
  createEventReadRepository,
} from "../infrastructure/repositories";
import {
  buildDynamicStressSeries,
  loadActivitySegmentsByActivityId,
  summarizeSegmentQuantification,
} from "../lib/activity-analysis";
import { featureFlags } from "../lib/features";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { buildWorkloadEnvelopes } from "../utils/workload";

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
  return parsed.success
    ? parsed.data.segments.flatMap((segment) =>
        segment.role === "activity" ? [segment.activity_category] : [],
      )
    : [];
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

const profileRowSchema = z
  .object({
    dob: z.date().nullable().optional(),
    gender: z.enum(["male", "female"]).nullable().optional(),
    planning_timezone: z.string().nullable().optional(),
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
    estimatedDuration: z.number().nullable(),
    estimatedDistance: z.number().nullable(),
    prescriptionQuantification: activityPlanPrescriptionQuantificationBundleSchema,
    commonLoad: z.union([commonLoadResultSchema, commonLoadAggregateSchema]),
    load: z.number().nullable(),
    intensity: z.number().nullable(),
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
        commonLoad: z
          .object({
            actual: commonLoadAggregateSchema,
            planned: commonLoadAggregateSchema,
          })
          .strict(),
        observationQuantification: activityObservationQuantificationBundleSchema,
        prescriptionQuantification: activityPrescriptionQuantificationBundleSchema,
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
            duration: z.number().nullable(),
            load: z.number().nullable(),
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
 * This deliberately has no estimated-load fallback: an unavailable plan composition
 * means that the dashboard must abstain instead of inventing zero load.
 */
export function projectCommonLoad(input: {
  current: { longTermLoad: number; recentLoad: number };
  currentDate: string;
  days: number;
  sourceComplete?: boolean;
  items: Array<{ date: string; commonLoad: { status: string; load?: number | null } }>;
}) {
  const plannedByDate = new Map<string, number>();
  let complete = input.sourceComplete ?? true;
  for (const item of input.items) {
    if (item.commonLoad.status === "unavailable" || item.commonLoad.load === null) return null;
    if (typeof item.commonLoad.load !== "number") return null;
    if (item.commonLoad.status !== "complete") complete = false;
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
      status: complete ? ("complete" as const) : ("partial" as const),
    };
  });
}

type DashboardTrainingPlanRow = Pick<TrainingPlanRow, "id" | "name" | "description" | "structure">;

const dashboardActivitySchema = z
  .object({
    id: z.string(),
    profile_id: z.string(),
    started_at: z.date(),
    finished_at: z.date(),
    elapsed_ms: z.number().int().positive(),
    active_ms: z.number().int().nonnegative().nullable(),
    moving_ms: z.number().int().nonnegative().nullable(),
    timing_coverage: z.enum(["complete", "partial", "unavailable"]),
    distance_meters: z.number().int().nonnegative(),
    avg_heart_rate: z.number().int().nullable(),
    max_heart_rate: z.number().int().nullable(),
    avg_power: z.number().int().nullable(),
    max_power: z.number().int().nullable(),
    avg_speed_mps: z.number().nullable(),
    max_speed_mps: z.number().nullable(),
    normalized_speed_mps: z.number().nullable(),
  })
  .strict();

async function listDashboardActivitiesInRange(
  db: ReturnType<typeof getRequiredDb>,
  input: { profileId: string; startedAtGte: Date; startedAtLte: Date },
) {
  const rows = await db
    .select({
      id: schema.activities.id,
      profile_id: schema.activities.profile_id,
      started_at: schema.activities.started_at,
      finished_at: schema.activities.finished_at,
      elapsed_ms: schema.activities.elapsed_ms,
      active_ms: schema.activities.active_ms,
      moving_ms: schema.activities.moving_ms,
      timing_coverage: schema.activities.timing_coverage,
      distance_meters: schema.activities.distance_meters,
      avg_heart_rate: schema.activities.avg_heart_rate,
      max_heart_rate: schema.activities.max_heart_rate,
      avg_power: schema.activities.avg_power,
      max_power: schema.activities.max_power,
      avg_speed_mps: schema.activities.avg_speed_mps,
      max_speed_mps: schema.activities.max_speed_mps,
      normalized_speed_mps: schema.activities.normalized_speed_mps,
    })
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.profile_id, input.profileId),
        gte(schema.activities.started_at, input.startedAtGte),
        lte(schema.activities.started_at, input.startedAtLte),
      ),
    )
    .orderBy(asc(schema.activities.started_at));

  const activities = dashboardActivitySchema.array().parse(rows);
  const segmentsByActivityId = await loadActivitySegmentsByActivityId(
    db,
    activities.map((activity) => activity.id),
  );
  return activities.map((activity) => ({
    ...activity,
    segments: segmentsByActivityId.get(activity.id) ?? [],
  }));
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
      const commonLoadHistory = await readCurrentProfileCommonLoadHistory({
        db,
        profileId: userId,
      });
      const availableCommonLoadHistory =
        commonLoadHistory.result.status === "available" ? commonLoadHistory.result : null;
      const latestCommonLoadPoint = availableCommonLoadHistory?.points.at(-1) ?? null;
      const now = new Date();

      const [rawProfile] = await db
        .select({
          dob: schema.profiles.dob,
          gender: schema.profiles.gender,
          planning_timezone: schema.profiles.planning_timezone,
        })
        .from(schema.profiles)
        .where(eq(schema.profiles.id, userId))
        .limit(1);

      const profile = rawProfile ? profileRowSchema.parse(rawProfile) : null;
      const profileTimezone = profile?.planning_timezone?.trim();
      const planningTimezone =
        profileTimezone && isValidIanaTimeZone(profileTimezone) ? profileTimezone : "UTC";
      const todayDate = getScheduledDateKey(now.toISOString(), planningTimezone);
      // Presentation uses the profile-local midnight, while completed-activity
      // reads extend through that same local day's end.
      const todayRange = getPlanningDateRange({
        startDate: todayDate,
        endDate: todayDate,
        timezone: planningTimezone,
      });
      const today = todayRange.startInstant;
      const endOfToday = new Date(todayRange.endExclusiveInstant.getTime() - 1);

      const userAge = calculateAge(profile?.dob?.toISOString() ?? null);
      const userGender =
        profile?.gender === "male" || profile?.gender === "female" ? profile.gender : null;
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
      // For trends: Need 42 days of history + 42 days buffer for CTL seeding
      const trendDays = 42;
      const seedDays = 42;
      const historyStartDate = addDaysDateOnlyUtc(todayDate, -(trendDays + seedDays));
      const historyStart = getPlanningDateRange({
        startDate: historyStartDate,
        endDate: historyStartDate,
        timezone: planningTimezone,
      }).startInstant;
      const chartStartDate = addDaysDateOnlyUtc(todayDate, -trendDays);

      // For schedule: Next N days, bounded by profile-local calendar dates.
      const scheduleEndDate = addDaysDateOnlyUtc(todayDate, upcomingDays);

      // For weekly summary: Current Week (Sun-Sat)
      const currentWeek = getCurrentPlanningWeek(now, planningTimezone);

      // --- 3. Fetch Activities (Actual) ---
      // Fetching enough history for trends and current week stats
      const activities = await listDashboardActivitiesInRange(db, {
        profileId: userId,
        startedAtGte: historyStart,
        startedAtLte: endOfToday,
      });

      const dynamicStressSeries = await buildDynamicStressSeries({
        store: createActivityAnalysisStore(db),
        profileId: userId,
        activities,
      });
      const {
        byActivityId: derivedActivityMap,
        segmentSummaries = [],
        complete: hasCompleteCommonLoadSeries = false,
        seriesIdentity = null,
      } = dynamicStressSeries as typeof dynamicStressSeries & {
        complete?: boolean;
        seriesIdentity?: unknown;
      };
      const activityStartedAtById = new Map(
        activities.map((activity) => [activity.id, activity.started_at.toISOString()]),
      );

      const rollingTrainingQuality =
        featureFlags.personalizationTrainingQuality && activities.length > 0
          ? calculateRollingTrainingQuality(
              segmentSummaries.map((summary) => ({
                started_at:
                  activityStartedAtById.get(summary.activity_id) ?? summary.computed_as_of,
                common_load: summary.observationQuantification.members[0]?.commonLoad ?? null,
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
          scheduledDateGte: currentWeek.startDate,
          scheduledDateLt: scheduleEndDate,
        });

      // --- 6. Primary fitness trends use the canonical daily common Load history. ---
      const commonHistoryPoints =
        commonLoadHistory.result.status === "available" ? commonLoadHistory.result.points : [];
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
        activities
          .map((activity) =>
            getScheduledDateKey(activity.started_at.toISOString(), planningTimezone),
          )
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
      const weeklyActuals = activities.filter((activity) => {
        const activityDate = getScheduledDateKey(
          activity.started_at.toISOString(),
          planningTimezone,
        );
        return activityDate >= currentWeek.startDate && activityDate <= currentWeek.endDate;
      });
      const weeklyActualQuantification = summarizeSegmentQuantification(
        segmentSummaries,
        new Set(weeklyActuals.map((activity) => activity.id)),
      );
      const weeklyActualSummary = weeklyActualQuantification.summary;
      const weeklyActualLoad = weeklyActualSummary.commonLoad;

      const weeklyActualStats = {
        distance:
          weeklyActualSummary.distance.value === null
            ? null
            : weeklyActualSummary.distance.value / 1000,
        duration: weeklyActualSummary.duration.active.value,
        load:
          weeklyActualLoad.status === "complete" || weeklyActualLoad.status === "partial"
            ? Math.round(weeklyActualLoad.load)
            : null,
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
        duration: weeklyPlannedSummary.duration.elapsed.value,
        load:
          weeklyPlannedLoad.status === "unavailable" ? null : Math.round(weeklyPlannedLoad.load),
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
      const workload = buildWorkloadEnvelopes(
        activities.map((activity) => ({
          started_at: activity.started_at.toISOString(),
          observationQuantification:
            derivedActivityMap.get(activity.id)?.observationQuantification ?? null,
        })),
        workloadWindowStart,
        today,
      );

      // --- 10. Schedule (Future) ---
      const todayStr = todayDate;

      // Check which planned activities have been completed by matching with actual activities
      const completedActivityMap = new Map<string, boolean>();
      plannedActivities?.forEach((pa) => {
        if (!pa.scheduled_date) return;
        const paDate = pa.scheduled_date.split("T")[0];
        const hasActivity = activities.some(
          (activity) =>
            getScheduledDateKey(activity.started_at.toISOString(), planningTimezone) === paDate,
        );
        if (hasActivity) {
          completedActivityMap.set(pa.id, true);
        }
      });

      const scheduleEndStr = scheduleEndDate;

      const schedule = activitiesWithEstimations
        .filter((plannedActivity) => {
          const scheduledDate = plannedActivity.scheduled_date;
          // Include today + future using stable date-only comparisons.
          return scheduledDate >= todayStr && scheduledDate < scheduleEndStr;
        })
        .map((plannedActivity) => {
          const prescriptionQuantification = scheduledQuantification(plannedActivity, now);
          const quantification = prescriptionQuantification.summary;
          const commonLoad = quantification.commonLoad;
          const commonValue =
            commonLoad.status === "complete" || commonLoad.status === "partial" ? commonLoad : null;
          const execution = plannedActivity.activity_plan
            ? { activity_category: plannedActivity.activity_plan.activity_category }
            : null;
          return {
            id: plannedActivity.id,
            date: plannedActivity.scheduled_date,
            isToday: plannedActivity.scheduled_date === todayStr,
            isCompleted: completedActivityMap.get(plannedActivity.id) || false,
            activityName: plannedActivity.activity_plan?.name || "Activity",
            ...getScheduleExecutionPresentation(execution),
            estimatedDuration: quantification.duration.elapsed.value,
            estimatedDistance: quantification.distance.value,
            prescriptionQuantification,
            commonLoad,
            load: commonValue && "load" in commonValue ? commonValue.load : null,
            intensity: commonValue && "intensity" in commonValue ? commonValue.intensity : null,
          };
        });

      const todaysActivity = schedule.find((s) => s.isToday) || null;

      // --- 11. Calculate Projected Fitness (Future CTL based on plan) ---
      const projectionDays = 42; // Project 42 days into future
      const projectionStartDate = commonLoadHistory.currentPlanningDate;
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
      const weeklyActualCommonLoad = weeklyActualSummary.commonLoad;
      const weeklyPlannedCommonLoad = weeklyPlannedSummary.commonLoad;

      return dashboardResponseSchema.parse({
        activePlan: plan
          ? {
              id: plan.id,
              name: plan.name || "Active Plan",
            }
          : null,
        commonLoadHistory: commonLoadHistory.result,
        currentLoadStatus:
          latestCommonLoadPoint === null || availableCommonLoadHistory === null
            ? null
            : {
                longTermLoad: latestCommonLoadPoint.longTermLoad,
                recentLoad: latestCommonLoadPoint.recentLoad,
                loadBalance: latestCommonLoadPoint.loadBalance,
                loadBalanceStatus: getLoadBalanceStatus(latestCommonLoadPoint.loadBalance),
                maturity: availableCommonLoadHistory.maturity.status,
                coverageStatus: availableCommonLoadHistory.coverageStatus,
              },
        trainingLoadState: {
          status: hasCompleteCommonLoadSeries && seriesIdentity ? "available" : "unavailable",
          reason:
            hasCompleteCommonLoadSeries && seriesIdentity
              ? "complete_common_load_series"
              : "incomplete_common_load_series",
        },
        workload,
        consistency: {
          streak,
          weeklyCount: weeklyActualStats.count,
        },
        weeklySummary: {
          commonLoad: {
            actual: weeklyActualCommonLoad,
            planned: weeklyPlannedCommonLoad,
          },
          observationQuantification: weeklyActualQuantification,
          prescriptionQuantification: weeklyPlannedQuantification,
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

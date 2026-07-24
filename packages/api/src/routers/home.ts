import {
  activityPlanStructureSchemaV3,
  activityTssIdentityMethodValues,
  addDaysDateOnlyUtc,
  calculateAge,
  calculateRollingTrainingQuality,
  canonicalSportSchema,
  getLoadBalanceStatus,
} from "@repo/core";
import {
  type ActivityPlanMetricsLike,
  getAuthoritativeActivityPlanMetrics,
} from "@repo/core/activity-plan";
import {
  aggregateCommonLoadEnvelopes,
  commonLoadAggregateSchema,
  commonLoadHistoryResultSchema,
  commonLoadResultSchema,
} from "@repo/core/load";
import { getScheduledDateKey, isValidIanaTimeZone } from "@repo/core/utils/schedule-date";
import { schema, type TrainingPlanRow } from "@repo/db";
import { and, asc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { readCurrentProfileCommonLoadHistory } from "../application/activities/read-current-profile-common-load-history";
import { loadPlannedActivitiesWithEstimations } from "../application/home/plannedActivities";
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
  summarizeSegmentTss,
} from "../lib/activity-analysis";
import { featureFlags } from "../lib/features";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { buildWorkloadEnvelopes } from "../utils/workload";

function readActivityPlanMetrics(plan: unknown) {
  return getAuthoritativeActivityPlanMetrics(plan as ActivityPlanMetricsLike | null | undefined);
}

function readCommonLoadEnvelope(value: unknown) {
  const result = commonLoadResultSchema.safeParse(value);
  if (result.success) return result.data;
  const aggregate = commonLoadAggregateSchema.safeParse(value);
  return aggregate.success ? aggregate.data : null;
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
    identity: z
      .object({
        sport: canonicalSportSchema,
        method: z.enum(activityTssIdentityMethodValues),
        source: z.literal("activity_analysis"),
        version: z.literal("1"),
      })
      .strict()
      .nullable()
      .optional(),
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
    activityType: canonicalSportSchema.nullable(),
    activityKind: z.enum(["single", "multisport", "unknown"]),
    activityCategories: z.array(canonicalSportSchema),
    estimatedDuration: z.number().nullable(),
    estimatedDistance: z.number().nullable(),
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
        phase: z.string().nullable(),
        targetType: z.string().nullable().optional(),
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
    currentStatus: z
      .object({
        ctl: z.number(),
        atl: z.number(),
        tsb: z.number(),
        loadBalanceStatus: z.string(),
      })
      .strict()
      .nullable(),
    trainingLoadState: z
      .object({
        status: z.enum(["available", "unavailable"]),
        reason: z.enum(["complete_identified_series", "mixed_or_incomplete_tss_series"]),
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
        actual: z
          .object({
            distance: z.number(),
            duration: z.number(),
            tss: z.number(),
            tssComplete: z.boolean(),
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
    projectedLoad: z.array(
      z
        .object({
          date: isoDateSchema,
          ctl: z.number(),
          atl: z.number(),
          tsb: z.number(),
          /** @deprecated Common Load is the primary projected dose. */
          plannedTss: z.number().nullable(),
          plannedLoad: z.number(),
          status: z.enum(["complete", "partial"]),
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

/**
 * Projects the common Load state from the server-owned effective plan composition.
 * This deliberately has no estimated-TSS fallback: an unavailable plan composition
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
      ctl: Math.round(longTermLoad * 10) / 10,
      atl: Math.round(recentLoad * 10) / 10,
      tsb: Math.round((longTermLoad - recentLoad) * 10) / 10,
      plannedTss: null,
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
    normalized_power: z.number().nullable(),
    normalized_speed_mps: z.number().nullable(),
    normalized_graded_speed_mps: z.number().nullable(),
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
      normalized_power: schema.activities.normalized_power,
      normalized_speed_mps: schema.activities.normalized_speed_mps,
      normalized_graded_speed_mps: schema.activities.normalized_graded_speed_mps,
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

export function getPlanCategoryComposition(structure: unknown) {
  return activityPlanStructureSchemaV3
    .parse(structure)
    .segments.flatMap((segment) => (segment.role === "activity" ? [segment.category] : []));
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
            gte(schema.events.starts_at, today),
            isNotNull(schema.events.training_plan_id),
          ),
        )
        .orderBy(asc(schema.events.starts_at))
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

      const planStructure = plan?.structure ? planStructureSchema.parse(plan.structure) : null;

      // Extract phase from structure if available
      const planPhase = planStructure?.periodization?.currentPhase ?? null;

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
      const scheduleEnd = getPlanningDateRange({
        startDate: scheduleEndDate,
        endDate: scheduleEndDate,
        timezone: planningTimezone,
      }).startInstant;

      // For weekly summary: Current Week (Sun-Sat)
      const currentWeek = getCurrentPlanningWeek(now, planningTimezone);
      const startOfWeek = currentWeek.startInstant;
      const endOfWeek = new Date(currentWeek.endExclusiveInstant.getTime() - 1);

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
        complete: hasCompleteTssSeries = false,
        seriesIdentity = null,
      } = dynamicStressSeries as typeof dynamicStressSeries & {
        complete?: boolean;
        seriesIdentity?: unknown;
      };

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

      // --- 6. Primary fitness trends use the canonical daily common Load history. ---
      const commonHistoryPoints =
        commonLoadHistory.result.status === "available" ? commonLoadHistory.result.points : [];
      const fitnessTrends = commonHistoryPoints
        .filter((point) => point.date >= chartStartDate)
        .map((point) => ({
          date: point.date,
          ctl: Math.round(point.longTermLoad * 10) / 10,
          atl: Math.round(point.recentLoad * 10) / 10,
          tsb: Math.round(point.loadBalance * 10) / 10,
        }));
      const currentCTL = latestCommonLoadPoint?.longTermLoad ?? 0;
      const currentATL = latestCommonLoadPoint?.recentLoad ?? 0;
      const todayStatus = latestCommonLoadPoint
        ? {
            ctl: Math.round(latestCommonLoadPoint.longTermLoad * 10) / 10,
            atl: Math.round(latestCommonLoadPoint.recentLoad * 10) / 10,
            tsb: Math.round(latestCommonLoadPoint.loadBalance * 10) / 10,
            loadBalanceStatus: getLoadBalanceStatus(latestCommonLoadPoint.loadBalance),
          }
        : null;

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
      const weeklyActualLoad = summarizeSegmentTss(
        segmentSummaries,
        new Set(weeklyActuals.map((activity) => activity.id)),
      );

      const weeklyActualStats = {
        distance:
          weeklyActuals.reduce((sum, activity) => sum + (activity.distance_meters || 0), 0) / 1000,
        duration: weeklyActuals.reduce(
          (sum, activity) => sum + (activity.active_ms ?? 0) / 1000,
          0,
        ),
        tss: Math.round(weeklyActualLoad.tss),
        tssComplete: weeklyActualLoad.complete,
        count: weeklyActuals.length,
      };

      // Planned
      const startOfWeekStr = currentWeek.startDate;
      const endOfWeekStr = currentWeek.endDate;

      const weeklyPlanned = activitiesWithEstimations.filter((pa: any) => {
        const scheduledDate = pa.scheduled_date?.split("T")[0];
        if (!scheduledDate) return false;

        return scheduledDate >= startOfWeekStr && scheduledDate <= endOfWeekStr;
      });

      const weeklyPlannedStats = {
        distance:
          weeklyPlanned.reduce(
            (sum, pa) => sum + (readActivityPlanMetrics(pa.activity_plan).estimated_distance ?? 0),
            0,
          ) / 1000,
        duration: weeklyPlanned.reduce(
          (sum, pa) => sum + (readActivityPlanMetrics(pa.activity_plan).estimated_duration ?? 0),
          0,
        ),
        tss: Math.round(
          weeklyPlanned.reduce(
            (sum, pa) => sum + (readActivityPlanMetrics(pa.activity_plan).estimated_tss ?? 0),
            0,
          ),
        ),
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
          tss: derivedActivityMap.get(activity.id)?.tss ?? null,
          tss_identity: (derivedActivityMap.get(activity.id) as any)?.tss_identity ?? null,
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
        .filter((pa: any) => {
          const scheduledDate = pa.scheduled_date?.split("T")[0];
          if (!scheduledDate) return false;

          // Include today + future using stable date-only comparisons.
          return scheduledDate >= todayStr && scheduledDate < scheduleEndStr;
        })
        .map((pa: any) => {
          const metrics = readActivityPlanMetrics(pa.activity_plan);
          const commonLoad =
            readCommonLoadEnvelope(pa.activity_plan?.common_load) ??
            commonLoadResultSchema.parse({
              status: "unavailable",
              model: "gradientpeak_relative_load",
              version: "1",
              sport: "other",
              method: null,
              quality: null,
              thresholdEvidence: null,
              evidenceFingerprint: null,
              computedAsOf: new Date().toISOString(),
              contributingDurationSeconds: metrics.estimated_duration ?? null,
              reason: "activity_data_missing",
            });
          const commonValue =
            commonLoad.status === "available" ||
            commonLoad.status === "complete" ||
            commonLoad.status === "partial"
              ? commonLoad
              : null;
          const activityCategories = pa.activity_plan
            ? getPlanCategoryComposition(pa.activity_plan.structure)
            : [];
          return {
            id: pa.id,
            date: pa.scheduled_date,
            isToday: pa.scheduled_date?.startsWith(todayStr) || false,
            isCompleted: completedActivityMap.get(pa.id) || false,
            activityName: pa.activity_plan?.name || "Activity",
            activityType: activityCategories.length === 1 ? (activityCategories[0] ?? null) : null,
            activityKind:
              activityCategories.length === 0
                ? "unknown"
                : activityCategories.length === 1
                  ? "single"
                  : "multisport",
            activityCategories,
            estimatedDuration: metrics.estimated_duration ?? null,
            estimatedDistance: metrics.estimated_distance ?? null,
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
            const targetDateKey = targetDateStr.slice(0, 10);

            // Set goal metrics for display
            goalMetrics = {
              targetCTL,
              targetDate: targetDateStr,
              description: `Target ${targetCTL} CTL by ${targetDate.toLocaleDateString()}`,
            };

            // Calculate the ideal curve from chart start to target date
            // This shows where user should be at each point in time
            const curveStart = chartStartDate < todayDate ? chartStartDate : todayDate;
            const daysToTarget = Math.floor(
              (new Date(`${targetDateKey}T00:00:00.000Z`).getTime() -
                new Date(`${curveStart}T00:00:00.000Z`).getTime()) /
                (1000 * 60 * 60 * 24),
            );

            if (daysToTarget > 0) {
              let idealCTL = startingCTL;

              for (let i = 0; i <= daysToTarget && i <= trendDays + projectionDays; i++) {
                const dateStr = addDaysDateOnlyUtc(curveStart, i);

                // Calculate ideal CTL progression using exponential growth
                // CTL should increase by rampRate per week
                const weeksPassed = i / 7;
                idealCTL = startingCTL * (1 + rampRate) ** weeksPassed;

                // Cap at target CTL
                if (idealCTL > targetCTL) {
                  idealCTL = targetCTL;
                }

                // Only add points that are in our display range
                if (dateStr >= chartStartDate) {
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
        weeklyActualStats.tssComplete && weeklyPlannedStats.tss > 0
          ? Math.round((weeklyActualStats.tss / weeklyPlannedStats.tss) * 100)
          : null;
      const weeklyActivityIds = new Set(
        activities
          .filter((activity) => {
            const activityDate = getScheduledDateKey(
              activity.started_at.toISOString(),
              planningTimezone,
            );
            return activityDate >= currentWeek.startDate && activityDate <= currentWeek.endDate;
          })
          .map((activity) => activity.id),
      );
      const unavailableWeeklyEnvelope = () =>
        commonLoadResultSchema.parse({
          status: "unavailable",
          model: "gradientpeak_relative_load",
          version: "1",
          sport: "other",
          method: null,
          quality: null,
          thresholdEvidence: null,
          evidenceFingerprint: null,
          computedAsOf: new Date().toISOString(),
          contributingDurationSeconds: null,
          reason: "activity_data_missing",
        });
      const weeklyActualCommonLoad = aggregateCommonLoadEnvelopes(
        [...weeklyActivityIds].map(
          (activityId) =>
            readCommonLoadEnvelope(derivedActivityMap.get(activityId)?.common_load) ??
            unavailableWeeklyEnvelope(),
        ),
      );
      const weeklyPlannedCommonLoad = aggregateCommonLoadEnvelopes(
        weeklyPlanned.map((plannedActivity) => {
          const envelope = readCommonLoadEnvelope(
            (plannedActivity.activity_plan as { common_load?: unknown } | null)?.common_load,
          );
          return envelope ?? unavailableWeeklyEnvelope();
        }),
      );

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
        currentStatus: todayStatus,
        trainingLoadState: {
          status: hasCompleteTssSeries && seriesIdentity ? "available" : "unavailable",
          reason:
            hasCompleteTssSeries && seriesIdentity
              ? "complete_identified_series"
              : "mixed_or_incomplete_tss_series",
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
          actual: weeklyActualStats,
          planned: weeklyPlannedStats,
          adherence, // Percentage
        },
        schedule, // List of upcoming (including today)
        trends: fitnessTrends, // Historical actual CTL/ATL/TSB
        projectedLoad,
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

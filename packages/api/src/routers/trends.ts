import { calculateAge, calculateRollingTrainingQuality, getFormStatus } from "@repo/core";
import { buildDailyTssByDateSeries, replayTrainingLoadByDate } from "@repo/core/load";
import { type ActivityRow, activities, profiles, publicActivityCategorySchema } from "@repo/db";
import { and, asc, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import { buildConsistencyMetrics } from "../application/trends/consistencyMetrics";
import { buildVolumeTrends } from "../application/trends/volumeTrends";
import { buildZoneDistributionTrends } from "../application/trends/zoneDistributionTrends";
import { getRequiredDb } from "../db";
import { createActivityAnalysisStore } from "../infrastructure/repositories";
import { buildActivityDerivedSummaryMap, buildDynamicStressSeries } from "../lib/activity-analysis";
import { featureFlags } from "../lib/features";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { buildWorkloadEnvelopes } from "../utils/workload";

const activityTypeSchema = publicActivityCategorySchema;
const isoDatetimeSchema = z.string().datetime({ offset: true });
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date (YYYY-MM-DD)");
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const workloadSourceSchema = z.enum(["trimp", "tss", "mixed", "none"]);
const activityTimestampSchema = z.coerce.date();

function normalizeTrendBoundary(value: string, boundary: "start" | "end") {
  if (isoDatePattern.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const normalized =
      boundary === "start"
        ? new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0))
        : new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 23, 59, 59, 999));

    if (
      normalized.getUTCFullYear() !== year ||
      normalized.getUTCMonth() !== (month ?? 1) - 1 ||
      normalized.getUTCDate() !== day
    ) {
      return null;
    }

    return normalized;
  }

  if (!isoDatetimeSchema.safeParse(value).success) {
    return null;
  }

  const normalized = new Date(value);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

const startDateInputSchema = z.string().transform((value, ctx) => {
  const normalized = normalizeTrendBoundary(value, "start");

  if (!normalized) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Expected ISO datetime with offset or ISO date (YYYY-MM-DD)",
    });
    return z.NEVER;
  }

  return normalized.toISOString();
});

const endDateInputSchema = z.string().transform((value, ctx) => {
  const normalized = normalizeTrendBoundary(value, "end");

  if (!normalized) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Expected ISO datetime with offset or ISO date (YYYY-MM-DD)",
    });
    return z.NEVER;
  }

  return normalized.toISOString();
});

const dateRangeSchema = z
  .object({
    start_date: startDateInputSchema,
    end_date: endDateInputSchema,
  })
  .strict()
  .refine(({ start_date, end_date }) => new Date(end_date) >= new Date(start_date), {
    message: "end_date must be on or after start_date",
    path: ["end_date"],
  });

const volumeTrendsSchema = dateRangeSchema
  .extend({
    groupBy: z.enum(["day", "week", "month"]).default("week"),
    type: activityTypeSchema.optional(),
  })
  .strict();

const performanceTrendsSchema = dateRangeSchema
  .extend({
    type: activityTypeSchema.optional(),
  })
  .strict();

const zoneDistributionTrendsSchema = dateRangeSchema
  .extend({
    metric: z.enum(["power", "heartrate"]).default("power"),
  })
  .strict();

const peakPerformancesSchema = z
  .object({
    type: activityTypeSchema.optional(),
    metric: z.enum(["distance", "speed", "power", "duration", "tss"]),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict();

const trendActivityRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    type: activityTypeSchema,
    started_at: activityTimestampSchema,
    distance_meters: z.number().nullable(),
    moving_seconds: z.number().nullable(),
    duration_seconds: z.number().nullable(),
    avg_speed_mps: z.number().nullable(),
    avg_power: z.number().nullable(),
    avg_heart_rate: z.number().nullable(),
  })
  .strict();

const trendActivitySelect = {
  id: activities.id,
  name: activities.name,
  type: activities.type,
  started_at: activities.started_at,
  finished_at: activities.finished_at,
  duration_seconds: activities.duration_seconds,
  moving_seconds: activities.moving_seconds,
  distance_meters: activities.distance_meters,
  avg_heart_rate: activities.avg_heart_rate,
  max_heart_rate: activities.max_heart_rate,
  avg_power: activities.avg_power,
  max_power: activities.max_power,
  avg_speed_mps: activities.avg_speed_mps,
  max_speed_mps: activities.max_speed_mps,
  normalized_power: activities.normalized_power,
  normalized_speed_mps: activities.normalized_speed_mps,
  normalized_graded_speed_mps: activities.normalized_graded_speed_mps,
};

type TrendActivityRow = Pick<
  ActivityRow,
  | "id"
  | "name"
  | "type"
  | "started_at"
  | "finished_at"
  | "duration_seconds"
  | "moving_seconds"
  | "distance_meters"
  | "avg_heart_rate"
  | "max_heart_rate"
  | "avg_power"
  | "max_power"
  | "avg_speed_mps"
  | "max_speed_mps"
  | "normalized_power"
  | "normalized_speed_mps"
  | "normalized_graded_speed_mps"
>;

const profileTelemetryRowSchema = z
  .object({
    dob: activityTimestampSchema.nullable().optional(),
    gender: z.string().nullable().optional(),
  })
  .strict();

const replayedTrainingLoadPointSchema = z
  .object({
    date: isoDateSchema,
    ctl: z.number().finite(),
    atl: z.number().finite(),
    tsb: z.number().finite(),
    tss: z.number().finite(),
  })
  .strict();

const volumeTrendDataPointSchema = z
  .object({
    date: isoDateSchema,
    totalDistance: z.number().finite(),
    totalTime: z.number().finite(),
    activityCount: z.number().int().nonnegative(),
  })
  .strict();

const volumeTrendsOutputSchema = z
  .object({
    dataPoints: z.array(volumeTrendDataPointSchema),
    totals: z
      .object({
        totalDistance: z.number().finite(),
        totalTime: z.number().finite(),
        totalActivities: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const performanceTrendDataPointSchema = z
  .object({
    date: isoDatetimeSchema,
    activityId: z.string().uuid(),
    activityName: z.string(),
    avgSpeed: z.number().nullable(),
    avgPower: z.number().nullable(),
    avgHeartRate: z.number().nullable(),
    distance: z.number().finite(),
    duration: z.number().finite(),
  })
  .strict();

const performanceTrendsOutputSchema = z
  .object({
    dataPoints: z.array(performanceTrendDataPointSchema),
  })
  .strict();

const trainingLoadTrendDataPointSchema = z
  .object({
    date: isoDateSchema,
    ctl: z.number().finite(),
    atl: z.number().finite(),
    tsb: z.number().finite(),
    tss: z.number().finite(),
  })
  .strict();

const workloadMetricSchema = z
  .object({
    source: workloadSourceSchema.optional(),
  })
  .passthrough();

const workloadEnvelopeSchema = z
  .object({
    acwr: workloadMetricSchema,
    monotony: workloadMetricSchema,
  })
  .strict();

const trainingLoadTrendsOutputSchema = z
  .object({
    dataPoints: z.array(trainingLoadTrendDataPointSchema),
    currentStatus: z
      .object({
        ctl: z.number().finite(),
        atl: z.number().finite(),
        tsb: z.number().finite(),
        form: z.string(),
      })
      .strict()
      .nullable(),
    workload: workloadEnvelopeSchema,
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
        user_age: z.number().finite().nullable(),
        user_gender: z.union([z.literal("male"), z.literal("female")]).nullable(),
        training_quality: z.number().finite().nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();

const intensityZoneSchema = z.enum([
  "recovery",
  "endurance",
  "tempo",
  "threshold",
  "vo2max",
  "anaerobic",
  "neuromuscular",
]);

const zoneDistributionOutputSchema = z
  .object({
    weeklyData: z.array(
      z
        .object({
          weekStart: isoDateSchema,
          totalTSS: z.number().finite(),
          zones: z.record(intensityZoneSchema, z.number().finite()),
        })
        .strict(),
    ),
  })
  .strict();

const consistencyMetricsOutputSchema = z
  .object({
    activityDays: z.array(isoDateSchema),
    weeklyAvg: z.number().finite(),
    currentStreak: z.number().int().nonnegative(),
    longestStreak: z.number().int().nonnegative(),
    totalActivities: z.number().int().nonnegative(),
    totalDays: z.number().int().nonnegative(),
  })
  .strict();

const peakPerformanceItemSchema = z
  .object({
    activityId: z.string().uuid(),
    activityName: z.string(),
    date: isoDatetimeSchema,
    value: z.number().finite(),
    unit: z.string(),
    category: activityTypeSchema,
    rank: z.number().int().positive(),
  })
  .strict();

const peakPerformancesOutputSchema = z
  .object({
    performances: z.array(peakPerformanceItemSchema),
  })
  .strict();

function parseTrendActivityRows(rows: TrendActivityRow[]) {
  return trendActivityRowSchema.array().parse(
    rows.map((activity) => ({
      id: activity.id,
      name: activity.name,
      type: activity.type,
      started_at: activity.started_at,
      distance_meters: activity.distance_meters,
      moving_seconds: activity.moving_seconds,
      duration_seconds: activity.duration_seconds,
      avg_speed_mps: activity.avg_speed_mps,
      avg_power: activity.avg_power,
      avg_heart_rate: activity.avg_heart_rate,
    })),
  );
}

function toDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

export const trendsRouter = createTRPCRouter({
  // ------------------------------
  // Volume Trends - Distance, Time, Activity Count
  // ------------------------------
  getVolumeTrends: protectedProcedure.input(volumeTrendsSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const conditions = [
      eq(activities.profile_id, ctx.session.user.id),
      gte(activities.started_at, new Date(input.start_date)),
      lte(activities.started_at, new Date(input.end_date)),
    ];

    if (input.type) {
      conditions.push(eq(activities.type, input.type));
    }

    const activityRows = parseTrendActivityRows(
      await db
        .select(trendActivitySelect)
        .from(activities)
        .where(and(...conditions))
        .orderBy(asc(activities.started_at)),
    );

    return volumeTrendsOutputSchema.parse(buildVolumeTrends(activityRows, input.groupBy));
  }),

  // ------------------------------
  // Performance Trends - Speed, Power, HR over time
  // ------------------------------
  getPerformanceTrends: protectedProcedure
    .input(performanceTrendsSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const conditions = [
        eq(activities.profile_id, ctx.session.user.id),
        gte(activities.started_at, new Date(input.start_date)),
        lte(activities.started_at, new Date(input.end_date)),
      ];

      if (input.type) {
        conditions.push(eq(activities.type, input.type));
      }

      const activityRows = parseTrendActivityRows(
        await db
          .select(trendActivitySelect)
          .from(activities)
          .where(and(...conditions))
          .orderBy(asc(activities.started_at)),
      );

      if (activityRows.length === 0) {
        return performanceTrendsOutputSchema.parse({ dataPoints: [] });
      }

      const dataPoints = activityRows.map((activity) => {
        return {
          date: activity.started_at.toISOString(),
          activityId: activity.id,
          activityName: activity.name,
          avgSpeed: activity.avg_speed_mps || null,
          avgPower: activity.avg_power || null,
          avgHeartRate: activity.avg_heart_rate || null,
          distance: activity.distance_meters || 0,
          duration: activity.moving_seconds || 0,
        };
      });

      return performanceTrendsOutputSchema.parse({ dataPoints });
    }),

  // ------------------------------
  // Training Load Trends (works WITHOUT training plan)
  // ------------------------------
  getTrainingLoadTrends: protectedProcedure.input(dateRangeSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const startDate = new Date(input.start_date);
    const endDate = new Date(input.end_date);

    const [rawProfile] = await db
      .select({ dob: profiles.dob, gender: profiles.gender })
      .from(profiles)
      .where(eq(profiles.id, ctx.session.user.id))
      .limit(1);

    const profile = rawProfile ? profileTelemetryRowSchema.parse(rawProfile) : null;

    const userAge = calculateAge(profile?.dob?.toISOString() ?? null);
    const userGender =
      profile?.gender === "male" || profile?.gender === "female" ? profile.gender : null;
    const effectiveAge = featureFlags.personalizationAgeConstants ? userAge : undefined;
    const effectiveGender = featureFlags.personalizationGenderAdjustment ? userGender : undefined;

    // Get all activities in the date range plus 42 days before (for CTL calculation)
    const extendedStart = new Date(startDate);
    extendedStart.setDate(startDate.getDate() - 42);

    const rawActivityRows: TrendActivityRow[] = await db
      .select(trendActivitySelect)
      .from(activities)
      .where(
        and(
          eq(activities.profile_id, ctx.session.user.id),
          gte(activities.started_at, extendedStart),
          lte(activities.started_at, endDate),
        ),
      )
      .orderBy(asc(activities.started_at));

    const activityRows = parseTrendActivityRows(rawActivityRows);

    if (activityRows.length === 0) {
      const workload = workloadEnvelopeSchema.parse(buildWorkloadEnvelopes([], startDate, endDate));
      return trainingLoadTrendsOutputSchema.parse({
        dataPoints: [],
        currentStatus: null,
        workload,
      });
    }

    const { byActivityId: derivedActivityMap, byDate: activitiesByDate } =
      await buildDynamicStressSeries({
        store: createActivityAnalysisStore(db),
        profileId: ctx.session.user.id,
        activities: rawActivityRows,
      });

    const rollingTrainingQuality = featureFlags.personalizationTrainingQuality
      ? calculateRollingTrainingQuality(
          activityRows.map((activity) => ({
            started_at: activity.started_at.toISOString(),
            tss: derivedActivityMap.get(activity.id)?.tss ?? null,
            intensity_factor: derivedActivityMap.get(activity.id)?.intensity_factor ?? null,
          })),
        )
      : undefined;

    const replayed = replayedTrainingLoadPointSchema.array().parse(
      replayTrainingLoadByDate({
        dailyTss: buildDailyTssByDateSeries({
          startDate: toDateKey(extendedStart),
          endDate: toDateKey(endDate),
          tssByDate: activitiesByDate,
        }),
        initialCTL: 0,
        initialATL: 0,
        userAge: effectiveAge,
        userGender: effectiveGender,
        trainingQuality: rollingTrainingQuality,
      }),
    );

    // Filter to requested date range and create data points
    const dataPoints = [];
    let finalCTL = 0;
    let finalATL = 0;
    let finalTSB = 0;

    for (const item of replayed) {
      const date = new Date(`${item.date}T00:00:00.000Z`);

      if (date >= startDate && date <= endDate) {
        dataPoints.push({
          date: item.date,
          ctl: Math.round(item.ctl * 10) / 10,
          atl: Math.round(item.atl * 10) / 10,
          tsb: Math.round(item.tsb * 10) / 10,
          tss: item.tss,
        });

        finalCTL = item.ctl;
        finalATL = item.atl;
        finalTSB = item.tsb;
      }
    }

    // Current status
    const currentStatus =
      dataPoints.length > 0
        ? {
            ctl: Math.round(finalCTL * 10) / 10,
            atl: Math.round(finalATL * 10) / 10,
            tsb: Math.round(finalTSB * 10) / 10,
            form: getFormStatus(finalTSB),
          }
        : null;

    const workloadWindowStart = new Date(endDate);
    workloadWindowStart.setDate(endDate.getDate() - 27);
    const workload = workloadEnvelopeSchema.parse(
      buildWorkloadEnvelopes(
        activityRows.map((activity) => ({
          started_at: activity.started_at.toISOString(),
          tss: derivedActivityMap.get(activity.id)?.tss ?? null,
        })),
        workloadWindowStart,
        endDate,
      ),
    );

    return trainingLoadTrendsOutputSchema.parse({
      dataPoints,
      currentStatus,
      workload,
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

  // ------------------------------
  // Zone Distribution Over Time
  // ------------------------------
  getZoneDistributionTrends: protectedProcedure
    .input(zoneDistributionTrendsSchema)
    .query(async ({ ctx, input }) => {
      const startDate = new Date(input.start_date);
      const endDate = new Date(input.end_date);
      const db = getRequiredDb(ctx);

      // Get activities with intensity factor and TSS
      const rawActivityRows: TrendActivityRow[] = await db
        .select(trendActivitySelect)
        .from(activities)
        .where(
          and(
            eq(activities.profile_id, ctx.session.user.id),
            gte(activities.started_at, startDate),
            lte(activities.started_at, endDate),
          ),
        )
        .orderBy(asc(activities.started_at));

      const activityRows = parseTrendActivityRows(rawActivityRows);

      const derivedMap = await buildActivityDerivedSummaryMap({
        store: createActivityAnalysisStore(db),
        profileId: ctx.session.user.id,
        activities: rawActivityRows,
      });

      return zoneDistributionOutputSchema.parse(
        buildZoneDistributionTrends(activityRows, derivedMap),
      );
    }),

  // ------------------------------
  // Consistency Metrics
  // ------------------------------
  getConsistencyMetrics: protectedProcedure.input(dateRangeSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const activityRows = parseTrendActivityRows(
      await db
        .select(trendActivitySelect)
        .from(activities)
        .where(
          and(
            eq(activities.profile_id, ctx.session.user.id),
            gte(activities.started_at, new Date(input.start_date)),
            lte(activities.started_at, new Date(input.end_date)),
          ),
        )
        .orderBy(asc(activities.started_at)),
    );

    return consistencyMetricsOutputSchema.parse(
      buildConsistencyMetrics(activityRows, new Date(input.start_date), new Date(input.end_date)),
    );
  }),

  // ------------------------------
  // Peak Performances / Personal Records
  // ------------------------------
  getPeakPerformances: protectedProcedure
    .input(peakPerformancesSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const conditions = [eq(activities.profile_id, ctx.session.user.id)];

      if (input.type) {
        conditions.push(eq(activities.type, input.type));
      }

      const baseWhere = and(...conditions);
      const activityRows: TrendActivityRow[] =
        input.metric === "distance"
          ? await db
              .select(trendActivitySelect)
              .from(activities)
              .where(baseWhere)
              .orderBy(desc(activities.distance_meters))
              .limit(input.limit)
          : input.metric === "duration"
            ? await db
                .select(trendActivitySelect)
                .from(activities)
                .where(baseWhere)
                .orderBy(desc(activities.moving_seconds))
                .limit(input.limit)
            : input.metric === "speed"
              ? await db
                  .select(trendActivitySelect)
                  .from(activities)
                  .where(and(baseWhere, isNotNull(activities.avg_speed_mps)))
                  .orderBy(desc(activities.avg_speed_mps))
                  .limit(input.limit * 10)
              : input.metric === "power"
                ? await db
                    .select(trendActivitySelect)
                    .from(activities)
                    .where(and(baseWhere, isNotNull(activities.avg_power)))
                    .orderBy(desc(activities.avg_power))
                    .limit(input.limit * 10)
                : await db
                    .select(trendActivitySelect)
                    .from(activities)
                    .where(baseWhere)
                    .orderBy(desc(activities.started_at))
                    .limit(input.limit * 10);

      const parsedActivityRows = parseTrendActivityRows(activityRows);

      if (parsedActivityRows.length === 0) {
        return peakPerformancesOutputSchema.parse({ performances: [] });
      }

      const derivedMap =
        input.metric === "tss"
          ? await buildActivityDerivedSummaryMap({
              store: createActivityAnalysisStore(db),
              profileId: ctx.session.user.id,
              activities: activityRows,
            })
          : null;

      // Map activities to performances with extracted values
      const allPerformances = parsedActivityRows
        .map((activity) => {
          let value: number | null = null;
          let unit = "";

          switch (input.metric) {
            case "distance":
              value = activity.distance_meters;
              unit = "m";
              break;
            case "speed":
              value = activity.avg_speed_mps;
              unit = "m/s";
              break;
            case "power":
              value = activity.avg_power;
              unit = "W";
              break;
            case "duration":
              value = activity.moving_seconds;
              unit = "s";
              break;
            case "tss":
              value = derivedMap?.get(activity.id)?.tss ?? null;
              unit = "TSS";
              break;
          }

          return {
            activityId: activity.id,
            activityName: activity.name,
            date: activity.started_at.toISOString(),
            value,
            unit,
            category: activity.type,
          };
        })
        .filter((performance) => performance.value !== null && performance.value !== undefined);

      // Sort by value descending for JSONB metrics
      if (["speed", "power", "tss"].includes(input.metric)) {
        allPerformances.sort((a, b) => (b.value || 0) - (a.value || 0));
      }

      // Take top N and add ranks
      const performances = allPerformances.slice(0, input.limit).map((perf, index) => ({
        ...perf,
        rank: index + 1,
      }));

      return peakPerformancesOutputSchema.parse({ performances });
    }),
});

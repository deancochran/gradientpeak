import { getLoadBalanceStatus } from "@repo/core";
import { commonLoadHistoryPointSchema, commonLoadHistoryResultSchema } from "@repo/core/load";
import { activities, activitySegments, publicActivityCategorySchema } from "@repo/db";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { readCurrentProfileCommonLoadHistory } from "../application/activities/read-current-profile-common-load-history";
import {
  type NormalizedTrendActivityRow,
  normalizeTrendActivityRows,
  type TrendActivityRow,
} from "../application/trends/activityRows";
import { buildConsistencyMetrics } from "../application/trends/consistencyMetrics";
import { buildPeakPerformances } from "../application/trends/peakPerformances";
import { buildVolumeTrends } from "../application/trends/volumeTrends";
import { buildZoneDistributionTrends } from "../application/trends/zoneDistributionTrends";
import { getRequiredDb } from "../db";
import { createActivityAnalysisStore } from "../infrastructure/repositories";
import {
  buildActivityDerivedSummaryMap,
  loadActivitySegmentsByActivityId,
} from "../lib/activity-analysis";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const activityTypeSchema = publicActivityCategorySchema;
const isoDatetimeSchema = z.string().datetime({ offset: true });
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date (YYYY-MM-DD)");
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

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

const trendActivitySelect = {
  id: activities.id,
  profile_id: activities.profile_id,
  name: activities.name,
  started_at: activities.started_at,
  finished_at: activities.finished_at,
  elapsed_ms: activities.elapsed_ms,
  active_ms: activities.active_ms,
  moving_ms: activities.moving_ms,
  timing_coverage: activities.timing_coverage,
  distance_meters: activities.distance_meters,
  avg_heart_rate: activities.avg_heart_rate,
  max_heart_rate: activities.max_heart_rate,
};

function hasActivityCategory(category: (typeof publicActivityCategorySchema)["_output"]) {
  return sql<boolean>`exists (
    select 1 from ${activitySegments}
    where ${activitySegments.activity_id} = ${activities.id}
      and ${activitySegments.role} = 'activity'
      and ${activitySegments.category} = ${category}
  )`;
}

async function attachTrendSegments(
  db: ReturnType<typeof getRequiredDb>,
  rows: Array<Omit<TrendActivityRow, "segments">>,
): Promise<TrendActivityRow[]> {
  const segments = await loadActivitySegmentsByActivityId(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, segments: segments.get(row.id) ?? [] }));
}

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

const trainingLoadTrendsOutputSchema = z
  .object({
    history: commonLoadHistoryResultSchema,
    dataPoints: z.array(commonLoadHistoryPointSchema),
    currentStatus: z
      .object({
        longTermLoad: z.number().finite(),
        recentLoad: z.number().finite(),
        loadBalance: z.number().finite(),
        loadBalanceStatus: z.string(),
      })
      .strict()
      .nullable(),
    computedAt: z.string().datetime({ offset: true }),
    planningTimezone: z.string().nullable(),
    currentPlanningDate: isoDateSchema.nullable(),
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
      conditions.push(hasActivityCategory(input.type));
    }

    const activityRows = normalizeTrendActivityRows(
      await attachTrendSegments(
        db,
        await db
          .select(trendActivitySelect)
          .from(activities)
          .where(and(...conditions))
          .orderBy(asc(activities.started_at)),
      ),
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
        conditions.push(hasActivityCategory(input.type));
      }

      const activityRows = normalizeTrendActivityRows(
        await attachTrendSegments(
          db,
          await db
            .select(trendActivitySelect)
            .from(activities)
            .where(and(...conditions))
            .orderBy(asc(activities.started_at)),
        ),
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
    const history = await readCurrentProfileCommonLoadHistory({
      db,
      profileId: ctx.session.user.id,
    });
    const dataPoints =
      history.result.status === "available"
        ? history.result.points.filter((point) => {
            const date = new Date(`${point.date}T00:00:00.000Z`);
            return date >= startDate && date <= endDate;
          })
        : [];
    const latest = dataPoints.at(-1) ?? null;
    return trainingLoadTrendsOutputSchema.parse({
      history: history.result,
      dataPoints,
      currentStatus:
        latest === null
          ? null
          : {
              longTermLoad: latest.longTermLoad,
              recentLoad: latest.recentLoad,
              loadBalance: latest.loadBalance,
              loadBalanceStatus: getLoadBalanceStatus(latest.loadBalance),
            },
      computedAt: history.computedAt,
      planningTimezone: history.planningTimezone,
      currentPlanningDate: history.currentPlanningDate,
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
      const rawActivityRows = await attachTrendSegments(
        db,
        await db
          .select(trendActivitySelect)
          .from(activities)
          .where(
            and(
              eq(activities.profile_id, ctx.session.user.id),
              gte(activities.started_at, startDate),
              lte(activities.started_at, endDate),
            ),
          )
          .orderBy(asc(activities.started_at)),
      );

      const activityRows = normalizeTrendActivityRows(rawActivityRows);

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
    const activityRows = normalizeTrendActivityRows(
      await attachTrendSegments(
        db,
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
      ),
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
        conditions.push(hasActivityCategory(input.type));
      }

      const activityRows = await attachTrendSegments(
        db,
        await db
          .select(trendActivitySelect)
          .from(activities)
          .where(and(...conditions))
          .orderBy(desc(activities.started_at))
          .limit(input.limit * 50),
      );

      const parsedActivityRows = normalizeTrendActivityRows(activityRows).sort((left, right) => {
        const value = (row: NormalizedTrendActivityRow) =>
          input.metric === "distance"
            ? row.distance_meters
            : input.metric === "duration"
              ? (row.moving_seconds ?? row.duration_seconds)
              : input.metric === "speed"
                ? row.avg_speed_mps
                : input.metric === "power"
                  ? row.avg_power
                  : null;
        return (value(right) ?? -1) - (value(left) ?? -1);
      });

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

      return peakPerformancesOutputSchema.parse(
        buildPeakPerformances(parsedActivityRows, input.metric, input.limit, derivedMap),
      );
    }),
});

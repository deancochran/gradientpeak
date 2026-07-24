import { activities, activitySegments, publicActivityCategorySchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  type NormalizedTrendActivityRow,
  normalizeTrendActivityRows,
  type TrendActivityRow,
} from "../application/trends/activityRows";
import {
  getTrendsDashboard,
  trendsDashboardOutputSchema,
} from "../application/trends/get-dashboard";
import { buildPeakPerformances } from "../application/trends/peakPerformances";
import { getRequiredDb } from "../db";
import {
  createActivityAnalysisStore,
  createDrizzleTrendsDashboardRepository,
} from "../infrastructure/repositories";
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
  })
  .refine(
    ({ start_date, end_date }) =>
      new Date(end_date).getTime() - new Date(start_date).getTime() <=
      365 * 24 * 60 * 60 * 1000 - 1,
    { message: "Date range must not exceed 365 days", path: ["end_date"] },
  );

const dashboardSchema = dateRangeSchema
  .extend({
    groupBy: z.enum(["day", "week", "month"]).default("week"),
    type: activityTypeSchema.optional(),
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

function createTrendsRouter(
  dependencies: {
    buildDerivedSummaries?: typeof buildActivityDerivedSummaryMap;
    createRepository?: typeof createDrizzleTrendsDashboardRepository;
    createStore?: typeof createActivityAnalysisStore;
  } = {},
) {
  const buildDerivedSummaries =
    dependencies.buildDerivedSummaries ?? buildActivityDerivedSummaryMap;
  const createRepository = dependencies.createRepository ?? createDrizzleTrendsDashboardRepository;
  const createStore = dependencies.createStore ?? createActivityAnalysisStore;

  return createTRPCRouter({
    getDashboard: protectedProcedure
      .input(dashboardSchema)
      .output(trendsDashboardOutputSchema)
      .query(async ({ ctx, input }) => {
        const db = getRequiredDb(ctx);
        const result = await getTrendsDashboard({
          profileId: ctx.session.user.id,
          repository: createRepository(db),
          store: createStore(db),
          buildDerivedSummaries,
          startDate: new Date(input.start_date),
          endDate: new Date(input.end_date),
          groupBy: input.groupBy,
          type: input.type,
        });
        if ("kind" in result) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "Dashboard range contains too much activity data",
          });
        }
        return result;
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
}

export const trendsRouter = createTrendsRouter();

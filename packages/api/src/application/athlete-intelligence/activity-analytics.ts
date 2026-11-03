import { activityObservationQuantificationBundleSchema } from "@repo/core";
import { publicActivityCategorySchema } from "@repo/db";
import { z } from "zod";
import type { DrizzleQueryExecutor } from "../../db";
import {
  createActivityAnalysisStore,
  createDrizzleTrendsDashboardRepository,
} from "../../infrastructure/repositories";
import { buildActivityDerivedSummaryMap } from "../../lib/activity-analysis";
import { getTrendsDashboardProjection, trendsDashboardOutputSchema } from "../trends/get-dashboard";
import { buildPeakPerformances } from "../trends/peakPerformances";

export const athleteActivityAnalyticsRequestSchema = z
  .object({
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    groupBy: z.enum(["day", "week", "month"]).default("week"),
    activityCategory: publicActivityCategorySchema.optional(),
    peakMetric: z.enum(["distance", "speed", "power", "duration", "common_load"]).default("power"),
    peakLimit: z.number().int().min(1).max(50).default(5),
  })
  .strict()
  .superRefine((input, context) => {
    const start = Date.parse(input.startAt);
    const end = Date.parse(input.endAt);
    if (end < start) {
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "endAt must not precede startAt",
      });
    } else if (end - start > 365 * 86_400_000) {
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Activity analytics range must not exceed 365 days",
      });
    }
  });

const peakPerformanceItemSchema = z
  .object({
    activityId: z.string().uuid(),
    activityName: z.string(),
    date: z.string().datetime({ offset: true }),
    value: z.number().finite(),
    unit: z.string(),
    activity_category: publicActivityCategorySchema,
    rank: z.number().int().positive(),
    observationQuantification: activityObservationQuantificationBundleSchema.nullable(),
  })
  .strict();

export const athleteActivityAnalyticsSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      range: z
        .object({
          startAt: z.string().datetime({ offset: true }),
          endAt: z.string().datetime({ offset: true }),
        })
        .strict(),
      dashboard: trendsDashboardOutputSchema,
      peakPerformances: z.array(peakPerformanceItemSchema).max(50),
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.enum(["row_limit_exceeded", "segment_limit_exceeded"]),
    })
    .strict(),
]);

export async function getAthleteActivityAnalytics(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  request: z.output<typeof athleteActivityAnalyticsRequestSchema>;
}) {
  const repository = createDrizzleTrendsDashboardRepository(input.db);
  const store = createActivityAnalysisStore(input.db);
  const startDate = new Date(input.request.startAt);
  const endDate = new Date(input.request.endAt);
  const projection = await getTrendsDashboardProjection({
    profileId: input.profileId,
    repository,
    store,
    buildDerivedSummaries: buildActivityDerivedSummaryMap,
    startDate,
    endDate,
    groupBy: input.request.groupBy,
    ...(input.request.activityCategory === undefined
      ? {}
      : { type: input.request.activityCategory }),
  });
  if ("kind" in projection) {
    return athleteActivityAnalyticsSchema.parse({
      status: "unavailable",
      reason: projection.kind,
    });
  }

  return athleteActivityAnalyticsSchema.parse({
    status: "available",
    range: { startAt: input.request.startAt, endAt: input.request.endAt },
    dashboard: projection.dashboard,
    peakPerformances: buildPeakPerformances(
      projection.normalized,
      input.request.peakMetric,
      input.request.peakLimit,
      projection.derived,
    ).performances,
  });
}

import type { ActivityListDerivedSummary } from "@repo/core";
import type { publicActivityCategorySchema } from "@repo/db";
import { z } from "zod";
import type { ActivityAnalysisStore } from "../../repositories";
import type {
  TrendsDashboardActivityRow,
  TrendsDashboardRepository,
} from "../../repositories/trends-dashboard-repository";
import { normalizeTrendActivityRows, type TrendActivityRow } from "./activityRows";
import { buildConsistencyMetrics } from "./consistencyMetrics";
import { buildVolumeTrends, type VolumeTrendsGroupBy } from "./volumeTrends";
import { buildZoneDistributionTrends } from "./zoneDistributionTrends";

const isoDatetimeSchema = z.string().datetime({ offset: true });
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date (YYYY-MM-DD)");
const intensityZoneSchema = z.enum([
  "recovery",
  "endurance",
  "tempo",
  "threshold",
  "vo2max",
  "anaerobic",
  "neuromuscular",
]);

export const trendsDashboardOutputSchema = z
  .object({
    volume: z
      .object({
        dataPoints: z.array(
          z
            .object({
              date: isoDateSchema,
              totalDistance: z.number().finite(),
              totalTime: z.number().finite(),
              activityCount: z.number().int().nonnegative(),
            })
            .strict(),
        ),
        totals: z
          .object({
            totalDistance: z.number().finite(),
            totalTime: z.number().finite(),
            totalActivities: z.number().int().nonnegative(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    performance: z
      .object({
        dataPoints: z.array(
          z
            .object({
              date: isoDatetimeSchema,
              activityId: z.string().uuid(),
              activityName: z.string(),
              avgSpeed: z.number().finite().nullable(),
              avgPower: z.number().finite().nullable(),
              avgHeartRate: z.number().finite().nullable(),
              distance: z.number().finite(),
              duration: z.number().finite(),
            })
            .strict(),
        ),
      })
      .strict(),
    zones: z
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
      .strict(),
    consistency: z
      .object({
        activityDays: z.array(isoDateSchema),
        weeklyAvg: z.number().finite(),
        currentStreak: z.number().int().nonnegative(),
        longestStreak: z.number().int().nonnegative(),
        totalActivities: z.number().int().nonnegative(),
        totalDays: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

type ActivityCategory = z.infer<typeof publicActivityCategorySchema>;
type DerivedSummaryMap = Map<string, Pick<ActivityListDerivedSummary, "intensity_factor" | "tss">>;

export type BuildDerivedSummaries = (input: {
  activities: TrendActivityRow[];
  profileId: string;
  store: ActivityAnalysisStore;
}) => Promise<DerivedSummaryMap>;

export async function getTrendsDashboard({
  buildDerivedSummaries,
  repository,
  store,
  profileId,
  startDate,
  endDate,
  groupBy,
  type,
}: {
  buildDerivedSummaries: BuildDerivedSummaries;
  endDate: Date;
  groupBy: VolumeTrendsGroupBy;
  profileId: string;
  repository: TrendsDashboardRepository;
  startDate: Date;
  store: ActivityAnalysisStore;
  type?: ActivityCategory;
}) {
  const loaded = await repository.loadDashboardActivities({
    profileId,
    startDate,
    endDate,
    ...(type === undefined ? {} : { type }),
  });
  if (!Array.isArray(loaded)) return loaded;

  const activities: TrendActivityRow[] = (type
    ? loaded
        .map((activity) => ({
          ...activity,
          segments: activity.segments.filter(
            (segment) => segment.role === "activity" && segment.category === type,
          ),
        }))
        .filter((activity) => activity.segments.length > 0)
    : loaded) as TrendsDashboardActivityRow[] as TrendActivityRow[];
  const normalized = normalizeTrendActivityRows(activities);
  const derived =
    activities.length === 0
      ? new Map()
      : await buildDerivedSummaries({ activities, profileId, store });

  return trendsDashboardOutputSchema.parse({
    volume: buildVolumeTrends(normalized, groupBy),
    performance: {
      dataPoints: normalized.map((activity) => ({
        date: activity.started_at.toISOString(),
        activityId: activity.id,
        activityName: activity.name,
        avgSpeed: activity.avg_speed_mps || null,
        avgPower: activity.avg_power || null,
        avgHeartRate: activity.avg_heart_rate || null,
        distance: activity.distance_meters || 0,
        duration: activity.moving_seconds || 0,
      })),
    },
    zones: buildZoneDistributionTrends(normalized, derived),
    consistency: buildConsistencyMetrics(normalized, startDate, endDate),
  });
}

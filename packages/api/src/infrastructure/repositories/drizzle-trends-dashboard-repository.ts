import { activities, activitySegments } from "@repo/db";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../../db";
import {
  MAX_TRENDS_DASHBOARD_ROWS,
  MAX_TRENDS_DASHBOARD_SEGMENTS,
  type TrendsDashboardRepository,
} from "../../repositories/trends-dashboard-repository";

export function createDrizzleTrendsDashboardRepository(
  db: DrizzleQueryExecutor,
): TrendsDashboardRepository {
  return {
    async loadDashboardActivities({ profileId, startDate, endDate, type }) {
      const conditions = [
        eq(activities.profile_id, profileId),
        gte(activities.started_at, startDate),
        lte(activities.started_at, endDate),
      ];
      if (type) {
        conditions.push(sql<boolean>`exists (
          select 1 from ${activitySegments}
          where ${activitySegments.activity_id} = ${activities.id}
            and ${activitySegments.role} = 'activity'
            and ${activitySegments.category} = ${type}
        )`);
      }
      const rows = await db
        .select({
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
        })
        .from(activities)
        .where(and(...conditions))
        .orderBy(asc(activities.started_at), asc(activities.id))
        .limit(MAX_TRENDS_DASHBOARD_ROWS + 1);

      if (rows.length > MAX_TRENDS_DASHBOARD_ROWS) return { kind: "row_limit_exceeded" };
      if (rows.length === 0) return [];

      const segments = await db
        .select({
          id: activitySegments.id,
          activity_id: activitySegments.activity_id,
          ordinal: activitySegments.ordinal,
          role: activitySegments.role,
          category: activitySegments.category,
          start_offset_ms: activitySegments.start_offset_ms,
          end_offset_ms: activitySegments.end_offset_ms,
          timing_coverage: activitySegments.timing_coverage,
          active_ms: activitySegments.active_ms,
          moving_ms: activitySegments.moving_ms,
          summary: activitySegments.summary,
        })
        .from(activitySegments)
        .where(
          inArray(
            activitySegments.activity_id,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(asc(activitySegments.activity_id), asc(activitySegments.ordinal))
        .limit(MAX_TRENDS_DASHBOARD_SEGMENTS + 1);
      if (segments.length > MAX_TRENDS_DASHBOARD_SEGMENTS) {
        return { kind: "segment_limit_exceeded" };
      }
      const segmentsByActivity = new Map<string, (typeof segments)[number][]>();
      for (const segment of segments) {
        const activitySegments = segmentsByActivity.get(segment.activity_id);
        if (activitySegments) {
          activitySegments.push(segment);
        } else {
          segmentsByActivity.set(segment.activity_id, [segment]);
        }
      }
      return rows.map((row) => ({
        ...row,
        segments: segmentsByActivity.get(row.id) ?? [],
      }));
    },
  };
}

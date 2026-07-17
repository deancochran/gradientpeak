import { segmentSummarySchemaV1 } from "@repo/core";
import { type ActivityRow, publicActivityCategorySchema } from "@repo/db";
import { z } from "zod";
import {
  type ActivitySegmentReadRow,
  orderedActivitySegments,
} from "../../lib/activity-analysis/derived";

const activityTimestampSchema = z.coerce.date();

const trendActivityRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    type: publicActivityCategorySchema,
    started_at: activityTimestampSchema,
    distance_meters: z.number().nullable(),
    moving_seconds: z.number().nullable(),
    duration_seconds: z.number().nullable(),
    avg_speed_mps: z.number().nullable(),
    avg_power: z.number().nullable(),
    avg_heart_rate: z.number().nullable(),
  })
  .strict();

export type TrendActivityRow = Pick<
  ActivityRow,
  | "id"
  | "profile_id"
  | "name"
  | "started_at"
  | "finished_at"
  | "elapsed_ms"
  | "active_ms"
  | "moving_ms"
  | "timing_coverage"
  | "distance_meters"
  | "avg_heart_rate"
  | "max_heart_rate"
> & { segments: ActivitySegmentReadRow[] };

export type NormalizedTrendActivityRow = z.infer<typeof trendActivityRowSchema>;

/** One category-safe trend row per ordered activity segment. */
export function normalizeTrendActivityRows(rows: TrendActivityRow[]): NormalizedTrendActivityRow[] {
  return trendActivityRowSchema.array().parse(
    rows.flatMap((activity) =>
      orderedActivitySegments(activity.segments).map((segment) => {
        const summary = segmentSummarySchemaV1.parse(segment.summary);
        const timing = summary.timing;
        const activeMs =
          timing.timingCoverage === "unavailable" || !("activeMs" in timing)
            ? null
            : (timing.activeMs ?? null);
        const movingMs =
          timing.timingCoverage === "unavailable" || !("movingMs" in timing)
            ? null
            : (timing.movingMs ?? null);
        return {
          id: segment.id,
          name: activity.name,
          type: segment.category,
          started_at: new Date(activity.started_at.getTime() + segment.start_offset_ms),
          distance_meters: summary.distanceMeters ?? null,
          moving_seconds: movingMs === null ? null : movingMs / 1_000,
          duration_seconds:
            activeMs === null
              ? (segment.end_offset_ms - segment.start_offset_ms) / 1_000
              : activeMs / 1_000,
          avg_speed_mps: summary.averageSpeedMetersPerSecond ?? null,
          avg_power: summary.averagePowerWatts ?? null,
          avg_heart_rate: summary.averageHeartRateBpm ?? null,
        };
      }),
    ),
  );
}

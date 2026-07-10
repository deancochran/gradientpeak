import { type ActivityRow, publicActivityCategorySchema } from "@repo/db";
import { z } from "zod";

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

export type NormalizedTrendActivityRow = z.infer<typeof trendActivityRowSchema>;

export function normalizeTrendActivityRows(rows: TrendActivityRow[]): NormalizedTrendActivityRow[] {
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

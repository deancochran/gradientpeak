import { schema } from "@repo/db";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../../db";

const activitySummaryRowSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    started_at: z.date(),
    finished_at: z.date().nullable(),
    duration_seconds: z.number().nullable(),
    moving_seconds: z.number().nullable(),
    distance_meters: z.number().nullable(),
    avg_heart_rate: z.number().nullable(),
    max_heart_rate: z.number().nullable(),
    avg_power: z.number().nullable(),
    max_power: z.number().nullable(),
    avg_speed_mps: z.number().nullable(),
    max_speed_mps: z.number().nullable(),
    normalized_power: z.number().nullable(),
    normalized_speed_mps: z.number().nullable(),
    normalized_graded_speed_mps: z.number().nullable(),
  })
  .strict();

export type ActivitySummary = Pick<
  typeof schema.activities.$inferSelect,
  "id" | "type" | "started_at" | "finished_at"
> &
  Pick<
    typeof schema.activities.$inferSelect,
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

export async function listActivitySummariesInRange(
  db: ReturnType<typeof getRequiredDb>,
  input: {
    profileId: string;
    startedAtGte: Date;
    startedAtLte: Date;
  },
): Promise<ActivitySummary[]> {
  const rows = await db
    .select({
      id: schema.activities.id,
      type: schema.activities.type,
      started_at: schema.activities.started_at,
      finished_at: schema.activities.finished_at,
      duration_seconds: schema.activities.duration_seconds,
      moving_seconds: schema.activities.moving_seconds,
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

  return activitySummaryRowSchema.array().parse(rows) as ActivitySummary[];
}

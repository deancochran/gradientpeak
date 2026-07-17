import { publicActivityCategorySchema, schema } from "@repo/db";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import {
  deriveActivityDurations,
  deriveActivityParentClassification,
  loadActivitySegmentsByActivityId,
} from "../../lib/activity-analysis/derived";

const activitySummaryRowSchema = z
  .object({
    id: z.string(),
    type: publicActivityCategorySchema.nullable(),
    kind: z.enum(["single", "multisport", "unknown"]),
    categories: z.array(publicActivityCategorySchema),
    started_at: z.date(),
    finished_at: z.date(),
    duration_seconds: z.number().nullable(),
    moving_seconds: z.number().nullable(),
    elapsed_seconds: z.number(),
    distance_meters: z.number(),
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

export type ActivitySummary = z.infer<typeof activitySummaryRowSchema>;

export async function listActivitySummariesInRange(
  db: ReturnType<typeof getRequiredDb>,
  input: { profileId: string; startedAtGte: Date; startedAtLte: Date },
): Promise<ActivitySummary[]> {
  const rows = await db
    .select({
      id: schema.activities.id,
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
  const segments = await loadActivitySegmentsByActivityId(
    db,
    rows.map((row) => row.id),
  );
  return activitySummaryRowSchema.array().parse(
    rows.map((row) => {
      const classification = deriveActivityParentClassification(segments.get(row.id) ?? []);
      const durations = deriveActivityDurations(row);
      const categoryCompatible = classification.category !== null;
      return {
        id: row.id,
        ...classification,
        started_at: row.started_at,
        finished_at: row.finished_at,
        elapsed_seconds: durations.elapsed_seconds,
        duration_seconds: durations.active_seconds,
        moving_seconds: durations.moving_seconds,
        distance_meters: row.distance_meters,
        avg_heart_rate: row.avg_heart_rate,
        max_heart_rate: row.max_heart_rate,
        avg_power: categoryCompatible ? row.avg_power : null,
        max_power: categoryCompatible ? row.max_power : null,
        avg_speed_mps: categoryCompatible ? row.avg_speed_mps : null,
        max_speed_mps: categoryCompatible ? row.max_speed_mps : null,
        normalized_power: categoryCompatible ? row.normalized_power : null,
        normalized_speed_mps: categoryCompatible ? row.normalized_speed_mps : null,
        normalized_graded_speed_mps: categoryCompatible ? row.normalized_graded_speed_mps : null,
      };
    }),
  );
}

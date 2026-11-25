import { profileMetrics, profiles } from "@repo/db";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

export const ATHLETE_READ_MODEL_CONTEXT_OBSERVATION_LIMIT = 200;
export const ATHLETE_READ_MODEL_TIMELINE_LIMIT = 200;

export async function readAthleteObservationTimeline(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    startAt: Date;
    endAt: Date;
    limit: number;
    metricTypes?: Array<(typeof profileMetrics.$inferSelect)["metric_type"]>;
  },
) {
  const limit = Math.min(input.limit, ATHLETE_READ_MODEL_TIMELINE_LIMIT);
  const rows = await db
    .select()
    .from(profileMetrics)
    .where(
      and(
        eq(profileMetrics.profile_id, input.profileId),
        gte(profileMetrics.recorded_at, input.startAt),
        lte(profileMetrics.recorded_at, input.endAt),
        input.metricTypes && input.metricTypes.length > 0
          ? inArray(profileMetrics.metric_type, input.metricTypes)
          : undefined,
      ),
    )
    .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.id))
    .limit(limit + 1);
  return { items: rows.slice(0, limit), truncated: rows.length > limit };
}

/**
 * Bounded observation/configuration inputs for the read model's planning context.
 * Derived thresholds, calibrations, targets, and raw effort curves are deliberately
 * absent; current values for those concepts come from the published estimates.
 */
export async function readAthleteReadModelContextSources(
  db: DrizzleQueryExecutor,
  input: { profileId: string; asOf: Date },
) {
  const [profileRows, metricRows] = await Promise.all([
    db
      .select({
        id: profiles.id,
        dob: profiles.dob,
        gender: profiles.gender,
        planningTimezone: profiles.planning_timezone,
        preferredUnits: profiles.preferred_units,
      })
      .from(profiles)
      .where(eq(profiles.id, input.profileId))
      .limit(1),
    db
      .select({
        metric_type: profileMetrics.metric_type,
        value: profileMetrics.value,
        unit: profileMetrics.unit,
        recorded_at: profileMetrics.recorded_at,
        notes: profileMetrics.notes,
        reference_activity_id: profileMetrics.reference_activity_id,
        source: profileMetrics.source,
        method: profileMetrics.method,
        calculation_version: profileMetrics.calculation_version,
        quality_score: profileMetrics.quality_score,
        provenance: profileMetrics.provenance,
      })
      .from(profileMetrics)
      .where(
        and(
          eq(profileMetrics.profile_id, input.profileId),
          lte(profileMetrics.recorded_at, input.asOf),
        ),
      )
      .orderBy(desc(profileMetrics.recorded_at), desc(profileMetrics.id))
      .limit(ATHLETE_READ_MODEL_CONTEXT_OBSERVATION_LIMIT + 1),
  ]);

  return {
    profile: profileRows[0] ?? null,
    observations: metricRows.slice(0, ATHLETE_READ_MODEL_CONTEXT_OBSERVATION_LIMIT),
    observationsTruncated: metricRows.length > ATHLETE_READ_MODEL_CONTEXT_OBSERVATION_LIMIT,
  };
}

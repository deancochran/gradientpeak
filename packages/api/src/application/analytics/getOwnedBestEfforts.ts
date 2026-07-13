import {
  canonicalizeActivityEffortObservation,
  getActivityEffortObservationStatus,
} from "@repo/core/athlete-inputs";
import { type BestEffort, BestEffortSchema } from "@repo/core/schemas/activity_efforts";
import {
  activityEfforts,
  type publicActivityCategorySchema,
  publicActivityEffortsRowSchema,
  type publicEffortTypeSchema,
} from "@repo/db";
import { and, eq, gte } from "drizzle-orm";
import type { z } from "zod";
import type { getRequiredDb } from "../../db";

type DbClient = ReturnType<typeof getRequiredDb>;
type ActivityEffortRow = z.infer<typeof publicActivityEffortsRowSchema>;

export type ObservedBestEffort = BestEffort &
  Pick<
    ActivityEffortRow,
    "activity_id" | "source" | "method" | "calculation_version" | "provenance"
  >;

export type AnalyticsEffortFilters = {
  activity_category: z.infer<typeof publicActivityCategorySchema>;
  effort_type: z.infer<typeof publicEffortTypeSchema>;
  days: number;
};

export async function getOwnedBestEfforts(
  db: DbClient,
  input: AnalyticsEffortFilters,
  profileId: string,
): Promise<ObservedBestEffort[]> {
  const cutoffDate = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(activityEfforts)
    .where(
      and(
        eq(activityEfforts.profile_id, profileId),
        eq(activityEfforts.activity_category, input.activity_category),
        eq(activityEfforts.effort_type, input.effort_type),
        gte(activityEfforts.recorded_at, cutoffDate),
      ),
    );

  return rows
    .map((row) => publicActivityEffortsRowSchema.parse(row))
    .filter(isTrustedObservedEffort)
    .map(toBestEffort);
}

function isTrustedObservedEffort(row: ActivityEffortRow): boolean {
  return (
    getActivityEffortObservationStatus({
      activityCategory: row.activity_category,
      effortType: row.effort_type,
      durationSeconds: row.duration_seconds,
      value: row.value,
      unit: row.unit,
      activityId: row.activity_id,
      source: row.source,
      method: row.method,
      provenance: row.provenance,
    }) === "observed"
  );
}

function toBestEffort(row: ActivityEffortRow): ObservedBestEffort {
  const canonical = canonicalizeActivityEffortObservation({
    effortType: row.effort_type,
    value: row.value,
    unit: row.unit,
  });
  if (!canonical) throw new Error("Eligible activity effort has an unsupported unit");
  const effort = BestEffortSchema.parse({
    activity_category: row.activity_category,
    duration_seconds: row.duration_seconds,
    effort_type: row.effort_type,
    value: canonical.value,
    unit: canonical.unit,
    recorded_at: row.recorded_at.toISOString(),
  });

  return {
    ...effort,
    activity_id: row.activity_id,
    source: row.source,
    method: row.method,
    calculation_version: row.calculation_version,
    provenance: row.provenance,
  };
}

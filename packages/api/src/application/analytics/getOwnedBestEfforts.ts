import { type BestEffort, BestEffortSchema } from "@repo/core/schemas/activity_efforts";
import {
  activityEfforts,
  type publicActivityCategorySchema,
  publicActivityEffortsRowSchema,
  type publicEffortTypeSchema,
} from "@repo/db";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import type { z } from "zod";
import type { getRequiredDb } from "../../db";

type DbClient = ReturnType<typeof getRequiredDb>;

export type AnalyticsEffortFilters = {
  activity_category: z.infer<typeof publicActivityCategorySchema>;
  effort_type: z.infer<typeof publicEffortTypeSchema>;
  days: number;
};

export async function getOwnedBestEfforts(
  db: DbClient,
  input: AnalyticsEffortFilters,
  profileId: string,
): Promise<BestEffort[]> {
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
        isNotNull(activityEfforts.activity_id),
      ),
    );

  return rows.map((row) => toBestEffort(publicActivityEffortsRowSchema.parse(row)));
}

function toBestEffort(row: z.infer<typeof publicActivityEffortsRowSchema>): BestEffort {
  return BestEffortSchema.parse({
    activity_category: row.activity_category,
    duration_seconds: row.duration_seconds,
    effort_type: row.effort_type,
    value: row.value,
    unit: row.unit,
    recorded_at: row.recorded_at.toISOString(),
  });
}

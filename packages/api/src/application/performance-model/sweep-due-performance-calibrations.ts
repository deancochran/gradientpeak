import { sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { markAthleteStateDirty } from "../../repositories/athlete-state-repository";
import {
  readCalibrationAsOf,
  readCalibrationsByIds,
  readDueCalibrationIds,
} from "../../repositories/performance-calibration-repository";

type DbClient = ReturnType<typeof getRequiredDb>;

/** Bounded server-owned expiry sweep; dirties publication without duplicating stale history. */
export async function sweepDuePerformanceCalibrations(
  db: DbClient,
  input: { now: Date; limit: number },
) {
  const limit = Math.max(1, Math.min(input.limit, 100));
  return db.transaction(async (tx) => {
    const ids = await readDueCalibrationIds(tx, { now: input.now, limit });
    const rows = await readCalibrationsByIds(tx, ids);
    rows.sort(
      (left, right) =>
        left.profile_id.localeCompare(right.profile_id) ||
        left.expires_at.getTime() - right.expires_at.getTime() ||
        left.id.localeCompare(right.id),
    );
    let changed = 0;
    for (const row of rows) {
      if (
        row.activity_category !== "bike" &&
        row.activity_category !== "run" &&
        row.activity_category !== "swim"
      ) {
        continue;
      }
      await tx.execute(
        // Shared with activity reconciliation and athlete-state publication.
        // The row is re-resolved after this lock, so a newer calibration wins.
        sql`select pg_advisory_xact_lock(hashtextextended(${row.profile_id}, 0))`,
      );
      const current = await readCalibrationAsOf(tx, {
        profileId: row.profile_id,
        identity: { metricKey: row.metric_key, activityCategory: row.activity_category },
        asOf: input.now,
      });
      if (current?.id !== row.id || Date.parse(current.expiresAt) > input.now.getTime()) continue;
      await markAthleteStateDirty(tx, {
        profileId: row.profile_id,
        effectiveAt: row.expires_at,
        now: input.now,
      });
      changed += 1;
    }
    return { claimed: ids.length, changed };
  });
}

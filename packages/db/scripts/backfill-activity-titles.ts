#!/usr/bin/env tsx

import { type CanonicalActivityCategory, completedActivityTitle } from "@repo/core";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { activities, activitySegments, profiles } from "../src/schema/tables";
import { requireExplicitLocalTarget } from "./_target-safety";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const databaseUrl = requireExplicitLocalTarget(args);
const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle({ client: pool, casing: "snake_case" });

try {
  const rows = await db
    .select({
      id: activities.id,
      name: activities.name,
      startedAt: activities.started_at,
      planningTimezone: profiles.planning_timezone,
      activityCategory: activitySegments.activity_category,
    })
    .from(activities)
    .innerJoin(profiles, eq(profiles.id, activities.profile_id))
    .leftJoin(
      activitySegments,
      and(
        eq(activitySegments.activity_id, activities.id),
        isNotNull(activitySegments.activity_category),
      ),
    )
    .orderBy(asc(activities.id), asc(activitySegments.ordinal));

  const activityById = new Map<
    string,
    {
      name: string;
      startedAt: Date;
      planningTimezone: string | null;
      activityCategory: CanonicalActivityCategory;
    }
  >();
  for (const row of rows) {
    if (activityById.has(row.id)) continue;
    activityById.set(row.id, {
      name: row.name,
      startedAt: row.startedAt,
      planningTimezone: row.planningTimezone,
      activityCategory: row.activityCategory ?? "other",
    });
  }

  const changes = [...activityById].flatMap(([id, activity]) => {
    const name = completedActivityTitle(activity);
    return name === activity.name ? [] : [{ id, name }];
  });

  if (dryRun) {
    console.log(`[db:backfill-activity-titles] Would update ${changes.length} activities.`);
    for (const change of changes) console.log(`  ${change.id}: ${change.name}`);
  } else {
    await db.transaction(async (tx) => {
      for (const change of changes) {
        await tx
          .update(activities)
          .set({ name: change.name, updated_at: new Date() })
          .where(eq(activities.id, change.id));
      }
    });
    console.log(`[db:backfill-activity-titles] Updated ${changes.length} activities.`);
  }
} finally {
  await pool.end();
}

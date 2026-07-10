import { activityEfforts, publicActivityEffortsRowSchema } from "@repo/db";
import { desc, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

type DbClient = ReturnType<typeof getRequiredDb>;

/** Returns validated activity efforts owned by a profile, newest first. */
export async function listOwnedActivityEfforts(db: DbClient, profileId: string) {
  const rows = await db
    .select()
    .from(activityEfforts)
    .where(eq(activityEfforts.profile_id, profileId))
    .orderBy(desc(activityEfforts.recorded_at));

  return publicActivityEffortsRowSchema.array().parse(rows);
}

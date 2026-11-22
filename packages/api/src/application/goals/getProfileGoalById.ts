import { profileGoalRecordSchema } from "@repo/core";
import { profileGoals } from "@repo/db";
import { eq } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../../db";

export type ProfileGoalRecord = ReturnType<typeof profileGoalRecordSchema.parse>;

/** Reads only the opaque owner identifier needed to authorize a later goal read. */
export async function getProfileGoalOwnerId(
  db: DrizzleQueryExecutor,
  id: string,
): Promise<string | null> {
  const [row] = await db
    .select({ profile_id: profileGoals.profile_id })
    .from(profileGoals)
    .where(eq(profileGoals.id, id))
    .limit(1);
  return row?.profile_id ?? null;
}

export async function getProfileGoalById(
  db: DrizzleQueryExecutor,
  id: string,
): Promise<ProfileGoalRecord | null> {
  const row =
    (
      await db
        .select({
          id: profileGoals.id,
          profile_id: profileGoals.profile_id,
          target_date: profileGoals.target_date,
          title: profileGoals.title,
          priority: profileGoals.priority,
          activity_category: profileGoals.activity_category,
          target_payload: profileGoals.target_payload,
        })
        .from(profileGoals)
        .where(eq(profileGoals.id, id))
        .limit(1)
    )[0] ?? null;

  return row ? profileGoalRecordSchema.parse(row) : null;
}

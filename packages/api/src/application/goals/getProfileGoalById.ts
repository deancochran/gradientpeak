import { profileGoalRecordSchema } from "@repo/core";
import { profileGoals } from "@repo/db";
import { eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

type GoalsDb = ReturnType<typeof getRequiredDb>;

export type ProfileGoalRecord = ReturnType<typeof profileGoalRecordSchema.parse>;

export async function getProfileGoalById(
  db: GoalsDb,
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

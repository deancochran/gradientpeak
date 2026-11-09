import { activities, activitySessionRpeEvidence, manualTrainingDiaryOperations } from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

export async function findManualDiaryOperation(
  db: DrizzleQueryExecutor,
  input: { profileId: string; operationId: string },
) {
  const [row] = await db
    .select()
    .from(manualTrainingDiaryOperations)
    .where(
      and(
        eq(manualTrainingDiaryOperations.profile_id, input.profileId),
        eq(manualTrainingDiaryOperations.operation_id, input.operationId),
      ),
    )
    .limit(1);
  return row;
}

export async function findOwnedManualDiaryActivity(
  db: DrizzleQueryExecutor,
  input: { activityId: string; profileId: string },
) {
  const [row] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)))
    .limit(1);
  return row;
}

export async function findSessionRpeOperation(
  db: DrizzleQueryExecutor,
  input: { operationId: string; profileId: string },
) {
  const [row] = await db
    .select({ activityId: activitySessionRpeEvidence.activity_id })
    .from(activitySessionRpeEvidence)
    .where(
      and(
        eq(activitySessionRpeEvidence.profile_id, input.profileId),
        eq(activitySessionRpeEvidence.operation_id, input.operationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

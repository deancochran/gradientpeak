import { plannedSessionActivityPlanId } from "@repo/core/calendar";
import type { DrizzleQueryExecutor, DrizzleTransactionClient } from "../../db";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories/drizzle-planned-session-repository";
import { duplicateActivityPlan } from "../activity-plans/duplicate-activity-plan";
import {
  PlannedSessionNotFoundError,
  PlannedSessionStaleRevisionError,
  PlannedSessionStateConflictError,
  requireUpdatedPlannedSession,
} from "./planned-session-errors";

/**
 * Duplicates only the scheduled occurrence's currently referenced plan and
 * atomically points that occurrence at the new private copy. Source provenance
 * stays untouched; the revision fence deliberately makes an already-started
 * recording's later completion link conflict rather than changing its evidence.
 */
export async function changePlannedSessionPlan(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  sessionId: string;
  expectedRevision: number;
  newName?: string;
  transaction?: DrizzleTransactionClient;
}) {
  const mutate = async (tx: DrizzleTransactionClient) => {
    const repository = createDrizzlePlannedSessionRepository(tx);
    const current = await repository.getOwned({
      profileId: input.profileId,
      sessionId: input.sessionId,
    });
    if (!current) throw new PlannedSessionNotFoundError("Planned session not found");
    if (current.sessionRevision !== input.expectedRevision) {
      throw new PlannedSessionStaleRevisionError(current.sessionRevision);
    }
    if (current.lifecycle.status !== "scheduled") {
      throw new PlannedSessionStateConflictError("not_scheduled");
    }

    const duplicate = await duplicateActivityPlan({
      db: tx,
      profileId: input.profileId,
      sourceActivityPlanId: plannedSessionActivityPlanId(current),
      ...(input.newName === undefined ? {} : { newName: input.newName }),
    });
    return requireUpdatedPlannedSession(
      await repository.mutateOwned({
        action: "repoint_activity_plan",
        profileId: input.profileId,
        sessionId: input.sessionId,
        expectedRevision: input.expectedRevision,
        activityPlanId: duplicate.id,
      }),
    );
  };
  return input.transaction ? mutate(input.transaction) : input.db.transaction(mutate);
}

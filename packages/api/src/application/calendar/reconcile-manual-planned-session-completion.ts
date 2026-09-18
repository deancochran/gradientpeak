import { activities, activitySegments, plannedSessions } from "@repo/db";
import { and, eq, exists, isNull, ne, sql } from "drizzle-orm";
import type { DrizzleTransactionClient } from "../../db";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import {
  PlannedSessionNotFoundError,
  PlannedSessionStateConflictError,
} from "./planned-session-errors";

export class ManualCompletionReconciliationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualCompletionReconciliationConflictError";
  }
}

/** Replaces only a linked manual diary completion with an explicitly chosen trusted activity. */
export async function reconcileManualPlannedSessionCompletion(input: {
  tx: DrizzleTransactionClient;
  profileId: string;
  sessionId: string;
  expectedRevision: number;
  activityId: string;
  operationId: string;
  reconciledAt: Date;
}) {
  const repository = createDrizzlePlannedSessionRepository(input.tx);
  await input.tx
    .select({ id: plannedSessions.id })
    .from(plannedSessions)
    .where(
      and(eq(plannedSessions.id, input.sessionId), eq(plannedSessions.profile_id, input.profileId)),
    )
    .limit(1)
    .for("update");
  await input.tx
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)))
    .limit(1)
    .for("update");

  const [replayed] = await input.tx
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.profile_id, input.profileId),
        eq(activities.reconciliation_operation_id, input.operationId),
      ),
    )
    .limit(1);
  if (replayed) {
    if (
      replayed.superseded_by_activity_id !== input.activityId ||
      replayed.reconciled_planned_session_id !== input.sessionId
    ) {
      throw new ManualCompletionReconciliationConflictError(
        "Reconciliation operation was already used with different data",
      );
    }
    const session = await repository.getOwned({
      profileId: input.profileId,
      sessionId: input.sessionId,
    });
    if (!session) throw new PlannedSessionNotFoundError();
    if (
      session.lifecycle.status !== "completed" ||
      session.lifecycle.completion.state !== "linked" ||
      session.lifecycle.completion.activityId !== input.activityId
    ) {
      throw new ManualCompletionReconciliationConflictError(
        "Reconciliation replay no longer matches the session",
      );
    }
    return { outcome: "unchanged" as const, session };
  }

  const session = await repository.getOwned({
    profileId: input.profileId,
    sessionId: input.sessionId,
  });
  if (!session) throw new PlannedSessionNotFoundError();
  if (
    session.sessionRevision !== input.expectedRevision ||
    session.lifecycle.status !== "completed" ||
    session.lifecycle.completion.state !== "linked"
  ) {
    throw new PlannedSessionStateConflictError("already_completed");
  }
  const manualActivityId = session.lifecycle.completion.activityId;
  const expectedCategory =
    session.prescription.resolutionManifest.resolved_structure.activity_category;
  await input.tx
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.id, manualActivityId), eq(activities.profile_id, input.profileId)))
    .limit(1)
    .for("update");
  const [manual, target, existingTargetLink] = await Promise.all([
    input.tx
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.id, manualActivityId),
          eq(activities.profile_id, input.profileId),
          eq(activities.entry_provenance, "manual"),
          isNull(activities.superseded_by_activity_id),
        ),
      )
      .limit(1),
    input.tx
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.id, input.activityId),
          eq(activities.profile_id, input.profileId),
          sql`${activities.entry_provenance} is distinct from 'manual'`,
          isNull(activities.superseded_by_activity_id),
          exists(
            input.tx
              .select({ id: activitySegments.id })
              .from(activitySegments)
              .where(
                and(
                  eq(activitySegments.activity_id, activities.id),
                  eq(activitySegments.profile_id, input.profileId),
                  eq(activitySegments.activity_category, expectedCategory),
                ),
              ),
          ),
        ),
      )
      .limit(1),
    input.tx
      .select({ id: plannedSessions.id })
      .from(plannedSessions)
      .where(
        and(
          eq(plannedSessions.profile_id, input.profileId),
          eq(plannedSessions.completed_activity_id, input.activityId),
          ne(plannedSessions.id, input.sessionId),
        ),
      )
      .limit(1),
  ]);
  if (!manual[0]) {
    throw new ManualCompletionReconciliationConflictError(
      "Only an active manual diary completion can be reconciled",
    );
  }
  if (!target[0]) {
    throw new ManualCompletionReconciliationConflictError(
      "Chosen activity is unavailable for trusted reconciliation",
    );
  }
  if (existingTargetLink[0]) {
    throw new ManualCompletionReconciliationConflictError(
      "Chosen activity is already linked to another planned session",
    );
  }

  const [superseded] = await input.tx
    .update(activities)
    .set({
      superseded_by_activity_id: input.activityId,
      superseded_at: input.reconciledAt,
      reconciliation_operation_id: input.operationId,
      reconciled_planned_session_id: input.sessionId,
    })
    .where(and(eq(activities.id, manualActivityId), isNull(activities.superseded_by_activity_id)))
    .returning({ id: activities.id });
  if (!superseded)
    throw new ManualCompletionReconciliationConflictError(
      "Manual completion changed during reconciliation",
    );

  const [relinked] = await input.tx
    .update(plannedSessions)
    .set({
      completed_activity_id: input.activityId,
      session_revision: sql`${plannedSessions.session_revision} + 1`,
      linked_at: input.reconciledAt,
      updated_at: input.reconciledAt,
    })
    .where(
      and(
        eq(plannedSessions.id, input.sessionId),
        eq(plannedSessions.profile_id, input.profileId),
        eq(plannedSessions.session_revision, input.expectedRevision),
        eq(plannedSessions.completed_activity_id, manualActivityId),
        eq(plannedSessions.status, "completed"),
        eq(plannedSessions.completion_state, "linked"),
      ),
    )
    .returning({ id: plannedSessions.id });
  if (!relinked)
    throw new ManualCompletionReconciliationConflictError(
      "Planned session changed during reconciliation",
    );
  const updated = await repository.getOwned({
    profileId: input.profileId,
    sessionId: input.sessionId,
  });
  if (!updated) throw new PlannedSessionNotFoundError();
  return { outcome: "updated" as const, session: updated };
}

import { groupEvents, plannedSessions } from "@repo/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../../db";

export class PlannedSessionGroupEventAssociationConflictError extends Error {
  // biome-ignore lint/security/noSecrets: This is an error class name, not a credential.
  override readonly name = "PlannedSessionGroupEventAssociationConflictError";
}

/**
 * Clears deleted/cancelled group-event links through revisioned API writes.
 * The caller supplies its transaction so event removal and every revision advance commit together.
 */
export async function removeGroupEventAssociationsForDeletion(input: {
  db: DrizzleQueryExecutor;
  groupEventIds: string[];
}): Promise<number> {
  const groupEventIds = [...new Set(input.groupEventIds)];
  if (groupEventIds.length === 0) return 0;

  // Association writes lock this same row before touching planned_sessions. Taking
  // it first prevents a deletion from scanning past an uncommitted late association.
  await input.db
    .select({ id: groupEvents.id })
    .from(groupEvents)
    .where(inArray(groupEvents.id, groupEventIds))
    .orderBy(asc(groupEvents.id))
    .for("update");

  const linkedSessions = await input.db
    .select({
      id: plannedSessions.id,
      profileId: plannedSessions.profile_id,
      groupEventId: plannedSessions.group_event_id,
      sessionRevision: plannedSessions.session_revision,
    })
    .from(plannedSessions)
    .where(inArray(plannedSessions.group_event_id, groupEventIds))
    .orderBy(asc(plannedSessions.profile_id), asc(plannedSessions.id))
    .for("update");

  for (const session of linkedSessions) {
    if (!session.groupEventId) continue;
    const [updated] = await input.db
      .update(plannedSessions)
      .set({
        group_event_id: null,
        session_revision: sql`${plannedSessions.session_revision} + 1`,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(plannedSessions.id, session.id),
          eq(plannedSessions.profile_id, session.profileId),
          eq(plannedSessions.group_event_id, session.groupEventId),
          eq(plannedSessions.session_revision, session.sessionRevision),
        ),
      )
      .returning({ id: plannedSessions.id });
    if (!updated) {
      throw new PlannedSessionGroupEventAssociationConflictError(
        "A planned session changed while its group event was being removed",
      );
    }
  }

  return linkedSessions.length;
}

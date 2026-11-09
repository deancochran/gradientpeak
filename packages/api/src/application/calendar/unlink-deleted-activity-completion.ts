import { plannedSessionMutationSchema } from "../../contracts/planned-sessions";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { requireUpdatedPlannedSession } from "./planned-session-errors";

export async function unlinkDeletedActivityCompletion(input: {
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  sessionId: string;
  expectedRevision: number;
  activityId: string;
  unlinkedAt: string;
}) {
  const mutation = plannedSessionMutationSchema.parse({
    action: "unlink_deleted_activity",
    profileId: input.profileId,
    sessionId: input.sessionId,
    expectedRevision: input.expectedRevision,
    activityId: input.activityId,
    unlinkedAt: input.unlinkedAt,
  });
  return requireUpdatedPlannedSession(await input.repository.mutateOwned(mutation));
}

/** Unlinks every owned completion before the activity's restricting foreign key is deleted. */
export async function unlinkDeletedActivityCompletionsForActivity(input: {
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  activityId: string;
  unlinkedAt: string;
}) {
  const linked = await input.repository.listOwnedLinkedToActivity({
    profileId: input.profileId,
    activityId: input.activityId,
  });
  const sessions = [];
  for (const session of linked) {
    sessions.push(
      await unlinkDeletedActivityCompletion({
        ...input,
        sessionId: session.id,
        expectedRevision: session.sessionRevision,
      }),
    );
  }
  return sessions;
}

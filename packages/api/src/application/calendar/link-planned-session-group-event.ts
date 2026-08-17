import { plannedSessionMutationSchema } from "../../contracts/planned-sessions";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { PlannedSessionAccessError, requireUpdatedPlannedSession } from "./planned-session-errors";

export async function linkPlannedSessionGroupEvent(input: {
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  sessionId: string;
  expectedRevision: number;
  groupEventId: string;
}) {
  if (
    !(await input.repository.groupEventExistsForProfile({
      profileId: input.profileId,
      groupEventId: input.groupEventId,
    }))
  ) {
    throw new PlannedSessionAccessError("Group event is unavailable to this profile");
  }
  return requireUpdatedPlannedSession(
    await input.repository.mutateOwned(
      plannedSessionMutationSchema.parse({
        action: "associate_group_event",
        profileId: input.profileId,
        sessionId: input.sessionId,
        expectedRevision: input.expectedRevision,
        groupEventId: input.groupEventId,
      }),
    ),
  );
}

export async function unlinkPlannedSessionGroupEvent(input: {
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  sessionId: string;
  expectedRevision: number;
  groupEventId: string;
}) {
  return requireUpdatedPlannedSession(
    await input.repository.mutateOwned(
      plannedSessionMutationSchema.parse({
        action: "clear_group_event",
        profileId: input.profileId,
        sessionId: input.sessionId,
        expectedRevision: input.expectedRevision,
        groupEventId: input.groupEventId,
      }),
    ),
  );
}

import { plannedSessionMutationSchema } from "../../contracts/planned-sessions";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { requireUpdatedPlannedSession } from "./planned-session-errors";

export async function linkPlannedSessionCompletion(input: {
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  sessionId: string;
  expectedRevision: number;
  activityId: string;
  linkedAt: string;
}) {
  const mutation = plannedSessionMutationSchema.parse({
    action: "link_completion",
    profileId: input.profileId,
    sessionId: input.sessionId,
    expectedRevision: input.expectedRevision,
    activityId: input.activityId,
    linkedAt: input.linkedAt,
  });
  return requireUpdatedPlannedSession(await input.repository.mutateOwned(mutation));
}

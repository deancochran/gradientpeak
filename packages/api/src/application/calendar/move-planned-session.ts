import { plannedSessionMutationSchema } from "../../contracts/planned-sessions";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { requireUpdatedPlannedSession } from "./planned-session-errors";

export async function movePlannedSession(input: {
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  sessionId: string;
  expectedRevision: number;
  planningDate: string;
}) {
  const mutation = plannedSessionMutationSchema.parse({
    action: "move",
    profileId: input.profileId,
    sessionId: input.sessionId,
    expectedRevision: input.expectedRevision,
    planningDate: input.planningDate,
  });
  return requireUpdatedPlannedSession(await input.repository.mutateOwned(mutation));
}

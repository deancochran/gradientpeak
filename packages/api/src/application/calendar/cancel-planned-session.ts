import { plannedSessionMutationSchema } from "../../contracts/planned-sessions";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { requireUpdatedPlannedSession } from "./planned-session-errors";

export async function cancelPlannedSession(input: {
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  sessionId: string;
  expectedRevision: number;
  reason: "user_requested" | "plan_replaced" | "series_cancelled";
  cancelledAt: string;
}) {
  const mutation = plannedSessionMutationSchema.parse({
    action: "cancel",
    profileId: input.profileId,
    sessionId: input.sessionId,
    expectedRevision: input.expectedRevision,
    reason: input.reason,
    cancelledAt: input.cancelledAt,
  });
  return requireUpdatedPlannedSession(await input.repository.mutateOwned(mutation));
}

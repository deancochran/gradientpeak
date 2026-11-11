import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { PlannedSessionAccessError } from "./planned-session-errors";

/** Reuses the repository's active-membership and event-lifecycle access predicate. */
export async function requirePlannedSessionGroupEventAccess(input: {
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  groupEventId: string;
}) {
  if (
    !(await input.repository.groupEventExistsForProfile({
      profileId: input.profileId,
      groupEventId: input.groupEventId,
    }))
  ) {
    throw new PlannedSessionAccessError("The group event is unavailable to this profile");
  }
}

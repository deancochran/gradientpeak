import { readPlannedSessionsRangeRequestSchema } from "../../contracts/planned-sessions";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";

export const PLANNED_SESSION_RANGE_LIMIT = 5_000;

export async function readPlannedSessionRange(input: {
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  startDate: string;
  endDate: string;
}) {
  const request = readPlannedSessionsRangeRequestSchema.parse({
    profileId: input.profileId,
    range: { startDate: input.startDate, endDate: input.endDate },
  });
  return input.repository.listOwnedRange({
    profileId: request.profileId,
    startDate: request.range.startDate,
    endDate: request.range.endDate,
    limit: PLANNED_SESSION_RANGE_LIMIT,
  });
}

import type { DrizzleQueryExecutor } from "../../db";
import { createOrganizationCoachAthleteRepository } from "../../repositories/organization-coach-athlete-repository";

export class CoachAthleteDirectoryAccessError extends Error {}
/** Exact SQL identity predicate, independent of directory pagination and search. */
export async function findAssignedCoachAthlete(input: {
  db: DrizzleQueryExecutor;
  organizationId: string;
  coachProfileId: string;
  athleteProfileId: string;
}) {
  const repository = createOrganizationCoachAthleteRepository(input.db);
  const rows = await repository.listAssigned({ ...input, limit: 1, cursor: null, search: null });
  return rows[0] ?? null;
}
export async function listAssignedCoachAthletes(input: {
  db: DrizzleQueryExecutor;
  organizationId: string;
  coachProfileId: string;
  limit: number;
  cursor: string | null;
  search: string | null;
}) {
  const repository = createOrganizationCoachAthleteRepository(input.db);
  if (
    !(await repository.hasActiveCoachMembership({
      organizationId: input.organizationId,
      profileId: input.coachProfileId,
    }))
  )
    throw new CoachAthleteDirectoryAccessError();
  const rows = await repository.listAssigned(input);
  const hasMore = rows.length > input.limit;
  const items = rows.slice(0, input.limit);
  return { items, hasMore, nextCursor: hasMore ? (items.at(-1)?.profileId ?? null) : null };
}

import type { CoachAthleteVisualRosterResponse } from "../../contracts/coach-athlete-visual-roster";
import type { DrizzleQueryExecutor } from "../../db";
import { createOrganizationCoachAthleteRepository } from "../../repositories/organization-coach-athlete-repository";
import {
  CoachAthleteDirectoryAccessError,
  listAssignedCoachAthletes,
} from "./list-assigned-coach-athletes";

/**
 * The identity directory remains deliberately identity-only. This separate,
 * bounded projection applies each consent scope inside the data query, so a
 * denied scope never supplies a value that presentation could accidentally use.
 */
export async function readCoachAthleteVisualRoster(input: {
  db: DrizzleQueryExecutor;
  organizationId: string;
  coachProfileId: string;
  limit: number;
  cursor: string | null;
  search: string | null;
}): Promise<CoachAthleteVisualRosterResponse> {
  const page = await listAssignedCoachAthletes(input);
  const repository = createOrganizationCoachAthleteRepository(input.db);
  const facts = await repository.readVisualRosterFacts({
    organizationId: input.organizationId,
    coachProfileId: input.coachProfileId,
    athleteProfileIds: page.items.map((item) => item.profileId),
  });
  const byProfileId = new Map(facts.map((fact) => [fact.profileId, fact]));
  return {
    items: page.items.map((identity) => {
      const fact = byProfileId.get(identity.profileId);
      if (!fact) throw new CoachAthleteDirectoryAccessError();
      return { ...identity, ...fact };
    }),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    // Membership check + bounded identity page + batched scope/data query.
    // This is a fixture-observable count, not a claimed performance threshold.
    queryCount: 3,
  };
}

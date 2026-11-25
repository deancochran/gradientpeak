import type { DrizzleQueryExecutor } from "../../db";
import { createAthleteCoachingPublicationPermissionRepository } from "../../repositories/athlete-coaching-publication-permission-repository";

/**
 * Finds the athlete's own, currently effective coach assignments. This is a
 * self-service permission surface, not an organization-management directory.
 */
export async function listAthletePublicationPermissionOptions(input: {
  athleteProfileId: string;
  db: DrizzleQueryExecutor;
  now: Date;
}) {
  const rows = await createAthleteCoachingPublicationPermissionRepository(
    input.db,
  ).listCurrentOptions(input);
  return {
    options: rows.map((row) => ({
      organization: { id: row.organizationId, name: row.organizationName },
      coach: { membershipId: row.coachMembershipId, name: row.coachName },
      currentGrant: row.currentGrantId ? { id: row.currentGrantId } : null,
    })),
  };
}

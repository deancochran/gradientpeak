import {
  ATHLETE_READ_ACCESS_DENIAL_REASONS,
  type AthleteReadAccessDecision,
  type AthleteReadScope,
  athleteReadAccessDecisionSchema,
} from "@repo/core/organizations";
import { coachingEngagements, organizationMemberships } from "@repo/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleQueryExecutor } from "../db";

const athleteReadDatabaseDecisionSchema = z.enum(["allow", ...ATHLETE_READ_ACCESS_DENIAL_REASONS]);
const athleteReadDecisionRowSchema = z
  .object({ decision: athleteReadDatabaseDecisionSchema })
  .strict();
const athleteReadOrganizationRowSchema = z.object({ organizationId: z.string().uuid() }).strict();

export type AthleteReadAccessRepository = {
  evaluate(input: {
    actorProfileId: string;
    organizationId: string;
    athleteProfileId: string;
    scope: AthleteReadScope;
  }): Promise<AthleteReadAccessDecision>;
  findAuthorizedOrganizationId(input: {
    actorProfileId: string;
    athleteProfileId: string;
    scope: AthleteReadScope;
  }): Promise<string | null>;
};

/**
 * Reads only the authority decision. It never selects athlete-owned data.
 *
 * The database function is deliberately ungranted to user-facing database
 * roles. Only the trusted server connection invokes this repository.
 */
export function createAthleteReadAccessRepository(
  executor: DrizzleQueryExecutor,
): AthleteReadAccessRepository {
  return {
    async evaluate(input) {
      const result = await executor.execute(sql`
        select public.coaching_athlete_read_access_decision(
          ${input.actorProfileId}::uuid,
          ${input.organizationId}::uuid,
          ${input.athleteProfileId}::uuid,
          ${input.scope}
        ) as decision
      `);
      const rawDecision = athleteReadDecisionRowSchema.parse(result.rows[0]).decision;
      return athleteReadAccessDecisionSchema.parse(
        rawDecision === "allow"
          ? { outcome: "allow", scope: input.scope }
          : { outcome: "deny", scope: input.scope, reason: rawDecision },
      );
    },
    async findAuthorizedOrganizationId(input) {
      const [row] = await executor
        .selectDistinct({ organizationId: organizationMemberships.organization_id })
        .from(organizationMemberships)
        .innerJoin(
          coachingEngagements,
          eq(coachingEngagements.organization_id, organizationMemberships.organization_id),
        )
        .where(
          and(
            eq(organizationMemberships.profile_id, input.actorProfileId),
            eq(coachingEngagements.athlete_profile_id, input.athleteProfileId),
            sql`public.coaching_athlete_read_access_decision(
              ${input.actorProfileId}::uuid,
              ${organizationMemberships.organization_id},
              ${input.athleteProfileId}::uuid,
              ${input.scope}
            ) = 'allow'`,
          ),
        )
        .orderBy(asc(organizationMemberships.organization_id))
        .limit(1);
      return row === undefined ? null : athleteReadOrganizationRowSchema.parse(row).organizationId;
    },
  };
}

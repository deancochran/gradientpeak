import {
  ATHLETE_READ_ACCESS_DENIAL_REASONS,
  type AthleteReadAccessDecision,
  type AthleteReadScope,
  athleteReadAccessDecisionSchema,
} from "@repo/core/organizations";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleQueryExecutor } from "../db";

const athleteReadDatabaseDecisionSchema = z.enum(["allow", ...ATHLETE_READ_ACCESS_DENIAL_REASONS]);

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

const uuidSchema = z.string().uuid();

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
      const result = await executor.execute(sql<{ decision: string }>`
        select public.coaching_athlete_read_access_decision(
          ${input.actorProfileId}::uuid,
          ${input.organizationId}::uuid,
          ${input.athleteProfileId}::uuid,
          ${input.scope}
        ) as decision
      `);
      const rawDecision = athleteReadDatabaseDecisionSchema.parse(result.rows[0]?.decision);
      return athleteReadAccessDecisionSchema.parse(
        rawDecision === "allow"
          ? { outcome: "allow", scope: input.scope }
          : { outcome: "deny", scope: input.scope, reason: rawDecision },
      );
    },
    async findAuthorizedOrganizationId(input) {
      const result = await executor.execute(sql<{ organization_id: string }>`
        select candidate.organization_id
        from (
          select distinct membership.organization_id
          from public.organization_memberships as membership
          inner join public.coaching_engagements as engagement
            on engagement.organization_id = membership.organization_id
          where membership.profile_id = ${input.actorProfileId}::uuid
            and engagement.athlete_profile_id = ${input.athleteProfileId}::uuid
        ) as candidate
        where public.coaching_athlete_read_access_decision(
          ${input.actorProfileId}::uuid,
          candidate.organization_id,
          ${input.athleteProfileId}::uuid,
          ${input.scope}
        ) = 'allow'
        order by candidate.organization_id
        limit 1
      `);
      const organizationId = result.rows[0]?.organization_id;
      return organizationId === undefined ? null : uuidSchema.parse(organizationId);
    },
  };
}

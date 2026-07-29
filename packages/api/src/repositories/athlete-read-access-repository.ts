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
};

/**
 * Reads only the authority decision. It never selects athlete-owned data.
 *
 * The database function is deliberately ungranted. This repository must remain
 * unwired until the deployed trusted-server role/identity boundary is proven.
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
  };
}

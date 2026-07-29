import type { AthleteReadAccessDecision, AthleteReadScope } from "@repo/core/organizations";
import type { DrizzleDbClient } from "@repo/db/client";
import type { DrizzleTransactionClient } from "../../db";
import { createAthleteReadAccessRepository } from "../../repositories/athlete-read-access-repository";

export type AuthorizedAthleteReadResult<Value> =
  | { decision: Extract<AthleteReadAccessDecision, { outcome: "deny" }> }
  | {
      decision: Extract<AthleteReadAccessDecision, { outcome: "allow" }>;
      value: Value;
    };

/**
 * Keeps authorization locks and the future allowlisted projection read inside
 * one transaction. No router or athlete projection uses this dormant boundary.
 */
export async function withAuthorizedAthleteRead<Value>(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  athleteProfileId: string;
  scope: AthleteReadScope;
  read: (transaction: DrizzleTransactionClient) => Promise<Value>;
}): Promise<AuthorizedAthleteReadResult<Value>> {
  return input.db.transaction(async (transaction) => {
    const repository = createAthleteReadAccessRepository(transaction);
    const decision = await repository.evaluate({
      actorProfileId: input.actorProfileId,
      organizationId: input.organizationId,
      athleteProfileId: input.athleteProfileId,
      scope: input.scope,
    });
    if (decision.outcome === "deny") return { decision };
    return { decision, value: await input.read(transaction) };
  });
}

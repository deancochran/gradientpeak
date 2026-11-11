import type { AthleteReadAccessDecision, AthleteReadScope } from "@repo/core/organizations";
import type { DrizzleDbClient } from "@repo/db/client";
import { type DrizzleTransactionClient, withRepeatableReadSnapshot } from "../../db";
import { createAthleteReadAccessRepository } from "../../repositories/athlete-read-access-repository";

export type AuthorizedAthleteReadResult<Value> =
  | { decision: Extract<AthleteReadAccessDecision, { outcome: "deny" }> }
  | {
      decision: Extract<AthleteReadAccessDecision, { outcome: "allow" }>;
      value: Value;
    };

export type AnyOrganizationAthleteReadResult<Value> =
  | { outcome: "deny" }
  | { outcome: "allow"; organizationId: string; value: Value };

export type ResolvedAthleteReadResult<Value> =
  | { outcome: "not_found" }
  | { outcome: "deny"; athleteProfileId: string }
  | {
      outcome: "allow";
      athleteProfileId: string;
      organizationId: string | null;
      value: Value;
    };

/** Keeps authorization locks and the allowlisted projection read in one transaction. */
export async function withAuthorizedAthleteRead<Value>(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  athleteProfileId: string;
  scope: AthleteReadScope;
  read: (transaction: DrizzleTransactionClient) => Promise<Value>;
}): Promise<AuthorizedAthleteReadResult<Value>> {
  return withRepeatableReadSnapshot(
    input.db,
    async (transaction) => {
      const repository = createAthleteReadAccessRepository(transaction);
      const decision = await repository.evaluate({
        actorProfileId: input.actorProfileId,
        organizationId: input.organizationId,
        athleteProfileId: input.athleteProfileId,
        scope: input.scope,
      });
      if (decision.outcome === "deny") return { decision };
      return { decision, value: await input.read(transaction) };
    },
    { accessMode: "read write" },
  );
}

/**
 * Resolves any shared organization but authorizes through the same complete,
 * scope-specific consent decision before reading athlete-owned data. Candidate
 * resolution and the protected read remain in the decision function's locking
 * transaction so consent or assignment revocation cannot race the read.
 */
export async function withAuthorizedAthleteReadAcrossOrganizations<Value>(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  athleteProfileId: string;
  scope: AthleteReadScope;
  read: (transaction: DrizzleTransactionClient) => Promise<Value>;
}): Promise<AnyOrganizationAthleteReadResult<Value>> {
  return withRepeatableReadSnapshot(
    input.db,
    async (transaction) => {
      const repository = createAthleteReadAccessRepository(transaction);
      const organizationId = await repository.findAuthorizedOrganizationId({
        actorProfileId: input.actorProfileId,
        athleteProfileId: input.athleteProfileId,
        scope: input.scope,
      });
      if (!organizationId) return { outcome: "deny" };
      return {
        outcome: "allow",
        organizationId,
        value: await input.read(transaction),
      };
    },
    { accessMode: "read write" },
  );
}

/**
 * Resolves only opaque resource ownership, then performs delegated consent
 * authorization and the full resource read in the same transaction.
 */
export async function withResolvedAuthorizedAthleteReadAcrossOrganizations<Value>(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  scope: AthleteReadScope;
  resolveAthleteProfileId: (transaction: DrizzleTransactionClient) => Promise<string | null>;
  read: (transaction: DrizzleTransactionClient, athleteProfileId: string) => Promise<Value>;
}): Promise<ResolvedAthleteReadResult<Value>> {
  return withRepeatableReadSnapshot(
    input.db,
    async (transaction) => {
      const athleteProfileId = await input.resolveAthleteProfileId(transaction);
      if (!athleteProfileId) return { outcome: "not_found" };
      if (input.actorProfileId === athleteProfileId) {
        return {
          outcome: "allow",
          athleteProfileId,
          organizationId: null,
          value: await input.read(transaction, athleteProfileId),
        };
      }

      const repository = createAthleteReadAccessRepository(transaction);
      const organizationId = await repository.findAuthorizedOrganizationId({
        actorProfileId: input.actorProfileId,
        athleteProfileId,
        scope: input.scope,
      });
      if (!organizationId) return { outcome: "deny", athleteProfileId };
      return {
        outcome: "allow",
        athleteProfileId,
        organizationId,
        value: await input.read(transaction, athleteProfileId),
      };
    },
    { accessMode: "read write" },
  );
}

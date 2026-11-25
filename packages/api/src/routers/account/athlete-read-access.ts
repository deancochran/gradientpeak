import type { AthleteReadScope } from "@repo/core/organizations";
import { TRPCError } from "@trpc/server";
import {
  withAuthorizedAthleteReadAcrossOrganizations,
  withResolvedAuthorizedAthleteReadAcrossOrganizations,
} from "../../application/organizations/authorize-athlete-read";
import type { Context } from "../../context";
import { type DrizzleQueryExecutor, getRequiredDb } from "../../db";

export type ConsentAwareAthleteReadAuthorizer = typeof withAuthorizedAthleteReadAcrossOrganizations;
export type ConsentAwareResolvedAthleteReadAuthorizer =
  typeof withResolvedAuthorizedAthleteReadAcrossOrganizations;

/**
 * Preserves owner access while keeping delegated authorization and the scoped
 * athlete read inside one transaction. Callers choose whether a denial is
 * visible as forbidden or hidden as not found.
 */
export async function readProfileWithAthleteConsent<Value>(input: {
  ctx: Context;
  profileId: string;
  scope: AthleteReadScope;
  deniedCode: "FORBIDDEN" | "NOT_FOUND";
  deniedMessage: string;
  read: (db: DrizzleQueryExecutor) => Promise<Value>;
  authorizeRead?: ConsentAwareAthleteReadAuthorizer;
}): Promise<Value> {
  const actorProfileId = input.ctx.session?.user?.id;
  if (!actorProfileId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const db = getRequiredDb(input.ctx);
  if (actorProfileId === input.profileId) return input.read(db);

  const authorizeRead = input.authorizeRead ?? withAuthorizedAthleteReadAcrossOrganizations;
  const result = await authorizeRead({
    db,
    actorProfileId,
    athleteProfileId: input.profileId,
    scope: input.scope,
    read: input.read,
  });
  if (result.outcome === "deny") {
    throw new TRPCError({ code: input.deniedCode, message: input.deniedMessage });
  }
  return result.value;
}

/** Maps transactionally resolved resource ownership and consent to tRPC semantics. */
export async function readResolvedProfileWithAthleteConsent<Value>(input: {
  ctx: Context;
  scope: AthleteReadScope;
  deniedCode: "FORBIDDEN" | "NOT_FOUND";
  deniedMessage: string;
  resolveProfileId: (db: DrizzleQueryExecutor) => Promise<string | null>;
  read: (db: DrizzleQueryExecutor, profileId: string) => Promise<Value>;
  authorizeRead?: ConsentAwareResolvedAthleteReadAuthorizer;
}): Promise<Value> {
  const actorProfileId = input.ctx.session?.user?.id;
  if (!actorProfileId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const authorizeRead = input.authorizeRead ?? withResolvedAuthorizedAthleteReadAcrossOrganizations;
  const result = await authorizeRead({
    db: getRequiredDb(input.ctx),
    actorProfileId,
    scope: input.scope,
    resolveAthleteProfileId: input.resolveProfileId,
    read: input.read,
  });
  if (result.outcome !== "allow") {
    throw new TRPCError({ code: input.deniedCode, message: input.deniedMessage });
  }
  return result.value;
}

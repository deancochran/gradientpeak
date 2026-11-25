import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import {
  activityEfforts,
  follows,
  notifications,
  profileGoals,
  profileMetrics,
  profiles,
  users,
  verifications,
} from "@repo/db/schema";
import { inArray, or } from "drizzle-orm";
import { withLocalE2EDatabase } from "../../support/database";

const TEST_ACTOR_DOMAIN = "@example.test";
const VERIFICATION_CONSUMPTION_ID = /^email-verification:[a-f0-9]{64}$/;

export type AuthArtifactSnapshot = {
  actorEmails: string[];
  verificationConsumptionIds: string[];
};

export class AuthArtifactRegistry {
  readonly #actorEmails = new Set<string>();
  readonly #verificationConsumptionIds = new Set<string>();

  registerActorEmail(email: string) {
    const normalized = email.toLowerCase();
    if (!normalized.endsWith(TEST_ACTOR_DOMAIN)) {
      throw new Error("Auth lane actors must use the reserved example.test domain");
    }
    this.#actorEmails.add(normalized);
  }

  hasActorEmail(email: string) {
    return this.#actorEmails.has(email.toLowerCase());
  }

  registerVerificationConsumptionId(id: string) {
    if (!VERIFICATION_CONSUMPTION_ID.test(id)) {
      throw new Error("Invalid verification-consumption identifier");
    }
    this.#verificationConsumptionIds.add(id);
  }

  drain(): AuthArtifactSnapshot {
    const snapshot = {
      actorEmails: [...this.#actorEmails].sort(),
      verificationConsumptionIds: [...this.#verificationConsumptionIds].sort(),
    };
    this.#actorEmails.clear();
    this.#verificationConsumptionIds.clear();
    return snapshot;
  }
}

const registryStorage = new AsyncLocalStorage<AuthArtifactRegistry>();
let activePlaywrightRegistry: AuthArtifactRegistry | undefined;

export function runWithAuthArtifactRegistry<Result>(
  registry: AuthArtifactRegistry,
  operation: () => Promise<Result>,
) {
  return registryStorage.run(registry, operation);
}

export function activatePlaywrightAuthArtifactRegistry(registry: AuthArtifactRegistry) {
  if (activePlaywrightRegistry) {
    throw new Error("Auth lane artifact registry is already active in this worker");
  }
  activePlaywrightRegistry = registry;
  return () => {
    if (activePlaywrightRegistry === registry) activePlaywrightRegistry = undefined;
  };
}

function currentRegistry() {
  const registry = registryStorage.getStore() ?? activePlaywrightRegistry;
  if (!registry) throw new Error("Auth artifact registration requires the auth lane fixture");
  return registry;
}

export function registerAuthActor(email: string) {
  currentRegistry().registerActorEmail(email);
}

export function registerCapturedVerification(actionUrl: string) {
  const token = new URL(actionUrl).searchParams.get("token");
  if (!token) throw new Error("Captured verification URL is missing its token");
  const digest = createHash("sha256").update(token).digest("hex");
  currentRegistry().registerVerificationConsumptionId(`email-verification:${digest}`);
}

export async function cleanupAuthArtifacts(snapshot: AuthArtifactSnapshot) {
  if (snapshot.actorEmails.length === 0 && snapshot.verificationConsumptionIds.length === 0) {
    return;
  }

  await withLocalE2EDatabase((database) =>
    database.typedTransaction(async (transaction) => {
      if (snapshot.actorEmails.length > 0) {
        const actors = await transaction
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.email, snapshot.actorEmails));
        const actorIds = actors.map((actor) => actor.id);
        if (actorIds.length > 0) {
          await transaction
            .delete(notifications)
            .where(
              or(
                inArray(notifications.user_id, actorIds),
                inArray(notifications.actor_id, actorIds),
              ),
            );
          await transaction
            .delete(follows)
            .where(
              or(inArray(follows.follower_id, actorIds), inArray(follows.following_id, actorIds)),
            );
          await transaction.delete(profileGoals).where(inArray(profileGoals.profile_id, actorIds));
          await transaction
            .delete(profileMetrics)
            .where(inArray(profileMetrics.profile_id, actorIds));
          await transaction
            .delete(activityEfforts)
            .where(inArray(activityEfforts.profile_id, actorIds));
          await transaction.delete(profiles).where(inArray(profiles.id, actorIds));
          await transaction.delete(users).where(inArray(users.id, actorIds));
        }
        await transaction
          .delete(verifications)
          .where(inArray(verifications.identifier, snapshot.actorEmails));
      }
      if (snapshot.verificationConsumptionIds.length > 0) {
        await transaction
          .delete(verifications)
          .where(inArray(verifications.identifier, snapshot.verificationConsumptionIds));
      }
    }),
  );
}

export async function cleanupRegisteredAuthActor(email: string) {
  const registry = currentRegistry();
  if (!registry.hasActorEmail(email)) {
    throw new Error("Refusing to clean an unregistered auth actor");
  }
  await cleanupAuthArtifacts({
    actorEmails: [email.toLowerCase()],
    verificationConsumptionIds: [],
  });
}

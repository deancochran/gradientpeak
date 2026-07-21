import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";

const TEST_ACTOR_DOMAIN = "@example.test";
const VERIFICATION_CONSUMPTION_ID = /^email-verification:[a-f0-9]{64}$/;

export type AuthArtifactSnapshot = {
  actorEmails: string[];
  verificationConsumptionIds: string[];
};

export const AUTH_ARTIFACT_CLEANUP_SQL = {
  activityEfforts: `delete from "activity_efforts" effort
    using "users" u
    where effort."profile_id" = u."id" and u."email" = any($1::text[])`,
  profileGoals: `delete from "profile_goals" goal
    using "users" u
    where goal."profile_id" = u."id" and u."email" = any($1::text[])`,
  profileMetrics: `delete from "profile_metrics" metric
    using "users" u
    where metric."profile_id" = u."id" and u."email" = any($1::text[])`,
  profileTrainingSettings: `delete from "profile_training_settings" settings
    using "users" u
    where settings."profile_id" = u."id" and u."email" = any($1::text[])`,
  notifications: `delete from "notifications" notification
    using "users" u
    where (notification."user_id" = u."id" or notification."actor_id" = u."id")
      and u."email" = any($1::text[])`,
  follows: `delete from "follows" follow
    using "users" u
    where (follow."follower_id" = u."id" or follow."following_id" = u."id")
      and u."email" = any($1::text[])`,
  profiles: `delete from "profiles" p
    using "users" u
    where p."id" = u."id" and u."email" = any($1::text[])`,
  users: `delete from "users" where "email" = any($1::text[])`,
  verificationRows: `delete from "verifications"
    where "identifier" = any($1::text[])`,
  verificationConsumptionMarkers: `delete from "verifications"
    where "id" = any($1::text[])`,
} as const;

export const AUTH_ACTOR_CLEANUP_ORDER = [
  "notifications",
  "follows",
  "profileTrainingSettings",
  "profileGoals",
  "profileMetrics",
  "activityEfforts",
  "profiles",
  "users",
  "verificationRows",
] as const satisfies readonly (keyof typeof AUTH_ARTIFACT_CLEANUP_SQL)[];

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

function localDatabaseUrl() {
  const value =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    // biome-ignore lint/security/noSecrets: Supabase's documented disposable local database URL.
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Auth lane cleanup is restricted to a local PostgreSQL database");
  }
  return value;
}

export async function cleanupAuthArtifacts(snapshot: AuthArtifactSnapshot) {
  if (snapshot.actorEmails.length === 0 && snapshot.verificationConsumptionIds.length === 0) {
    return;
  }

  const pool = new Pool({ connectionString: localDatabaseUrl(), max: 1 });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("begin");
    if (snapshot.actorEmails.length > 0) {
      for (const statement of AUTH_ACTOR_CLEANUP_ORDER) {
        await client.query(AUTH_ARTIFACT_CLEANUP_SQL[statement], [snapshot.actorEmails]);
      }
    }
    if (snapshot.verificationConsumptionIds.length > 0) {
      await client.query(AUTH_ARTIFACT_CLEANUP_SQL.verificationConsumptionMarkers, [
        snapshot.verificationConsumptionIds,
      ]);
    }
    await client.query("commit");
  } catch (error) {
    await client?.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
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

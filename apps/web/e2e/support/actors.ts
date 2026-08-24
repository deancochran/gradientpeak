import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import type {
  APIRequest,
  APIRequestContext,
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
  TestInfo,
  WorkerInfo,
} from "@playwright/test";
import { seedOwnedActivityPlan } from "../seeds/activity-plans";
import { currentContractEpochHeaders } from "../utils/contractEpoch";
import type { E2ECleanupRegistry } from "./cleanup";
import type { LocalE2EDatabase } from "./database";
import { installHydrationAwareNavigation } from "./hydration";
import type { E2EExecutionIdentity } from "./identity";

export type E2EActorRole =
  | "anonymous"
  | "athlete"
  | "coach"
  | "onboarding"
  | "profile"
  | "unverified";
export type AuthenticatedE2EActorRole = Exclude<E2EActorRole, "anonymous">;

export type ActorCleanup = {
  cleanup: (database: LocalE2EDatabase) => Promise<void>;
  id: string;
  kind: string;
};

export type E2EActor = {
  readonly activityPlanId: string | null;
  readonly email: string | null;
  readonly profileId: string | null;
  readonly request: APIRequestContext;
  readonly role: E2EActorRole;
  readonly storageState: string;
  readonly userId: string | null;
  readonly username: string | null;
  createContext(options?: BrowserContextOptions): Promise<BrowserContext>;
  createPage(pathname?: string, options?: BrowserContextOptions): Promise<Page>;
  registerCleanup(cleanup: ActorCleanup): string;
};

export type AuthenticatedE2EActor = E2EActor & {
  readonly email: string;
  readonly password: string;
  readonly profileId: string;
  readonly role: AuthenticatedE2EActorRole;
  readonly userId: string;
};

export type ActorCreateOptions = {
  fullName?: string;
  label?: string;
  primary?: boolean;
  username?: string | null;
};

export type E2EActorFactory = {
  create(
    role: AuthenticatedE2EActorRole,
    options?: ActorCreateOptions,
  ): Promise<AuthenticatedE2EActor>;
  createAnonymous(options?: Pick<ActorCreateOptions, "label">): Promise<E2EActor>;
};

type ActorIdentityInput = {
  identity: E2EExecutionIdentity;
  label: string;
};

type ProvisionInput = ActorIdentityInput & {
  contextOptions: BrowserContextOptions;
  identity: E2EExecutionIdentity;
  options: ActorCreateOptions;
  outputDirectory: string;
  registry: E2ECleanupRegistry;
  role: AuthenticatedE2EActorRole;
};

type AnonymousInput = ActorIdentityInput & {
  contextOptions: BrowserContextOptions;
  outputDirectory: string;
  registry: E2ECleanupRegistry;
};

// biome-ignore lint/security/noSecrets: Public local-only E2E credential, never used outside loopback.
const LOCAL_ACTOR_PASSWORD = "PlaywrightIsolated123!";
const activeActors = new Map<AuthenticatedE2EActorRole, AuthenticatedE2EActor>();

export function isolatedActorIdentity(input: ActorIdentityInput) {
  const digest = input.identity.suffix(`actor-${input.label}`, 64);
  const slug = input.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return {
    digest,
    email: `e2e-${slug || "actor"}-${digest.slice(0, 16)}@gradientpeak.local`,
    loopbackIp: `127.${octet(digest, 0)}.${octet(digest, 2)}.${octet(digest, 4)}`,
    suffix: digest.slice(0, 12),
  } as const;
}

export function currentE2EActor(role: AuthenticatedE2EActorRole = "athlete") {
  const actor = activeActors.get(role);
  if (!actor) throw new Error(`The isolated ${role} E2E actor fixture is not active.`);
  return actor;
}

export class E2EActorPool {
  readonly #actors = new Set<ActorImplementation>();

  constructor(
    private readonly browser: Browser,
    private readonly apiRequest: APIRequest,
    private readonly database: LocalE2EDatabase,
    private readonly baseURL: string,
  ) {
    const url = new URL(baseURL);
    if (!new Set(["127.0.0.1", "localhost", "[::1]"]).has(url.hostname)) {
      throw new Error(`E2E actors may only use a loopback web server; refused ${url.hostname}.`);
    }
  }

  async provision(input: ProvisionInput): Promise<AuthenticatedE2EActor> {
    const identity = isolatedActorIdentity(input);
    const role = input.role;
    const fullName = input.options.fullName ?? actorName(role, identity.suffix);
    const username =
      input.options.username === undefined
        ? actorUsername(role, identity.suffix)
        : input.options.username;
    const request = await this.apiRequest.newContext({
      baseURL: this.baseURL,
      extraHTTPHeaders: {
        ...currentContractEpochHeaders,
        "x-forwarded-for": identity.loopbackIp,
      },
      storageState: undefined,
    });

    let userId = "";
    let activityPlanId: string | null = null;
    try {
      const signUp = await request.post("/api/auth/sign-up/email", {
        data: {
          callbackURL: "/auth/verification-success",
          email: identity.email,
          name: fullName,
          password: LOCAL_ACTOR_PASSWORD,
        },
      });
      if (![200, 201].includes(signUp.status())) {
        throw new Error(
          `Unable to provision isolated ${role} actor (HTTP ${signUp.status()}). ` +
            "The actor identity may have leaked from an earlier interrupted run.",
        );
      }

      const result = await this.database.query<{ id: string }>(
        `update "users" set "email_verified" = true, "updated_at" = now()
         where lower("email") = lower($1) returning "id"`,
        [identity.email],
      );
      userId = result.rows[0]?.id ?? "";
      if (!userId) throw new Error(`The isolated ${role} actor has no Better Auth user row.`);

      await this.database.query(
        `insert into "profiles" (
           "id", "email", "onboarding_status", "username", "full_name", "is_public",
           "default_content_visibility"
         ) values ($1, $2, $3, $4, $5, false, 'private')
         on conflict ("id") do update set
           "email" = excluded."email", "onboarding_status" = excluded."onboarding_status",
           "username" = excluded."username", "full_name" = excluded."full_name",
           "updated_at" = now()`,
        [
          userId,
          identity.email,
          role === "onboarding" || role === "unverified" ? "provider_selection" : "completed",
          role === "onboarding" || role === "unverified" ? null : username,
          role === "onboarding" || role === "unverified" ? null : fullName,
        ],
      );

      if (role === "athlete" || role === "profile") {
        activityPlanId = (await seedOwnedActivityPlan(this.database, userId, identity.digest))
          .activityPlanId;
      }

      const signIn = await request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: LOCAL_ACTOR_PASSWORD },
      });
      if (!signIn.ok()) {
        throw new Error(`Unable to authenticate isolated ${role} actor (HTTP ${signIn.status()}).`);
      }
      if (role === "unverified") {
        await this.database.query(
          'update "users" set "email_verified" = false, "updated_at" = now() where "id" = $1',
          [userId],
        );
      }

      const storageState = await secureStorageStatePath(
        request,
        input.outputDirectory,
        `${role}-${identity.suffix}`,
      );
      const actor = new ActorImplementation({
        activityPlanId,
        baseURL: this.baseURL,
        browser: this.browser,
        contextOptions: input.contextOptions,
        email: identity.email,
        headers: { "x-forwarded-for": identity.loopbackIp },
        password: LOCAL_ACTOR_PASSWORD,
        profileId: userId,
        registry: input.registry,
        request,
        role,
        storageState,
        userId,
        username: role === "onboarding" || role === "unverified" ? null : username,
      });
      this.#actors.add(actor);
      input.registry.registerExactId({
        kind: "isolated-actor",
        id: userId,
        cleanup: async (database) => {
          await database.query(
            `delete from "organization_membership_role_grants"
             where "membership_id" in (
               select "id" from "organization_memberships" where "profile_id" = $1
             )`,
            [userId],
          );
          await database.query('delete from "organization_memberships" where "profile_id" = $1', [
            userId,
          ]);
          await database.query('delete from "profile_training_settings" where "profile_id" = $1', [
            userId,
          ]);
          await database.query('delete from "groups" where "created_by_profile_id" = $1', [userId]);
          await database.query('delete from "activity_artifacts" where "profile_id" = $1', [
            userId,
          ]);
          await database.query('delete from "users" where "id" = $1 and "email" = $2', [
            userId,
            identity.email,
          ]);
        },
      });
      const authenticatedActor = actor as AuthenticatedE2EActor;
      if (input.options.primary !== false && !activeActors.has(role)) {
        activeActors.set(role, authenticatedActor);
      }
      return authenticatedActor;
    } catch (error) {
      await request.dispose().catch(() => undefined);
      if (userId) {
        await this.database
          .query('delete from "users" where "id" = $1 and "email" = $2', [userId, identity.email])
          .catch(() => undefined);
      }
      throw error;
    }
  }

  async anonymous(input: AnonymousInput) {
    const identity = isolatedActorIdentity(input);
    const request = await this.apiRequest.newContext({
      baseURL: this.baseURL,
      extraHTTPHeaders: { "x-forwarded-for": identity.loopbackIp },
      storageState: undefined,
    });
    const storageState = await secureStorageStatePath(
      request,
      input.outputDirectory,
      `anonymous-${identity.suffix}`,
    );
    const actor = new ActorImplementation({
      activityPlanId: null,
      baseURL: this.baseURL,
      browser: this.browser,
      contextOptions: input.contextOptions,
      email: null,
      headers: { "x-forwarded-for": identity.loopbackIp },
      password: null,
      profileId: null,
      registry: input.registry,
      request,
      role: "anonymous",
      storageState,
      userId: null,
      username: null,
    });
    this.#actors.add(actor);
    return actor;
  }

  async dispose() {
    const actors = [...this.#actors].reverse();
    this.#actors.clear();
    activeActors.clear();
    const errors: unknown[] = [];
    for (const actor of actors) {
      try {
        await actor.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Could not close isolated E2E actors");
  }
}

export function createActorFactory(
  pool: E2EActorPool,
  input: {
    contextOptions: BrowserContextOptions;
    identity: E2EExecutionIdentity;
    registry: E2ECleanupRegistry;
    testInfo: TestInfo;
  },
): E2EActorFactory {
  let sequence = 0;
  const common = (label: string) => ({
    contextOptions: input.contextOptions,
    identity: input.identity,
    label,
    outputDirectory: input.testInfo.outputPath(".auth"),
    parallelIndex: input.testInfo.parallelIndex,
    processId: process.pid,
    projectName: input.testInfo.project.name,
    registry: input.registry,
    retry: input.testInfo.retry,
    testId: input.testInfo.testId,
    workerIndex: input.testInfo.workerIndex,
  });
  return {
    create: (role, options = {}) => {
      sequence += 1;
      return pool.provision({
        ...common(options.label ?? `${role}-${sequence}`),
        options,
        role,
      });
    },
    createAnonymous: (options = {}) => {
      sequence += 1;
      return pool.anonymous(common(options.label ?? `anonymous-${sequence}`));
    },
  };
}

export function actorPoolBaseURL(workerInfo: Pick<WorkerInfo, "project">) {
  const baseURL = workerInfo.project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Isolated E2E actors require use.baseURL.");
  return baseURL;
}

class ActorImplementation implements E2EActor {
  readonly activityPlanId: string | null;
  readonly email: string | null;
  readonly password: string | null;
  readonly profileId: string | null;
  readonly request: APIRequestContext;
  readonly role: E2EActorRole;
  readonly storageState: string;
  readonly userId: string | null;
  readonly username: string | null;
  readonly #contexts = new Set<BrowserContext>();

  constructor(
    private readonly input: {
      activityPlanId: string | null;
      baseURL: string;
      browser: Browser;
      contextOptions: BrowserContextOptions;
      email: string | null;
      headers: Record<string, string>;
      password: string | null;
      profileId: string | null;
      registry: E2ECleanupRegistry;
      request: APIRequestContext;
      role: E2EActorRole;
      storageState: string;
      userId: string | null;
      username: string | null;
    },
  ) {
    this.activityPlanId = input.activityPlanId;
    this.email = input.email;
    this.password = input.password;
    this.profileId = input.profileId;
    this.request = input.request;
    this.role = input.role;
    this.storageState = input.storageState;
    this.userId = input.userId;
    this.username = input.username;
  }

  async createContext(options: BrowserContextOptions = {}) {
    const context = await this.input.browser.newContext({
      ...this.input.contextOptions,
      ...options,
      baseURL: options.baseURL ?? this.input.baseURL,
      extraHTTPHeaders: {
        ...this.input.contextOptions.extraHTTPHeaders,
        ...this.input.headers,
        ...options.extraHTTPHeaders,
      },
      storageState: this.storageState,
    });
    this.#contexts.add(context);
    context.on("page", installHydrationAwareNavigation);
    context.once("close", () => this.#contexts.delete(context));
    return context;
  }

  async createPage(pathname = "/", options: BrowserContextOptions = {}) {
    const context = await this.createContext(options);
    const page = installHydrationAwareNavigation(await context.newPage());
    await page.goto(pathname);
    return page;
  }

  registerCleanup(cleanup: ActorCleanup) {
    return this.input.registry.registerExactId(cleanup);
  }

  async dispose() {
    const errors: unknown[] = [];
    for (const context of [...this.#contexts].reverse()) {
      try {
        await context.close();
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      await this.request.dispose();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Could not close E2E actor resources");
  }
}

async function secureStorageStatePath(
  request: APIRequestContext,
  directory: string,
  fileName: string,
) {
  await mkdir(directory, { mode: 0o700, recursive: true });
  await chmod(directory, 0o700);
  const storageState = path.join(directory, `${fileName}.json`);
  await request.storageState({ path: storageState });
  await chmod(storageState, 0o600);
  return storageState;
}

function actorName(role: AuthenticatedE2EActorRole, suffix: string) {
  return `${role[0]?.toUpperCase()}${role.slice(1)} User ${suffix}`;
}

function actorUsername(role: AuthenticatedE2EActorRole, suffix: string) {
  return `playwright_${role}_${suffix}`;
}

function octet(digest: string, offset: number) {
  return (Number.parseInt(digest.slice(offset, offset + 2), 16) % 254) + 1;
}

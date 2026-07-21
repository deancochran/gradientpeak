import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { APIRequestContext, TestInfo } from "@playwright/test";
import { Pool, type PoolClient } from "pg";
import { seedOwnedActivityPlan, TEST_ACTIVITY_PLAN_ID } from "../seeds/activity-plans";
import {
  clearMessagingNotifications,
  seedMessagingNotifications,
} from "../seeds/messaging-notifications";

export { TEST_ACTIVITY_PLAN_ID };

export const TEST_USERS = {
  coach: {
    email: process.env.E2E_COACH_EMAIL ?? "playwright-coach@gradientpeak.local",
    firstName: "Coach",
    lastName: "User",
    // biome-ignore lint/security/noSecrets: Public local-only test actor fallback, overridable by environment.
    password: process.env.E2E_COACH_PASSWORD ?? "PlaywrightPass123!",
    emailVerified: true,
    onboarded: true,
    storageState: fileURLToPath(new URL("../../test-results/.auth/coach.json", import.meta.url)),
    username: "playwright_coach",
  },
  athlete: {
    email: process.env.E2E_ATHLETE_EMAIL ?? "playwright-athlete@gradientpeak.local",
    firstName: "Athlete",
    lastName: "User",
    // biome-ignore lint/security/noSecrets: Public local-only test actor fallback, overridable by environment.
    password: process.env.E2E_ATHLETE_PASSWORD ?? "PlaywrightPass123!",
    emailVerified: true,
    onboarded: true,
    storageState: fileURLToPath(new URL("../../test-results/.auth/athlete.json", import.meta.url)),
    username: "playwright_athlete",
  },
  onboarding: {
    email: process.env.E2E_ONBOARDING_EMAIL ?? "playwright-onboarding@gradientpeak.local",
    firstName: "Onboarding",
    lastName: "User",
    // biome-ignore lint/security/noSecrets: Public local-only test actor fallback, overridable by environment.
    password: process.env.E2E_ONBOARDING_PASSWORD ?? "PlaywrightPass123!",
    emailVerified: true,
    onboarded: false,
    storageState: fileURLToPath(
      new URL("../../test-results/.auth/onboarding.json", import.meta.url),
    ),
    username: null,
  },
  profile: {
    email: process.env.E2E_PROFILE_EMAIL ?? "playwright-profile@gradientpeak.local",
    firstName: "Profile",
    lastName: "User",
    // biome-ignore lint/security/noSecrets: Public local-only test actor fallback, overridable by environment.
    password: process.env.E2E_PROFILE_PASSWORD ?? "PlaywrightPass123!",
    emailVerified: true,
    onboarded: true,
    storageState: fileURLToPath(new URL("../../test-results/.auth/profile.json", import.meta.url)),
    username: "playwright_profile",
  },
  unverified: {
    email: process.env.E2E_UNVERIFIED_EMAIL ?? "playwright-unverified@gradientpeak.local",
    firstName: "Unverified",
    lastName: "User",
    // biome-ignore lint/security/noSecrets: Public local-only test actor fallback, overridable by environment.
    password: process.env.E2E_UNVERIFIED_PASSWORD ?? "PlaywrightPass123!",
    emailVerified: false,
    onboarded: false,
    storageState: fileURLToPath(
      new URL("../../test-results/.auth/unverified.json", import.meta.url),
    ),
    username: null,
  },
} as const;

export type TestUserRole = keyof typeof TEST_USERS;

export type ActivityPlanCleanupIdentity = {
  planNames: readonly string[];
  routeNames?: readonly string[];
};

export const E2E_CLEANUP_SQL = {
  resolveActor: `select p."id"
    from "profiles" p
    inner join "users" u on u."id" = p."id"
    where lower(u."email") = lower($1)
    limit 1`,
  groupComments: `delete from "comments"
    where "entity_type" = 'event'
      and "entity_id" in (
        select ge."id"
        from "group_events" ge
        inner join "groups" g on g."id" = ge."group_id"
        where g."created_by_profile_id" = $1 and g."name" = any($2::text[])
      )`,
  groups: `delete from "groups"
    where "created_by_profile_id" = $1 and "name" = any($2::text[])`,
  activityPlanEventComments: `delete from "comments"
    where "entity_type" = 'event'
      and "entity_id" in (
        select e."id"
        from "events" e
        where e."profile_id" = $1
          and (
            e."activity_plan_id" in (
              select ap."id" from "activity_plans" ap
              where ap."profile_id" = $1 and ap."name" = any($2::text[])
            )
            or e."route_id" in (
              select ar."id" from "activity_routes" ar
              where ar."profile_id" = $1 and ar."name" = any($3::text[])
            )
          )
      )`,
  activityPlanEvents: `delete from "events" e
    where e."profile_id" = $1
      and (
        e."activity_plan_id" in (
          select ap."id" from "activity_plans" ap
          where ap."profile_id" = $1 and ap."name" = any($2::text[])
        )
        or e."route_id" in (
          select ar."id" from "activity_routes" ar
          where ar."profile_id" = $1 and ar."name" = any($3::text[])
        )
      )`,
  activityPlanComments: `delete from "comments"
    where "entity_type" = 'activity_plan'
      and "entity_id" in (
        select ap."id" from "activity_plans" ap
        where ap."profile_id" = $1 and ap."name" = any($2::text[])
      )`,
  activityPlanLikes: `delete from "likes"
    where "entity_type" = 'activity_plan'
      and "entity_id" in (
        select ap."id" from "activity_plans" ap
        where ap."profile_id" = $1 and ap."name" = any($2::text[])
      )`,
  activityPlans: `delete from "activity_plans"
    where "profile_id" = $1 and "name" = any($2::text[])`,
  activityRouteComments: `delete from "comments"
    where "entity_type" = 'route'
      and "entity_id" in (
        select ar."id" from "activity_routes" ar
        where ar."profile_id" = $1 and ar."name" = any($2::text[])
      )`,
  activityRouteLikes: `delete from "likes"
    where "entity_type" = 'route'
      and "entity_id" in (
        select ar."id" from "activity_routes" ar
        where ar."profile_id" = $1 and ar."name" = any($2::text[])
      )`,
  activityRoutes: `delete from "activity_routes"
    where "profile_id" = $1 and "name" = any($2::text[])`,
} as const;

function getLocalDatabaseUrl() {
  const value =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    // biome-ignore lint/security/noSecrets: Supabase's documented local-only database URL.
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(
      "Web E2E actor provisioning is local-only. Set E2E credentials for an existing remote actor instead of mutating a remote database.",
    );
  }
  return value;
}

export function e2eArtifactIdentity(testInfo: TestInfo, label: string) {
  const provenance = [
    testInfo.project.name,
    ...testInfo.titlePath,
    `repeat-${testInfo.repeatEachIndex}`,
  ].join("|");
  const digest = createHash("sha256").update(provenance).digest("hex").slice(0, 12);
  return `Playwright ${label} ${digest}`;
}

export async function runWithE2ECleanup(
  testInfo: TestInfo,
  cleanup: () => Promise<void>,
  run: () => Promise<void>,
) {
  await cleanup();
  let primaryError: unknown;
  let runFailed = false;

  try {
    await run();
  } catch (error) {
    runFailed = true;
    primaryError = error;
  }

  let cleanupError: unknown;
  let cleanupFailed = false;
  try {
    await cleanup();
  } catch (error) {
    cleanupFailed = true;
    cleanupError = error;
    if (runFailed) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: error instanceof Error ? error.message : String(error),
      });
      await testInfo
        .attach("e2e-cleanup-error.txt", {
          body: Buffer.from(error instanceof Error ? error.stack || error.message : String(error)),
          contentType: "text/plain",
        })
        .catch(() => undefined);
    }
  }

  if (runFailed) throw primaryError;
  if (cleanupFailed) throw cleanupError;
}

export async function cleanupOwnedGroups(
  groupNames: readonly string[],
  actorEmail = TEST_USERS.athlete.email,
) {
  const names = validatedCleanupNames(groupNames, "group");
  await withLocalCleanup(async (client, actorProfileId) => {
    const parameters = [actorProfileId, names];
    await client.query(E2E_CLEANUP_SQL.groupComments, parameters);
    // Group-owned events, RSVPs, memberships, invitations, and join requests cascade here.
    await client.query(E2E_CLEANUP_SQL.groups, parameters);
  }, actorEmail);
}

export async function cleanupOwnedActivityPlans(
  identity: ActivityPlanCleanupIdentity,
  actorEmail = TEST_USERS.athlete.email,
) {
  const planNames = validatedCleanupNames(identity.planNames, "activity plan");
  const routeNames = validatedCleanupNames(identity.routeNames ?? [], "activity route", true);

  await withLocalCleanup(async (client, actorProfileId) => {
    const eventParameters = [actorProfileId, planNames, routeNames];
    await client.query(E2E_CLEANUP_SQL.activityPlanEventComments, eventParameters);
    await client.query(E2E_CLEANUP_SQL.activityPlanEvents, eventParameters);

    const planParameters = [actorProfileId, planNames];
    await client.query(E2E_CLEANUP_SQL.activityPlanComments, planParameters);
    await client.query(E2E_CLEANUP_SQL.activityPlanLikes, planParameters);
    await client.query(E2E_CLEANUP_SQL.activityPlans, planParameters);

    if (routeNames.length > 0) {
      const routeParameters = [actorProfileId, routeNames];
      await client.query(E2E_CLEANUP_SQL.activityRouteComments, routeParameters);
      await client.query(E2E_CLEANUP_SQL.activityRouteLikes, routeParameters);
      await client.query(E2E_CLEANUP_SQL.activityRoutes, routeParameters);
    }
  }, actorEmail);
}

function validatedCleanupNames(
  values: readonly string[],
  artifactType: string,
  allowEmpty = false,
) {
  const names = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (!allowEmpty && names.length === 0) {
    throw new Error(`At least one named ${artifactType} identity is required for E2E cleanup.`);
  }
  return names;
}

async function withLocalCleanup(
  cleanup: (client: PoolClient, actorProfileId: string) => Promise<void>,
  actorEmail: string,
) {
  const pool = new Pool({ connectionString: getLocalDatabaseUrl() });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const actorResult = await client.query<{ id: string }>(E2E_CLEANUP_SQL.resolveActor, [
      actorEmail,
    ]);
    const actorProfileId = actorResult.rows[0]?.id;
    if (actorProfileId) await cleanup(client, actorProfileId);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function acquireTestActorLock(_role: TestUserRole) {
  const pool = new Pool({ connectionString: getLocalDatabaseUrl() });
  const client = await pool.connect();
  const lockName = "gradientpeak-web-e2e:shared-actor-state";

  try {
    // biome-ignore lint/security/noSecrets: Static PostgreSQL advisory-lock query, not a credential.
    await client.query("select pg_advisory_lock(hashtext($1))", [lockName]);
  } catch (error) {
    client.release();
    await pool.end();
    throw error;
  }

  return async () => {
    try {
      // biome-ignore lint/security/noSecrets: Static PostgreSQL advisory-unlock query, not a credential.
      await client.query("select pg_advisory_unlock(hashtext($1))", [lockName]);
    } finally {
      client.release();
      await pool.end();
    }
  };
}

async function signIn(request: APIRequestContext, role: TestUserRole) {
  const actor = TEST_USERS[role];
  return request.post("/api/auth/sign-in/email", {
    data: { email: actor.email, password: actor.password },
  });
}

async function provisionActor(request: APIRequestContext, role: TestUserRole) {
  const actor = TEST_USERS[role];
  const signUpResponse = await request.post("/api/auth/sign-up/email", {
    data: {
      callbackURL: "/auth/verification-success",
      email: actor.email,
      name: `${actor.firstName} ${actor.lastName}`,
      password: actor.password,
    },
  });

  if (![200, 201, 409, 422].includes(signUpResponse.status())) {
    throw new Error(`Unable to provision the ${role} E2E actor (HTTP ${signUpResponse.status()}).`);
  }

  const pool = new Pool({ connectionString: getLocalDatabaseUrl() });
  try {
    const result = await pool.query(
      'update "users" set "email_verified" = true, "updated_at" = now() where "email" = $1 returning "id"',
      [actor.email],
    );
    if (result.rowCount !== 1) {
      throw new Error(`The ${role} E2E actor was not created in Better Auth.`);
    }
  } finally {
    await pool.end();
  }
}

export async function authenticateTestActor(
  request: APIRequestContext,
  role: TestUserRole,
  options: { persistStorageState?: boolean } = {},
) {
  let response = await signIn(request, role);
  if (!response.ok()) {
    await provisionActor(request, role);
    response = await signIn(request, role);
  }

  if (!response.ok()) {
    throw new Error(
      `Unable to authenticate the ${role} E2E actor (HTTP ${response.status()}). Reset the local database or provide matching E2E_${role.toUpperCase()}_* credentials.`,
    );
  }

  if (options.persistStorageState !== false) {
    await request.storageState({ path: TEST_USERS[role].storageState });
  }
  await resetActorProfileState(role);
}

async function resetActorProfileState(role: TestUserRole) {
  const actor = TEST_USERS[role];
  const pool = new Pool({ connectionString: getLocalDatabaseUrl() });
  try {
    const userResult = await pool.query(
      'update "users" set "email_verified" = $2, "updated_at" = now() where "email" = $1 returning "id"',
      [actor.email, actor.emailVerified],
    );
    const userId = userResult.rows[0]?.id;
    if (typeof userId !== "string") {
      throw new Error(`The ${role} E2E actor is missing its Better Auth user.`);
    }

    await pool.query(
      `insert into "profiles" (
        "id", "email", "onboarded", "username", "full_name", "is_public", "default_content_visibility"
      ) values ($1, $2, $3, $4, $5, false, 'private')
      on conflict ("id") do update set
        "email" = excluded."email",
        "onboarded" = excluded."onboarded",
        "username" = excluded."username",
        "full_name" = excluded."full_name",
        "updated_at" = now()`,
      [
        userId,
        actor.email,
        actor.onboarded,
        actor.username,
        actor.onboarded ? `${actor.firstName} ${actor.lastName}` : null,
      ],
    );

    if (role === "athlete") {
      await seedOwnedActivityPlan(pool, userId);
    }
  } finally {
    await pool.end();
  }
}

export async function resetLocalAuthRateLimits() {
  const pool = new Pool({ connectionString: getLocalDatabaseUrl() });
  try {
    await pool.query('delete from "rate_limits"');
  } finally {
    await pool.end();
  }
}

export async function resetMessagingNotificationsState() {
  const pool = new Pool({ connectionString: getLocalDatabaseUrl() });
  try {
    await seedMessagingNotifications(pool, {
      athleteEmail: TEST_USERS.athlete.email,
      coachEmail: TEST_USERS.coach.email,
    });
  } finally {
    await pool.end();
  }
}

export async function clearMessagingNotificationsState() {
  const pool = new Pool({ connectionString: getLocalDatabaseUrl() });
  try {
    await clearMessagingNotifications(pool);
  } finally {
    await pool.end();
  }
}

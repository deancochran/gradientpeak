import type { TestInfo } from "@playwright/test";
import { currentE2EActor } from "../support/actors";
import { type E2EQuery, withLocalE2EDatabase } from "../support/database";
import { createE2EExecutionIdentity } from "../support/identity";

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

export function e2eArtifactIdentity(testInfo: TestInfo, label: string) {
  return createE2EExecutionIdentity(testInfo).name(`Playwright ${label}`);
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

export async function cleanupOwnedGroups(groupNames: readonly string[], actorEmail?: string) {
  const names = validatedCleanupNames(groupNames, "group");
  await withLocalCleanup(async (client, actorProfileId) => {
    const parameters = [actorProfileId, names];
    await client.query(E2E_CLEANUP_SQL.groupComments, parameters);
    // Group-owned events, RSVPs, memberships, invitations, and join requests cascade here.
    await client.query(E2E_CLEANUP_SQL.groups, parameters);
  }, actorEmail ?? currentE2EActor("athlete").email);
}

export async function cleanupOwnedActivityPlans(
  identity: ActivityPlanCleanupIdentity,
  actorEmail?: string,
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
  }, actorEmail ?? currentE2EActor("athlete").email);
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
  cleanup: (client: E2EQuery, actorProfileId: string) => Promise<void>,
  actorEmail: string,
) {
  await withLocalE2EDatabase((database) =>
    database.transaction(async (client) => {
      const actorResult = await client.query<{ id: string }>(E2E_CLEANUP_SQL.resolveActor, [
        actorEmail,
      ]);
      const actorProfileId = actorResult.rows[0]?.id;
      if (actorProfileId) await cleanup(client, actorProfileId);
    }),
  );
}

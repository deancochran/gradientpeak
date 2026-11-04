import type { TestInfo } from "@playwright/test";
import {
  activityPlans,
  activityRoutes,
  comments,
  events,
  groupEvents,
  groups,
  likes,
  plannedSessions,
  profiles,
  users,
} from "@repo/db/schema";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { currentE2EActor } from "../support/actors";
import { type E2EDrizzleTransaction, withLocalE2EDatabase } from "../support/database";
import { createE2EExecutionIdentity } from "../support/identity";

export type ActivityPlanCleanupIdentity = {
  planNames: readonly string[];
  routeNames?: readonly string[];
};

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
  await withLocalCleanup(async (transaction, actorProfileId) => {
    const ownedGroups = await transaction
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.created_by_profile_id, actorProfileId), inArray(groups.name, names)));
    const groupIds = ownedGroups.map((group) => group.id);
    if (groupIds.length > 0) {
      const ownedEvents = await transaction
        .select({ id: groupEvents.id })
        .from(groupEvents)
        .where(inArray(groupEvents.group_id, groupIds));
      const eventIds = ownedEvents.map((event) => event.id);
      if (eventIds.length > 0) {
        await transaction
          .delete(comments)
          .where(and(eq(comments.entity_type, "event"), inArray(comments.entity_id, eventIds)));
      }
    }
    // Group-owned events, RSVPs, memberships, invitations, and join requests cascade here.
    await transaction
      .delete(groups)
      .where(and(eq(groups.created_by_profile_id, actorProfileId), inArray(groups.name, names)));
  }, actorEmail ?? currentE2EActor("athlete").email);
}

export async function cleanupOwnedActivityPlans(
  identity: ActivityPlanCleanupIdentity,
  actorEmail?: string,
) {
  const planNames = validatedCleanupNames(identity.planNames, "activity plan");
  const routeNames = validatedCleanupNames(identity.routeNames ?? [], "activity route", true);

  await withLocalCleanup(async (transaction, actorProfileId) => {
    const ownedPlans = await transaction
      .select({ id: activityPlans.id })
      .from(activityPlans)
      .where(
        and(eq(activityPlans.profile_id, actorProfileId), inArray(activityPlans.name, planNames)),
      );
    const planIds = ownedPlans.map((plan) => plan.id);
    const ownedRoutes =
      routeNames.length === 0
        ? []
        : await transaction
            .select({ id: activityRoutes.id })
            .from(activityRoutes)
            .where(
              and(
                eq(activityRoutes.profile_id, actorProfileId),
                inArray(activityRoutes.name, routeNames),
              ),
            );
    const routeIds = ownedRoutes.map((route) => route.id);
    if (routeIds.length > 0) {
      const ownedEvents = await transaction
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.profile_id, actorProfileId), inArray(events.route_id, routeIds)));
      const eventIds = ownedEvents.map((event) => event.id);
      if (eventIds.length > 0) {
        await transaction
          .delete(comments)
          .where(and(eq(comments.entity_type, "event"), inArray(comments.entity_id, eventIds)));
        await transaction.delete(events).where(inArray(events.id, eventIds));
      }
    }

    if (planIds.length > 0) {
      await transaction
        .delete(plannedSessions)
        .where(
          and(
            eq(plannedSessions.profile_id, actorProfileId),
            inArray(plannedSessions.activity_plan_id, planIds),
          ),
        );
      await transaction
        .delete(comments)
        .where(
          and(eq(comments.entity_type, "activity_plan"), inArray(comments.entity_id, planIds)),
        );
      await transaction
        .delete(likes)
        .where(and(eq(likes.entity_type, "activity_plan"), inArray(likes.entity_id, planIds)));
      await transaction.delete(activityPlans).where(inArray(activityPlans.id, planIds));
    }
    if (routeIds.length > 0) {
      await transaction
        .delete(comments)
        .where(and(eq(comments.entity_type, "route"), inArray(comments.entity_id, routeIds)));
      await transaction
        .delete(likes)
        .where(and(eq(likes.entity_type, "route"), inArray(likes.entity_id, routeIds)));
      await transaction.delete(activityRoutes).where(inArray(activityRoutes.id, routeIds));
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
  cleanup: (transaction: E2EDrizzleTransaction, actorProfileId: string) => Promise<void>,
  actorEmail: string,
) {
  await withLocalE2EDatabase((database) =>
    database.typedTransaction(async (transaction) => {
      const [actor] = await transaction
        .select({ profileId: profiles.id })
        .from(profiles)
        .innerJoin(users, eq(users.id, profiles.id))
        .where(ilike(users.email, actorEmail))
        .limit(1);
      if (actor) await cleanup(transaction, actor.profileId);
    }),
  );
}

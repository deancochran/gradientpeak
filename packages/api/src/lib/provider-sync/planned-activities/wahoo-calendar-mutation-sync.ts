import { activityPlanStructureSchema } from "@repo/core";
import { type DrizzleDbClient, schema } from "@repo/db";
import { and, eq, inArray } from "drizzle-orm";
import { readPublishedAthletePerformanceTargets } from "../../../application/athlete-intelligence/published-athlete-state";
import type { DrizzleTransactionClient } from "../../../db";
import {
  createWahooRepository,
  createWahooSyncRepository,
  listIntegrationsByProfileId,
} from "../../../infrastructure/repositories";
import { WahooPlannedActivitySyncService } from "./wahoo-planned-activity-sync-service";
import { WahooPlannedActivityProvider } from "./wahoo-planned-workout-provider";
import type {
  WahooPlannedActivityQueueResult,
  WahooPlannedActivitySyncOperation,
} from "./wahoo-types";

export type WahooCalendarMutationSyncInput = {
  db: DrizzleDbClient;
  eventIds: string[];
  operation: WahooPlannedActivitySyncOperation;
  profileId: string;
  transaction?: DrizzleTransactionClient;
};

export function createWahooPlannedActivitySyncServiceForDb(
  db: DrizzleDbClient,
  transaction?: DrizzleTransactionClient,
) {
  const providerSyncRepository = createWahooSyncRepository({ db });
  const wahooRepository = createWahooRepository({ db: transaction ?? db });
  const operationTime = new Date();
  const getPerformanceTargets = ({ profileId }: { profileId: string }) =>
    readPublishedAthletePerformanceTargets({ db, profileId });

  return new WahooPlannedActivitySyncService(
    new WahooPlannedActivityProvider({
      providerSyncRepository,
      wahooRepository,
      getPerformanceTargets,
      now: () => operationTime,
      ...(transaction
        ? {
            enqueueJob: (input) =>
              providerSyncRepository.enqueueJobInTransaction(transaction, input),
          }
        : {}),
    }),
  );
}

export async function enqueueWahooPlannedActivitySyncAfterCalendarMutation(
  input: WahooCalendarMutationSyncInput,
): Promise<WahooPlannedActivityQueueResult | null> {
  const eventIds = [...new Set(input.eventIds)].filter(Boolean);
  if (eventIds.length === 0) return null;

  const queryExecutor = input.transaction ?? input.db;
  if (input.operation === "publish") {
    const eventPlans = await queryExecutor
      .select({ eventId: schema.events.id, structure: schema.activityPlans.structure })
      .from(schema.events)
      .innerJoin(schema.activityPlans, eq(schema.activityPlans.id, schema.events.activity_plan_id))
      .where(
        and(eq(schema.events.profile_id, input.profileId), inArray(schema.events.id, eventIds)),
      );
    if (
      eventPlans.length !== eventIds.length ||
      eventPlans.some((event) => !activityPlanStructureSchema.safeParse(event.structure).success)
    ) {
      throw new Error(
        "Only executable single-activity-category activity plans can be published to Wahoo",
      );
    }
  }
  const integrations = await listIntegrationsByProfileId(queryExecutor, input.profileId, {
    forUpdate: Boolean(input.transaction),
  });
  const wahooRepository = createWahooRepository({ db: queryExecutor });
  const unsyncTargets = new Map<string, { externalId: string; resourceLinkId: string }>();
  if (input.operation === "unsync") {
    for (const eventId of eventIds) {
      const link = await wahooRepository.getEventResourceLink({
        eventId,
        forUpdate: Boolean(input.transaction),
        profileId: input.profileId,
        provider: "wahoo",
      });
      if (link)
        unsyncTargets.set(eventId, { externalId: link.externalId, resourceLinkId: link.id });
    }
  }
  const actionableEventIds =
    input.operation === "unsync"
      ? eventIds.filter((eventId) => unsyncTargets.has(eventId))
      : eventIds;
  if (actionableEventIds.length === 0) return null;
  const result = await createWahooPlannedActivitySyncServiceForDb(
    input.db,
    input.transaction,
  ).enqueue({
    connectedProviders: integrations.map((integration) => integration.provider),
    eventIds: actionableEventIds,
    operation: input.operation,
    profileId: input.profileId,
    unsyncTargets,
  });

  return result;
}

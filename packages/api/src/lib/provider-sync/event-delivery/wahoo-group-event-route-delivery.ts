import { createHash } from "node:crypto";
import { schema } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { and, asc, eq, gt } from "drizzle-orm";
import type { DrizzleTransactionClient } from "../../../db";
import {
  createProviderSyncRepository,
  createWahooRepository,
} from "../../../infrastructure/repositories";
import type { ProviderSyncRepository, WahooRepository } from "../../../repositories";
import { hasWahooRouteMirrorScopes } from "../../integrations/wahoo/planned-activity-scopes";
import { getWahooGroupEventRouteDeliveryExternalId } from "../../integrations/wahoo/route-delivery-identity";

export { getWahooGroupEventRouteDeliveryExternalId } from "../../integrations/wahoo/route-delivery-identity";

export const WAHOO_DELIVER_GROUP_EVENT_ROUTE_JOB = "wahoo.deliver_group_event_route";
export const WAHOO_RECONCILE_GROUP_EVENT_ROUTE_DELIVERIES_JOB =
  "wahoo.reconcile_group_event_route_deliveries";
export const WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RESOURCE = "group_event_route_delivery";
export const WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RECONCILE_PAGE_SIZE = 100;

export type WahooGroupEventRouteDeliveryPayload = {
  eventId: string;
  expectedEventUpdatedAt?: string;
  expectedRouteUpdatedAt?: string;
  externalId: string;
  sourceRouteId: string;
};

export type WahooGroupEventRouteDeliveryReconcilePayload = {
  trigger: "access_changed" | "connect" | "manual" | "preference_changed";
};

export function getWahooGroupEventRouteDeliveryLaneKey(input: {
  eventId: string;
  integrationId: string;
}): string {
  return `wahoo:${input.integrationId}:group_event_route_delivery:${input.eventId}`;
}

export function hashWahooGroupEventRouteDeliveryPayload(
  payload: WahooGroupEventRouteDeliveryPayload,
): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function resolveCancelledGroupEventRouteDeliveries(
  events: ReadonlyArray<{
    eventId: string;
    routeId: string | null;
    seriesId: string | null;
  }>,
  seriesRouteId: string | null,
): Array<{ eventId: string; sourceRouteId: string }> {
  return events.flatMap((event) => {
    const sourceRouteId = event.routeId ?? (event.seriesId ? seriesRouteId : null);
    return sourceRouteId ? [{ eventId: event.eventId, sourceRouteId }] : [];
  });
}

export async function enqueueWahooGroupEventRouteDeliveryForIntegration(input: {
  eventId: string;
  expectedEventUpdatedAt?: string;
  expectedRouteUpdatedAt?: string;
  integrationGeneration: number;
  integrationId: string;
  profileId: string;
  providerSyncRepository: ProviderSyncRepository;
  sourceRouteId: string;
  transaction?: DrizzleTransactionClient;
}): Promise<{ jobId: string; queued: boolean }> {
  const payload: WahooGroupEventRouteDeliveryPayload = {
    eventId: input.eventId,
    ...(input.expectedEventUpdatedAt === undefined
      ? {}
      : { expectedEventUpdatedAt: input.expectedEventUpdatedAt }),
    ...(input.expectedRouteUpdatedAt === undefined
      ? {}
      : { expectedRouteUpdatedAt: input.expectedRouteUpdatedAt }),
    externalId: getWahooGroupEventRouteDeliveryExternalId(input),
    sourceRouteId: input.sourceRouteId,
  };
  const jobInput = {
    dedupeKey: `wahoo:deliver_group_event_route:${input.integrationId}:${input.eventId}:${input.sourceRouteId}`,
    integrationGeneration: input.integrationGeneration,
    integrationId: input.integrationId,
    internalResourceId: input.eventId,
    jobType: WAHOO_DELIVER_GROUP_EVENT_ROUTE_JOB,
    maxAttempts: 5,
    operation: "deliver",
    payload,
    payloadHash: hashWahooGroupEventRouteDeliveryPayload(payload),
    priority: 50,
    profileId: input.profileId,
    provider: "wahoo" as const,
    resourceKind: "group_event_route_delivery" as const,
    runAt: new Date().toISOString(),
    syncLaneKey: getWahooGroupEventRouteDeliveryLaneKey(input),
  };
  const job = input.transaction
    ? await input.providerSyncRepository.enqueueJobInTransaction(input.transaction, jobInput)
    : await input.providerSyncRepository.enqueueJob(jobInput);
  return { jobId: job.id, queued: job.status === "queued" };
}

/**
 * Queue a recipient delivery only when the recipient has an active, route-scoped Wahoo
 * integration. Current RSVP, membership, event, and preference eligibility is rechecked by the
 * worker so queued work is safe to retain across subsequent event changes.
 */
export async function enqueueWahooGroupEventRouteDeliveryForProfile(input: {
  db: DrizzleDbClient;
  eventId: string;
  expectedEventUpdatedAt?: string;
  expectedRouteUpdatedAt?: string;
  profileId: string;
  sourceRouteId: string;
  transaction?: DrizzleTransactionClient;
}): Promise<{ jobId: string; queued: boolean } | null> {
  const queryExecutor = input.transaction ?? input.db;
  const wahooRepository = createWahooRepository({ db: queryExecutor });
  const integration = await wahooRepository.findWahooIntegrationByProfileId(input.profileId);
  if (!integration || !hasWahooRouteMirrorScopes(integration.scope)) return null;

  return enqueueWahooGroupEventRouteDeliveryForIntegration({
    eventId: input.eventId,
    ...(input.expectedEventUpdatedAt === undefined
      ? {}
      : { expectedEventUpdatedAt: input.expectedEventUpdatedAt }),
    ...(input.expectedRouteUpdatedAt === undefined
      ? {}
      : { expectedRouteUpdatedAt: input.expectedRouteUpdatedAt }),
    integrationGeneration: integration.integrationGeneration,
    integrationId: integration.id,
    profileId: input.profileId,
    providerSyncRepository: createProviderSyncRepository({ db: input.db }),
    sourceRouteId: input.sourceRouteId,
    ...(input.transaction ? { transaction: input.transaction } : {}),
  });
}

export async function enqueueWahooGroupEventRouteDeliveryReconcile(input: {
  integrationGeneration: number;
  integrationId: string;
  profileId: string;
  providerSyncRepository: ProviderSyncRepository;
  transaction?: DrizzleTransactionClient;
  trigger: WahooGroupEventRouteDeliveryReconcilePayload["trigger"];
}): Promise<{ jobId: string; queued: boolean }> {
  const payload: WahooGroupEventRouteDeliveryReconcilePayload = { trigger: input.trigger };
  const jobInput = {
    dedupeKey: `wahoo:reconcile_group_event_route_deliveries:${input.integrationId}`,
    integrationGeneration: input.integrationGeneration,
    integrationId: input.integrationId,
    jobType: WAHOO_RECONCILE_GROUP_EVENT_ROUTE_DELIVERIES_JOB,
    maxAttempts: 5,
    operation: "reconcile",
    payload,
    payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    priority: 80,
    profileId: input.profileId,
    provider: "wahoo" as const,
    resourceKind: "group_event_route_delivery" as const,
    runAt: new Date().toISOString(),
    syncLaneKey: `wahoo:${input.integrationId}:group_event_route_delivery:reconcile`,
  };
  const job = input.transaction
    ? await input.providerSyncRepository.enqueueJobInTransaction(input.transaction, jobInput)
    : await input.providerSyncRepository.enqueueJob(jobInput);
  return { jobId: job.id, queued: job.status === "queued" };
}

export async function enqueueWahooGroupEventRouteDeliveryReconcileForProfile(input: {
  db: DrizzleDbClient;
  profileId: string;
  transaction?: DrizzleTransactionClient;
  trigger: WahooGroupEventRouteDeliveryReconcilePayload["trigger"];
}): Promise<{ jobId: string; queued: boolean } | null> {
  const queryExecutor = input.transaction ?? input.db;
  const integration = await createWahooRepository({
    db: queryExecutor,
  }).findWahooIntegrationByProfileId(input.profileId);
  if (!integration || !hasWahooRouteMirrorScopes(integration.scope)) return null;
  return enqueueWahooGroupEventRouteDeliveryReconcile({
    integrationGeneration: integration.integrationGeneration,
    integrationId: integration.id,
    profileId: input.profileId,
    providerSyncRepository: createProviderSyncRepository({ db: input.db }),
    ...(input.transaction ? { transaction: input.transaction } : {}),
    trigger: input.trigger,
  });
}

export async function reconcileWahooGroupEventRouteDeliveries(input: {
  integrationGeneration: number;
  integrationId: string;
  profileId: string;
  providerSyncRepository: ProviderSyncRepository;
  wahooRepository: Pick<
    WahooRepository,
    "listEligibleGroupEventRouteDeliveries" | "listGroupEventRouteDeliveryResourceLinks"
  >;
}): Promise<number> {
  const desired = new Map<
    string,
    {
      eventId: string;
      expectedEventUpdatedAt?: string;
      expectedRouteUpdatedAt?: string;
      sourceRouteId: string;
    }
  >();
  let afterEventId: string | undefined;
  while (true) {
    const links = await input.wahooRepository.listGroupEventRouteDeliveryResourceLinks({
      ...(afterEventId ? { afterEventId } : {}),
      limit: WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RECONCILE_PAGE_SIZE,
      profileId: input.profileId,
    });
    for (const link of links) {
      if (link.sourceRouteId) {
        desired.set(`${link.eventId}:${link.sourceRouteId}`, {
          eventId: link.eventId,
          sourceRouteId: link.sourceRouteId,
        });
      }
    }
    if (links.length < WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RECONCILE_PAGE_SIZE) break;
    const last = links.at(-1);
    if (!last) break;
    afterEventId = last.eventId;
  }

  let after: { eventId: string; startsAt: string } | undefined;
  while (true) {
    const deliveries = await input.wahooRepository.listEligibleGroupEventRouteDeliveries({
      ...(after ? { after } : {}),
      limit: WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RECONCILE_PAGE_SIZE,
      profileId: input.profileId,
    });
    for (const delivery of deliveries) {
      desired.set(`${delivery.eventId}:${delivery.sourceRouteId}`, {
        eventId: delivery.eventId,
        expectedEventUpdatedAt: delivery.eventUpdatedAt,
        expectedRouteUpdatedAt: delivery.routeUpdatedAt,
        sourceRouteId: delivery.sourceRouteId,
      });
    }
    if (deliveries.length < WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RECONCILE_PAGE_SIZE) break;
    const last = deliveries.at(-1);
    if (!last) break;
    after = { eventId: last.eventId, startsAt: last.startsAt };
  }

  let queued = 0;
  for (const delivery of desired.values()) {
    await enqueueWahooGroupEventRouteDeliveryForIntegration({
      eventId: delivery.eventId,
      ...(delivery.expectedEventUpdatedAt === undefined
        ? {}
        : { expectedEventUpdatedAt: delivery.expectedEventUpdatedAt }),
      ...(delivery.expectedRouteUpdatedAt === undefined
        ? {}
        : { expectedRouteUpdatedAt: delivery.expectedRouteUpdatedAt }),
      integrationGeneration: input.integrationGeneration,
      integrationId: input.integrationId,
      profileId: input.profileId,
      providerSyncRepository: input.providerSyncRepository,
      sourceRouteId: delivery.sourceRouteId,
    });
    queued += 1;
  }
  return queued;
}

/**
 * Fan out an updated group-event route to currently accepted recipients. This is intentionally
 * bounded; recipient eligibility is checked again by the worker before any provider effect.
 */
export async function enqueueWahooGroupEventRouteDeliveryForAcceptedRecipients(input: {
  db: DrizzleDbClient;
  eventId: string;
  expectedEventUpdatedAt?: string;
  expectedRouteUpdatedAt?: string;
  groupId: string;
  sourceRouteId: string;
  transaction?: DrizzleTransactionClient;
}): Promise<number> {
  const queryExecutor = input.transaction ?? input.db;
  let queued = 0;
  let afterProfileId: string | undefined;
  while (true) {
    const recipients = await queryExecutor
      .select({ profileId: schema.groupEventRsvps.profile_id })
      .from(schema.groupEventRsvps)
      .innerJoin(
        schema.groupMemberships,
        and(
          eq(schema.groupMemberships.group_id, input.groupId),
          eq(schema.groupMemberships.profile_id, schema.groupEventRsvps.profile_id),
          eq(schema.groupMemberships.status, "active"),
        ),
      )
      .where(
        and(
          eq(schema.groupEventRsvps.group_event_id, input.eventId),
          eq(schema.groupEventRsvps.status, "accepted"),
          afterProfileId ? gt(schema.groupEventRsvps.profile_id, afterProfileId) : undefined,
        ),
      )
      .orderBy(asc(schema.groupEventRsvps.profile_id))
      .limit(WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RECONCILE_PAGE_SIZE);

    for (const recipient of recipients) {
      const job = await enqueueWahooGroupEventRouteDeliveryForProfile({
        db: input.db,
        eventId: input.eventId,
        ...(input.expectedEventUpdatedAt === undefined
          ? {}
          : { expectedEventUpdatedAt: input.expectedEventUpdatedAt }),
        ...(input.expectedRouteUpdatedAt === undefined
          ? {}
          : { expectedRouteUpdatedAt: input.expectedRouteUpdatedAt }),
        profileId: recipient.profileId,
        sourceRouteId: input.sourceRouteId,
        ...(input.transaction ? { transaction: input.transaction } : {}),
      });
      if (job?.queued) queued += 1;
    }
    if (recipients.length < WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RECONCILE_PAGE_SIZE) break;
    const last = recipients.at(-1);
    if (!last) break;
    afterProfileId = last.profileId;
  }
  return queued;
}

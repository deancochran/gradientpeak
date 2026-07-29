import { createHash } from "node:crypto";
import type { DrizzleDbClient } from "@repo/db/client";
import type { DrizzleTransactionClient } from "../../../db";
import {
  createProviderSyncRepository,
  createWahooRepository,
} from "../../../infrastructure/repositories";
import type { ProviderSyncRepository } from "../../../repositories/provider-sync-repository";
import { hasWahooRouteMirrorScopes } from "../../integrations/wahoo/planned-activity-scopes";

export const WAHOO_UPSERT_OWNED_ROUTE_JOB = "wahoo.upsert_owned_route";
export const WAHOO_DELETE_OWNED_ROUTE_JOB = "wahoo.delete_owned_route";
export const WAHOO_RECONCILE_OWNED_ROUTES_JOB = "wahoo.reconcile_owned_routes";
export const WAHOO_OWNED_ROUTES_RESOURCE = "routes";

export type WahooOwnedRouteMirrorPayload = {
  expectedRouteUpdatedAt?: string;
  externalId: string;
  operation: "delete" | "upsert";
  routeId: string;
};

export type WahooOwnedRouteReconcilePayload = { trigger: "connect" | "manual" | "periodic" };

export function getWahooOwnedRouteExternalId(routeId: string): string {
  const opaqueRouteId = createHash("sha256")
    .update(`gradientpeak:wahoo:owned-route:v2:${routeId}`)
    .digest("base64url")
    .slice(0, 32);
  return `gradientpeak:route:v2:${opaqueRouteId}`;
}

export function getWahooOwnedRouteLaneKey(input: {
  integrationId: string;
  routeId: string;
}): string {
  return `wahoo:${input.integrationId}:owned_route:${input.routeId}`;
}

export function hashWahooOwnedRoutePayload(payload: WahooOwnedRouteMirrorPayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function enqueueWahooOwnedRouteForIntegration(input: {
  expectedRouteUpdatedAt?: string;
  integrationGeneration: number;
  integrationId: string;
  operation: "delete" | "upsert";
  profileId: string;
  providerSyncRepository: ProviderSyncRepository;
  routeId: string;
  transaction?: DrizzleTransactionClient;
}): Promise<{ jobId: string; queued: boolean }> {
  const payload: WahooOwnedRouteMirrorPayload = {
    ...(input.expectedRouteUpdatedAt === undefined
      ? {}
      : { expectedRouteUpdatedAt: input.expectedRouteUpdatedAt }),
    externalId: getWahooOwnedRouteExternalId(input.routeId),
    operation: input.operation,
    routeId: input.routeId,
  };
  const jobInput = {
    dedupeKey: `wahoo:${input.operation}:owned_route:${input.routeId}`,
    integrationGeneration: input.integrationGeneration,
    integrationId: input.integrationId,
    internalResourceId: input.routeId,
    jobType:
      input.operation === "upsert" ? WAHOO_UPSERT_OWNED_ROUTE_JOB : WAHOO_DELETE_OWNED_ROUTE_JOB,
    maxAttempts: 5,
    operation: input.operation,
    payload,
    payloadHash: hashWahooOwnedRoutePayload(payload),
    priority: 90,
    profileId: input.profileId,
    provider: "wahoo" as const,
    resourceKind: "activity_route" as const,
    runAt: new Date().toISOString(),
    syncLaneKey: getWahooOwnedRouteLaneKey({
      integrationId: input.integrationId,
      routeId: input.routeId,
    }),
  };
  const job = input.transaction
    ? await input.providerSyncRepository.enqueueJobInTransaction(input.transaction, jobInput)
    : await input.providerSyncRepository.enqueueJob(jobInput);
  return { jobId: job.id, queued: job.status === "queued" };
}

export async function enqueueWahooOwnedRouteReconcile(input: {
  integrationGeneration: number;
  integrationId: string;
  profileId: string;
  providerSyncRepository: ProviderSyncRepository;
  transaction?: DrizzleTransactionClient;
  trigger: WahooOwnedRouteReconcilePayload["trigger"];
}): Promise<{ jobId: string; queued: boolean }> {
  const payload: WahooOwnedRouteReconcilePayload = { trigger: input.trigger };
  const jobInput = {
    dedupeKey: `wahoo:reconcile_owned_routes:${input.integrationId}`,
    integrationGeneration: input.integrationGeneration,
    integrationId: input.integrationId,
    jobType: WAHOO_RECONCILE_OWNED_ROUTES_JOB,
    maxAttempts: 5,
    operation: "reconcile",
    payload,
    payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    priority: 95,
    profileId: input.profileId,
    provider: "wahoo" as const,
    resourceKind: "activity_route" as const,
    runAt: new Date().toISOString(),
    syncLaneKey: `wahoo:${input.integrationId}:owned_routes:reconcile`,
  };
  const job = input.transaction
    ? await input.providerSyncRepository.enqueueJobInTransaction(input.transaction, jobInput)
    : await input.providerSyncRepository.enqueueJob(jobInput);
  return { jobId: job.id, queued: job.status === "queued" };
}

export async function enqueueWahooOwnedRouteMirror(input: {
  db: DrizzleDbClient;
  expectedRouteUpdatedAt?: string;
  operation: "delete" | "upsert";
  profileId: string;
  routeId: string;
  transaction?: DrizzleTransactionClient;
}): Promise<{ jobId: string; queued: boolean } | null> {
  const queryExecutor = input.transaction ?? input.db;
  const wahooRepository = createWahooRepository({ db: queryExecutor });
  const [integration, link] = await Promise.all([
    wahooRepository.findWahooIntegrationByProfileId(input.profileId),
    wahooRepository.getRouteResourceLink({
      profileId: input.profileId,
      provider: "wahoo",
      routeId: input.routeId,
    }),
  ]);

  if (!integration || !hasWahooRouteMirrorScopes(integration.scope)) {
    if (input.operation === "delete" && link) {
      throw new Error("Reconnect Wahoo before deleting a mirrored route");
    }
    return null;
  }
  const linkedAccount = link?.providerMetadata?.wahoo?.providerAccountExternalId;
  if (link && linkedAccount !== integration.externalId) {
    throw new Error("The mirrored route belongs to a different Wahoo account");
  }

  let expectedRouteUpdatedAt = input.expectedRouteUpdatedAt;
  if (input.operation === "upsert" && expectedRouteUpdatedAt === undefined) {
    const route = await wahooRepository.getOwnedRouteForMirror({
      profileId: input.profileId,
      routeId: input.routeId,
    });
    if (!route) return null;
    expectedRouteUpdatedAt = route.updatedAt;
  }
  const providerSyncRepository = createProviderSyncRepository({ db: input.db });
  return enqueueWahooOwnedRouteForIntegration({
    ...(expectedRouteUpdatedAt === undefined ? {} : { expectedRouteUpdatedAt }),
    integrationGeneration: integration.integrationGeneration,
    integrationId: integration.id,
    operation: input.operation,
    profileId: input.profileId,
    providerSyncRepository,
    routeId: input.routeId,
    ...(input.transaction ? { transaction: input.transaction } : {}),
  });
}

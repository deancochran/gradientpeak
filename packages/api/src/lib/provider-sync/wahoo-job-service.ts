import type { ProviderSyncRepository, WahooRepository } from "../../repositories";
import {
  createWahooClient,
  type WahooApiError,
  type WahooClient,
} from "../integrations/wahoo/client";
import { hasWahooRouteMirrorScopes } from "../integrations/wahoo/planned-activity-scopes";
import type { WahooSyncService } from "../integrations/wahoo/sync-service";
import {
  getWahooGroupEventRouteDeliveryExternalId,
  reconcileWahooGroupEventRouteDeliveries,
  WAHOO_DELIVER_GROUP_EVENT_ROUTE_JOB,
  WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RESOURCE,
  WAHOO_RECONCILE_GROUP_EVENT_ROUTE_DELIVERIES_JOB,
  type WahooGroupEventRouteDeliveryPayload,
  type WahooGroupEventRouteDeliveryReconcilePayload,
} from "./event-delivery/wahoo-group-event-route-delivery";
import {
  createProviderSyncWorkerId,
  executeProviderSyncJobs,
  type ProviderSyncConcurrencyLimiter,
} from "./job-execution";
import {
  enqueueWahooOwnedRouteForIntegration,
  getWahooOwnedRouteExternalId,
  WAHOO_DELETE_OWNED_ROUTE_JOB,
  WAHOO_OWNED_ROUTES_RESOURCE,
  WAHOO_RECONCILE_OWNED_ROUTES_JOB,
  WAHOO_UPSERT_OWNED_ROUTE_JOB,
  type WahooOwnedRouteMirrorPayload,
  type WahooOwnedRouteReconcilePayload,
} from "./owned-routes";
import { PLANNED_WORKOUT_RESOURCE } from "./planned-activities/planned-activity-policy";
import { isWahooStagingCleanupPayload, WAHOO_STAGING_CLEANUP_JOB } from "./wahoo-staging-cleanup";

const WAHOO_PUBLISH_HORIZON_DAYS = 6;
const WAHOO_DISCONNECT_JOB = "wahoo.disconnect";
const WAHOO_PUBLISH_EVENT_JOB = "wahoo.publish_event";
const WAHOO_UNSYNC_EVENT_JOB = "wahoo.unsync_event";

type WahooDisconnectPayload = { expectedGeneration: number };
type WahooJobPayload = {
  eventId: string;
  operation: "publish" | "unsync";
  projectionHash?: string;
  startsAt?: string;
  unsyncTarget?: { externalId: string; resourceLinkId: string };
};

function isWahooJobPayload(value: unknown): value is WahooJobPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.eventId !== "string" ||
    payload.eventId.length === 0 ||
    (payload.operation !== "publish" && payload.operation !== "unsync") ||
    (payload.projectionHash !== undefined &&
      (typeof payload.projectionHash !== "string" || payload.projectionHash.length === 0))
  )
    return false;
  if (payload.operation === "publish") {
    return (
      (payload.startsAt === undefined ||
        (typeof payload.startsAt === "string" && !Number.isNaN(Date.parse(payload.startsAt)))) &&
      payload.unsyncTarget === undefined
    );
  }
  if (payload.projectionHash !== undefined || payload.startsAt !== undefined) return false;
  if (payload.unsyncTarget === undefined) return true;
  if (
    !payload.unsyncTarget ||
    typeof payload.unsyncTarget !== "object" ||
    Array.isArray(payload.unsyncTarget)
  )
    return false;
  const target = payload.unsyncTarget as Record<string, unknown>;
  return (
    typeof target.externalId === "string" &&
    target.externalId.length > 0 &&
    typeof target.resourceLinkId === "string" &&
    target.resourceLinkId.length > 0
  );
}

function isWahooOwnedRouteMirrorPayload(value: unknown): value is WahooOwnedRouteMirrorPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.routeId !== "string" ||
    payload.routeId.length === 0 ||
    typeof payload.externalId !== "string" ||
    payload.externalId.length === 0 ||
    (payload.operation !== "upsert" && payload.operation !== "delete")
  ) {
    return false;
  }
  if (payload.operation === "delete") return payload.expectedRouteUpdatedAt === undefined;
  return (
    typeof payload.expectedRouteUpdatedAt === "string" &&
    !Number.isNaN(Date.parse(payload.expectedRouteUpdatedAt))
  );
}

function isWahooOwnedRouteReconcilePayload(
  value: unknown,
): value is WahooOwnedRouteReconcilePayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "trigger" in value &&
      (value.trigger === "connect" || value.trigger === "manual" || value.trigger === "periodic"),
  );
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isWahooGroupEventRouteDeliveryPayload(
  value: unknown,
): value is WahooGroupEventRouteDeliveryPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload);
  if (
    !keys.every((key) =>
      [
        "eventId",
        "sourceRouteId",
        "expectedEventUpdatedAt",
        "expectedRouteUpdatedAt",
        "externalId",
      ].includes(key),
    )
  )
    return false;
  return (
    typeof payload.eventId === "string" &&
    payload.eventId.length > 0 &&
    typeof payload.sourceRouteId === "string" &&
    payload.sourceRouteId.length > 0 &&
    typeof payload.externalId === "string" &&
    payload.externalId.length > 0 &&
    (payload.expectedEventUpdatedAt === undefined ||
      isIsoTimestamp(payload.expectedEventUpdatedAt)) &&
    (payload.expectedRouteUpdatedAt === undefined || isIsoTimestamp(payload.expectedRouteUpdatedAt))
  );
}

function isWahooGroupEventRouteDeliveryReconcilePayload(
  value: unknown,
): value is WahooGroupEventRouteDeliveryReconcilePayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      "trigger" in value &&
      (value.trigger === "access_changed" ||
        value.trigger === "connect" ||
        value.trigger === "manual" ||
        value.trigger === "preference_changed"),
  );
}
class WahooSyncResultError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly ambiguous = false,
  ) {
    super("wahoo_planned_activity_failed");
  }
}

function isWahooDisconnectPayload(value: unknown): value is WahooDisconnectPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "expectedGeneration" in value &&
      typeof value.expectedGeneration === "number" &&
      Number.isInteger(value.expectedGeneration) &&
      value.expectedGeneration > 0,
  );
}

function addMinutes(isoString: string, minutes: number): string {
  const date = new Date(isoString);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

export class WahooSyncJobService {
  constructor(
    private readonly deps: {
      providerSyncRepository: ProviderSyncRepository;
      executionLimiter?: ProviderSyncConcurrencyLimiter;
      /** Required to drain planned activity jobs; omitted deployments fail closed. */
      syncService?: WahooSyncService;
      wahooRepository: WahooRepository;
      removeWahooStagingObject?: (path: string, signal: AbortSignal) => Promise<void>;
      wahooClientFactory?: (input: { accessToken: string }) => Pick<WahooClient, "disconnect">;
    },
  ) {}

  async processDueJobs(input: {
    concurrency?: number;
    leaseMs?: number;
    limit?: number;
    workerId?: string;
  }): Promise<{ completed: number; failed: number; processed: number }> {
    const concurrency = Math.max(1, Math.floor(input.concurrency ?? 4));
    const requested = Math.min(Math.max(1, Math.floor(input.limit ?? 10)), concurrency);
    const capacity = this.deps.executionLimiter?.reserve(requested) ?? requested;
    if (capacity === 0) return { completed: 0, failed: 0, processed: 0 };
    const now = new Date().toISOString();
    const leaseMs = input.leaseMs ?? 5 * 60_000;
    const workerId = createProviderSyncWorkerId(input.workerId ?? "wahoo-sync-worker");
    const plannedActivityDrainEnabled = Boolean(this.deps.syncService);

    try {
      const jobs = await this.deps.providerSyncRepository.claimDueJobs({
        jobTypes: [
          WAHOO_DISCONNECT_JOB,
          ...(plannedActivityDrainEnabled ? [WAHOO_PUBLISH_EVENT_JOB, WAHOO_UNSYNC_EVENT_JOB] : []),
          ...(plannedActivityDrainEnabled
            ? [
                WAHOO_UPSERT_OWNED_ROUTE_JOB,
                WAHOO_DELETE_OWNED_ROUTE_JOB,
                WAHOO_RECONCILE_OWNED_ROUTES_JOB,
                WAHOO_DELIVER_GROUP_EVENT_ROUTE_JOB,
                WAHOO_RECONCILE_GROUP_EVENT_ROUTE_DELIVERIES_JOB,
              ]
            : []),
          ...(this.deps.removeWahooStagingObject ? [WAHOO_STAGING_CLEANUP_JOB] : []),
        ],
        limit: capacity,
        lockExpiresAt: new Date(Date.parse(now) + leaseMs).toISOString(),
        now,
        provider: "wahoo",
        workerId,
      });

      return await executeProviderSyncJobs({
        concurrency: capacity,
        getEndingQueueTelemetry: () =>
          this.deps.providerSyncRepository.getQueueTelemetry?.({
            jobTypes: [
              ...(plannedActivityDrainEnabled
                ? [
                    WAHOO_PUBLISH_EVENT_JOB,
                    WAHOO_UNSYNC_EVENT_JOB,
                    WAHOO_UPSERT_OWNED_ROUTE_JOB,
                    WAHOO_DELETE_OWNED_ROUTE_JOB,
                    WAHOO_RECONCILE_OWNED_ROUTES_JOB,
                    WAHOO_DELIVER_GROUP_EVENT_ROUTE_JOB,
                    WAHOO_RECONCILE_GROUP_EVENT_ROUTE_DELIVERIES_JOB,
                  ]
                : []),
              ...(this.deps.removeWahooStagingObject ? [WAHOO_STAGING_CLEANUP_JOB] : []),
            ],
            now: new Date().toISOString(),
            provider: "wahoo",
          }) ?? Promise.resolve({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
        jobFamily: plannedActivityDrainEnabled ? "wahoo_sync" : "lifecycle",
        jobs,
        leaseRenewIntervalMs: Math.max(1_000, Math.floor(leaseMs / 3)),
        provider: "wahoo",
        renewLease: (job) =>
          this.deps.providerSyncRepository.renewJobLease({
            id: job.id,
            lockExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
            workerId,
          }),
        processJob: async (job, context) => {
          if (job.jobType === WAHOO_PUBLISH_EVENT_JOB || job.jobType === WAHOO_UNSYNC_EVENT_JOB) {
            if (
              !this.deps.syncService ||
              !isWahooJobPayload(job.payload) ||
              job.payload.operation !==
                (job.jobType === WAHOO_PUBLISH_EVENT_JOB ? "publish" : "unsync")
            ) {
              const finalized = await this.deps.providerSyncRepository.markJobFailed({
                id: job.id,
                lastError: "invalid_wahoo_planned_activity_payload",
                status: "dead_lettered",
                workerId,
              });
              return finalized ? "dead_lettered" : "failed";
            }
            const generation = job.integrationGeneration ?? 1;
            if (
              !(await (this.deps.providerSyncRepository.isIntegrationGenerationActive?.({
                generation,
                integrationId: job.integrationId,
                profileId: job.profileId,
              }) ?? false))
            ) {
              const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                job.id,
                workerId,
              );
              return finalized ? "completed" : "failed";
            }
            try {
              const result =
                job.jobType === WAHOO_PUBLISH_EVENT_JOB
                  ? await this.deps.syncService.syncEvent(job.payload.eventId, job.profileId, {
                      ...(job.payload.projectionHash !== undefined
                        ? { expectedProjectionHash: job.payload.projectionHash }
                        : {}),
                      ...(job.payload.startsAt !== undefined
                        ? { expectedStartsAt: job.payload.startsAt }
                        : {}),
                      expectedIntegrationGeneration: generation,
                      integrationId: job.integrationId,
                      signal: context.signal,
                    })
                  : await this.deps.syncService.unsyncEvent(
                      job.payload.eventId,
                      job.profileId,
                      job.payload.unsyncTarget,
                      {
                        expectedIntegrationGeneration: generation,
                        integrationId: job.integrationId,
                        signal: context.signal,
                      },
                    );
              if (!result.success) {
                // Eligibility has no provider effects because sync preflights before credentials.
                if (result.failureCategory === "eligibility" && !result.retryable) {
                  const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState(
                    {
                      expectedIntegrationGeneration: generation,
                      highWatermark: now,
                      id: job.id,
                      integrationId: job.integrationId,
                      metadata: { status: "skipped" },
                      provider: "wahoo",
                      resource: PLANNED_WORKOUT_RESOURCE,
                      workerId,
                    },
                  );
                  return finalized ? "completed" : "failed";
                }
                throw new WahooSyncResultError(
                  result.retryable,
                  result.failureCode === "ambiguous_create",
                );
              }
              const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState({
                expectedIntegrationGeneration: generation,
                highWatermark: now,
                id: job.id,
                integrationId: job.integrationId,
                metadata: { status: "synced" },
                provider: "wahoo",
                resource: PLANNED_WORKOUT_RESOURCE,
                workerId,
              });
              return finalized ? "completed" : "failed";
            } catch (error) {
              const ambiguous = error instanceof WahooSyncResultError && error.ambiguous;
              const retryable = !(error instanceof WahooSyncResultError) || error.retryable;
              const deadLetter = ambiguous || !retryable || job.attempt >= job.maxAttempts;
              const finalized = await this.deps.providerSyncRepository.failJobWithSyncState({
                expectedIntegrationGeneration: generation,
                id: job.id,
                integrationId: job.integrationId,
                lastError: ambiguous ? "ambiguous_create" : "wahoo_planned_activity_failed",
                ...(deadLetter
                  ? {}
                  : { nextRunAt: addMinutes(now, Math.min(job.attempt * 5, 60)) }),
                provider: "wahoo",
                resource: PLANNED_WORKOUT_RESOURCE,
                status: deadLetter ? "dead_lettered" : "failed",
                workerId,
              });
              return finalized ? (deadLetter ? "dead_lettered" : "failed") : "failed";
            }
          }
          if (job.jobType === WAHOO_DELIVER_GROUP_EVENT_ROUTE_JOB) {
            if (
              !this.deps.syncService ||
              !isWahooGroupEventRouteDeliveryPayload(job.payload) ||
              job.internalResourceId !== job.payload.eventId ||
              job.payload.externalId !==
                getWahooGroupEventRouteDeliveryExternalId({
                  eventId: job.payload.eventId,
                  profileId: job.profileId,
                  sourceRouteId: job.payload.sourceRouteId,
                })
            ) {
              const finalized = await this.deps.providerSyncRepository.markJobFailed({
                id: job.id,
                lastError: "invalid_wahoo_group_event_route_delivery_payload",
                status: "dead_lettered",
                workerId,
              });
              return finalized ? "dead_lettered" : "failed";
            }
            const generation = job.integrationGeneration ?? 1;
            if (
              !(await (this.deps.providerSyncRepository.isIntegrationGenerationActive?.({
                generation,
                integrationId: job.integrationId,
                profileId: job.profileId,
              }) ?? false))
            ) {
              const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                job.id,
                workerId,
              );
              return finalized ? "completed" : "failed";
            }
            try {
              const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(
                job.profileId,
              );
              if (
                !integration ||
                integration.id !== job.integrationId ||
                integration.integrationGeneration !== generation ||
                !hasWahooRouteMirrorScopes(integration.scope)
              ) {
                const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState({
                  expectedIntegrationGeneration: generation,
                  highWatermark: now,
                  id: job.id,
                  integrationId: job.integrationId,
                  metadata: { status: "skipped" },
                  provider: "wahoo",
                  resource: WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RESOURCE,
                  workerId,
                });
                return finalized ? "completed" : "failed";
              }
              const result = await this.deps.syncService.syncGroupEventRouteDelivery(
                job.payload.eventId,
                job.profileId,
                job.payload.sourceRouteId,
                job.payload.externalId,
                {
                  expectedIntegrationGeneration: generation,
                  integrationId: job.integrationId,
                  profileId: job.profileId,
                  providerAccountExternalId: integration.externalId,
                  signal: context.signal,
                },
              );
              if (!result.success) {
                if (result.failureCategory === "eligibility" && !result.retryable) {
                  const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState(
                    {
                      expectedIntegrationGeneration: generation,
                      highWatermark: now,
                      id: job.id,
                      integrationId: job.integrationId,
                      metadata: { status: "skipped" },
                      provider: "wahoo",
                      resource: WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RESOURCE,
                      workerId,
                    },
                  );
                  return finalized ? "completed" : "failed";
                }
                throw new WahooSyncResultError(
                  result.retryable,
                  result.failureCode === "ambiguous_create",
                );
              }
              const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState({
                expectedIntegrationGeneration: generation,
                highWatermark: now,
                id: job.id,
                integrationId: job.integrationId,
                metadata: { status: result.terminalOutcome === "skipped" ? "skipped" : "synced" },
                provider: "wahoo",
                resource: WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RESOURCE,
                workerId,
              });
              return finalized ? "completed" : "failed";
            } catch (error) {
              const ambiguous = error instanceof WahooSyncResultError && error.ambiguous;
              const retryable = !(error instanceof WahooSyncResultError) || error.retryable;
              const deadLetter = ambiguous || !retryable || job.attempt >= job.maxAttempts;
              const finalized = await this.deps.providerSyncRepository.failJobWithSyncState({
                expectedIntegrationGeneration: generation,
                id: job.id,
                integrationId: job.integrationId,
                lastError: ambiguous
                  ? "ambiguous_create"
                  : "wahoo_group_event_route_delivery_failed",
                ...(deadLetter
                  ? {}
                  : { nextRunAt: addMinutes(now, Math.min(job.attempt * 5, 60)) }),
                provider: "wahoo",
                resource: WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RESOURCE,
                status: deadLetter ? "dead_lettered" : "failed",
                workerId,
              });
              return finalized ? (deadLetter ? "dead_lettered" : "failed") : "failed";
            }
          }
          if (job.jobType === WAHOO_RECONCILE_GROUP_EVENT_ROUTE_DELIVERIES_JOB) {
            const generation = job.integrationGeneration ?? 1;
            if (!isWahooGroupEventRouteDeliveryReconcilePayload(job.payload)) {
              const finalized = await this.deps.providerSyncRepository.markJobFailed({
                id: job.id,
                lastError: "invalid_wahoo_group_event_route_delivery_reconcile_payload",
                status: "dead_lettered",
                workerId,
              });
              return finalized ? "dead_lettered" : "failed";
            }
            if (
              !(await (this.deps.providerSyncRepository.isIntegrationGenerationActive?.({
                generation,
                integrationId: job.integrationId,
                profileId: job.profileId,
              }) ?? false))
            ) {
              const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                job.id,
                workerId,
              );
              return finalized ? "completed" : "failed";
            }
            try {
              const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(
                job.profileId,
              );
              if (
                !integration ||
                integration.id !== job.integrationId ||
                integration.integrationGeneration !== generation ||
                !hasWahooRouteMirrorScopes(integration.scope)
              ) {
                const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState({
                  expectedIntegrationGeneration: generation,
                  highWatermark: now,
                  id: job.id,
                  integrationId: job.integrationId,
                  metadata: { affectedCount: 0, status: "skipped" },
                  provider: "wahoo",
                  resource: WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RESOURCE,
                  workerId,
                });
                return finalized ? "completed" : "failed";
              }
              const affectedCount = await reconcileWahooGroupEventRouteDeliveries({
                integrationGeneration: generation,
                integrationId: job.integrationId,
                profileId: job.profileId,
                providerSyncRepository: this.deps.providerSyncRepository,
                wahooRepository: this.deps.wahooRepository,
              });
              const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState({
                expectedIntegrationGeneration: generation,
                highWatermark: now,
                id: job.id,
                integrationId: job.integrationId,
                metadata: { affectedCount, status: "reconciled" },
                provider: "wahoo",
                resource: WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RESOURCE,
                workerId,
              });
              return finalized ? "completed" : "failed";
            } catch {
              const deadLetter = job.attempt >= job.maxAttempts;
              const finalized = await this.deps.providerSyncRepository.failJobWithSyncState({
                expectedIntegrationGeneration: generation,
                id: job.id,
                integrationId: job.integrationId,
                lastError: "wahoo_group_event_route_delivery_reconcile_failed",
                ...(deadLetter
                  ? {}
                  : { nextRunAt: addMinutes(now, Math.min(job.attempt * 5, 60)) }),
                provider: "wahoo",
                resource: WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RESOURCE,
                status: deadLetter ? "dead_lettered" : "failed",
                workerId,
              });
              return finalized ? (deadLetter ? "dead_lettered" : "failed") : "failed";
            }
          }
          if (
            job.jobType === WAHOO_UPSERT_OWNED_ROUTE_JOB ||
            job.jobType === WAHOO_DELETE_OWNED_ROUTE_JOB
          ) {
            if (
              !this.deps.syncService ||
              !isWahooOwnedRouteMirrorPayload(job.payload) ||
              job.internalResourceId !== job.payload.routeId ||
              job.payload.externalId !== getWahooOwnedRouteExternalId(job.payload.routeId) ||
              job.payload.operation !==
                (job.jobType === WAHOO_UPSERT_OWNED_ROUTE_JOB ? "upsert" : "delete")
            ) {
              const finalized = await this.deps.providerSyncRepository.markJobFailed({
                id: job.id,
                lastError: "invalid_wahoo_owned_route_payload",
                status: "dead_lettered",
                workerId,
              });
              return finalized ? "dead_lettered" : "failed";
            }
            const generation = job.integrationGeneration ?? 1;
            if (
              !(await (this.deps.providerSyncRepository.isIntegrationGenerationActive?.({
                generation,
                integrationId: job.integrationId,
                profileId: job.profileId,
              }) ?? false))
            ) {
              const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                job.id,
                workerId,
              );
              return finalized ? "completed" : "failed";
            }
            try {
              const result =
                job.jobType === WAHOO_UPSERT_OWNED_ROUTE_JOB
                  ? await this.deps.syncService.syncOwnedRoute(
                      job.payload.routeId,
                      job.profileId,
                      job.payload.externalId,
                      {
                        expectedIntegrationGeneration: generation,
                        ...(job.payload.expectedRouteUpdatedAt
                          ? { expectedRouteUpdatedAt: job.payload.expectedRouteUpdatedAt }
                          : {}),
                        integrationId: job.integrationId,
                        signal: context.signal,
                      },
                    )
                  : await this.deps.syncService.unsyncOwnedRoute(
                      job.payload.routeId,
                      job.profileId,
                      job.payload.externalId,
                      {
                        expectedIntegrationGeneration: generation,
                        integrationId: job.integrationId,
                        signal: context.signal,
                      },
                    );
              if (!result.success) {
                if (result.failureCategory === "eligibility" && !result.retryable) {
                  const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState(
                    {
                      expectedIntegrationGeneration: generation,
                      highWatermark: now,
                      id: job.id,
                      integrationId: job.integrationId,
                      metadata: { status: "skipped" },
                      provider: "wahoo",
                      resource: WAHOO_OWNED_ROUTES_RESOURCE,
                      workerId,
                    },
                  );
                  return finalized ? "completed" : "failed";
                }
                throw new WahooSyncResultError(
                  result.retryable,
                  result.failureCode === "ambiguous_create",
                );
              }
              const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState({
                expectedIntegrationGeneration: generation,
                highWatermark: now,
                id: job.id,
                integrationId: job.integrationId,
                metadata: {
                  status: job.payload.operation === "delete" ? "deleted" : "synced",
                },
                provider: "wahoo",
                resource: WAHOO_OWNED_ROUTES_RESOURCE,
                workerId,
              });
              return finalized ? "completed" : "failed";
            } catch (error) {
              const ambiguous = error instanceof WahooSyncResultError && error.ambiguous;
              const retryable = !(error instanceof WahooSyncResultError) || error.retryable;
              const deadLetter = ambiguous || !retryable || job.attempt >= job.maxAttempts;
              const finalized = await this.deps.providerSyncRepository.failJobWithSyncState({
                expectedIntegrationGeneration: generation,
                id: job.id,
                integrationId: job.integrationId,
                lastError: ambiguous ? "ambiguous_create" : "wahoo_owned_route_failed",
                ...(deadLetter
                  ? {}
                  : { nextRunAt: addMinutes(now, Math.min(job.attempt * 5, 60)) }),
                provider: "wahoo",
                resource: WAHOO_OWNED_ROUTES_RESOURCE,
                status: deadLetter ? "dead_lettered" : "failed",
                workerId,
              });
              return finalized ? (deadLetter ? "dead_lettered" : "failed") : "failed";
            }
          }
          if (job.jobType === WAHOO_RECONCILE_OWNED_ROUTES_JOB) {
            const generation = job.integrationGeneration ?? 1;
            if (!isWahooOwnedRouteReconcilePayload(job.payload)) {
              const finalized = await this.deps.providerSyncRepository.markJobFailed({
                id: job.id,
                lastError: "invalid_wahoo_owned_route_reconcile_payload",
                status: "dead_lettered",
                workerId,
              });
              return finalized ? "dead_lettered" : "failed";
            }
            if (
              !(await (this.deps.providerSyncRepository.isIntegrationGenerationActive?.({
                generation,
                integrationId: job.integrationId,
                profileId: job.profileId,
              }) ?? false))
            ) {
              const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                job.id,
                workerId,
              );
              return finalized ? "completed" : "failed";
            }
            try {
              const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(
                job.profileId,
              );
              if (
                !integration ||
                integration.id !== job.integrationId ||
                integration.integrationGeneration !== generation ||
                !hasWahooRouteMirrorScopes(integration.scope)
              ) {
                throw new WahooSyncResultError(false);
              }
              let afterId: string | undefined;
              let affectedCount = 0;
              for (let page = 0; page < 50; page += 1) {
                context.signal.throwIfAborted();
                const routes = await this.deps.wahooRepository.listOwnedRoutesForMirror({
                  ...(afterId ? { afterId } : {}),
                  limit: 100,
                  profileId: job.profileId,
                });
                for (const route of routes) {
                  await enqueueWahooOwnedRouteForIntegration({
                    expectedRouteUpdatedAt: route.updatedAt,
                    integrationGeneration: generation,
                    integrationId: job.integrationId,
                    operation: "upsert",
                    profileId: job.profileId,
                    providerSyncRepository: this.deps.providerSyncRepository,
                    routeId: route.id,
                  });
                }
                affectedCount += routes.length;
                if (routes.length < 100) break;
                afterId = routes.at(-1)?.id;
                if (page === 49) throw new Error("owned_route_reconcile_limit_exceeded");
              }
              const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState({
                expectedIntegrationGeneration: generation,
                highWatermark: now,
                id: job.id,
                integrationId: job.integrationId,
                metadata: { affectedCount, status: "reconciled" },
                provider: "wahoo",
                resource: WAHOO_OWNED_ROUTES_RESOURCE,
                workerId,
              });
              return finalized ? "completed" : "failed";
            } catch (error) {
              const retryable = !(error instanceof WahooSyncResultError) || error.retryable;
              const deadLetter = !retryable || job.attempt >= job.maxAttempts;
              const finalized = await this.deps.providerSyncRepository.failJobWithSyncState({
                expectedIntegrationGeneration: generation,
                id: job.id,
                integrationId: job.integrationId,
                lastError: "wahoo_owned_route_reconcile_failed",
                ...(deadLetter
                  ? {}
                  : { nextRunAt: addMinutes(now, Math.min(job.attempt * 5, 60)) }),
                provider: "wahoo",
                resource: WAHOO_OWNED_ROUTES_RESOURCE,
                status: deadLetter ? "dead_lettered" : "failed",
                workerId,
              });
              return finalized ? (deadLetter ? "dead_lettered" : "failed") : "failed";
            }
          }
          if (job.jobType === WAHOO_STAGING_CLEANUP_JOB) {
            if (
              !this.deps.removeWahooStagingObject ||
              !isWahooStagingCleanupPayload(job.payload, job)
            ) {
              const finalized = await this.deps.providerSyncRepository.markJobFailed({
                id: job.id,
                lastError: "invalid_wahoo_staging_cleanup_payload",
                status: "dead_lettered",
                workerId,
              });
              return finalized ? "dead_lettered" : "failed";
            }
            try {
              await this.deps.removeWahooStagingObject(job.payload.path, context.signal);
              if (job.payload.uploadOutcome === "uncertain") {
                const shouldDeadLetter = job.attempt >= job.maxAttempts;
                const finalized = await this.deps.providerSyncRepository.markJobFailed({
                  id: job.id,
                  lastError: "wahoo_staging_cleanup_uncertain",
                  ...(shouldDeadLetter
                    ? {}
                    : { nextRunAt: addMinutes(now, Math.min(job.attempt * 5, 60)) }),
                  status: shouldDeadLetter ? "dead_lettered" : "failed",
                  workerId,
                });
                return finalized ? (shouldDeadLetter ? "dead_lettered" : "failed") : "failed";
              }
              const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                job.id,
                workerId,
              );
              return finalized ? "completed" : "failed";
            } catch {
              const shouldDeadLetter = job.attempt >= job.maxAttempts;
              const finalized = await this.deps.providerSyncRepository.markJobFailed({
                id: job.id,
                lastError:
                  job.payload.uploadOutcome === "uncertain"
                    ? "wahoo_staging_cleanup_uncertain"
                    : "wahoo_staging_cleanup_failed",
                ...(shouldDeadLetter
                  ? {}
                  : { nextRunAt: addMinutes(now, Math.min(job.attempt * 5, 60)) }),
                status: shouldDeadLetter ? "dead_lettered" : "failed",
                workerId,
              });
              return finalized ? (shouldDeadLetter ? "dead_lettered" : "failed") : "failed";
            }
          }
          // A job may have been claimed immediately before a disconnect/reconnect
          // fence. Re-check durable authority immediately before any credential or
          // provider work.
          if (
            job.jobType !== WAHOO_DISCONNECT_JOB &&
            !(await (this.deps.providerSyncRepository.isIntegrationGenerationActive?.({
              generation: job.integrationGeneration ?? 1,
              integrationId: job.integrationId,
              profileId: job.profileId,
            }) ?? true))
          ) {
            await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
            return "completed";
          }
          if (job.jobType === WAHOO_DISCONNECT_JOB) {
            if (
              !isWahooDisconnectPayload(job.payload) ||
              job.payload.expectedGeneration !== job.integrationGeneration
            ) {
              const finalized = await this.deps.providerSyncRepository.finalizeWahooDisconnect({
                generation: job.integrationGeneration ?? 1,
                integrationId: job.integrationId,
                jobId: job.id,
                outcome: "dead_lettered",
                workerId,
              });
              return finalized ? "dead_lettered" : "failed";
            }
            const attempt = await this.deps.providerSyncRepository.beginWahooDisconnectAttempt({
              generation: job.integrationGeneration,
              integrationId: job.integrationId,
              jobId: job.id,
              workerId,
            });
            if (!attempt) return "failed";
            if (attempt.disposition === "superseded") {
              const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                job.id,
                workerId,
              );
              return finalized ? "completed" : "failed";
            }
            if (attempt.disposition === "invalid") {
              const finalized = await this.deps.providerSyncRepository.finalizeWahooDisconnect({
                generation: job.integrationGeneration,
                integrationId: job.integrationId,
                jobId: job.id,
                outcome: "dead_lettered",
                workerId,
              });
              return finalized ? "dead_lettered" : "failed";
            }
            try {
              await (this.deps.wahooClientFactory ?? createWahooClient)({
                accessToken: attempt.accessToken,
              }).disconnect();
              const finalized = await this.deps.providerSyncRepository.finalizeWahooDisconnect({
                generation: job.integrationGeneration,
                integrationId: job.integrationId,
                jobId: job.id,
                outcome: "confirmed",
                workerId,
              });
              return finalized ? "completed" : "failed";
            } catch (error) {
              const status = (error as WahooApiError).status;
              const definitiveFailure =
                typeof status === "number" && status >= 400 && status < 500 && status !== 429;
              const finalized = await this.deps.providerSyncRepository.finalizeWahooDisconnect({
                generation: job.integrationGeneration,
                integrationId: job.integrationId,
                jobId: job.id,
                outcome:
                  definitiveFailure || job.attempt >= job.maxAttempts ? "dead_lettered" : "retry",
                workerId,
              });
              return finalized
                ? definitiveFailure || job.attempt >= job.maxAttempts
                  ? "dead_lettered"
                  : "failed"
                : "failed";
            }
          }
          throw new Error(`Unsupported Wahoo job type: ${job.jobType}`);
        },
      });
    } finally {
      this.deps.executionLimiter?.release(capacity);
    }
  }
}

export function getWahooPublishHorizonDays() {
  return WAHOO_PUBLISH_HORIZON_DAYS;
}

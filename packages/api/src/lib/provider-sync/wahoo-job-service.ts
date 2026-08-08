import { isValidIanaTimeZone } from "@repo/core/calendar";
import type { WahooRepository, WahooSyncRepository } from "../../repositories";
import { isWahooIntegrationEnabled } from "../integrations/oauth-config";
import {
  createWahooClient,
  type WahooApiError,
  type WahooClient,
} from "../integrations/wahoo/client";
import {
  type WahooProjectionSnapshot,
  wahooProjectionSnapshotSchema,
} from "../integrations/wahoo/plan-converter";
import type { WahooSyncService } from "../integrations/wahoo/sync-service";
import { hashPlannedActivityPayload } from "./planned-activities/planned-activity-hash";
import { PLANNED_WORKOUT_RESOURCE } from "./planned-activities/wahoo-planned-activity-policy";
import {
  createWahooSyncWorkerId,
  executeWahooSyncJobs,
  type WahooSyncConcurrencyLimiter,
} from "./wahoo-job-execution";
import {
  getWahooProfileEnrichmentResource,
  isWahooProfileEnrichmentPayload,
  normalizeWahooProfileEnrichment,
  WAHOO_PROFILE_ENRICHMENT_JOB,
} from "./wahoo-profile-enrichment";
import { isWahooStagingCleanupPayload, WAHOO_STAGING_CLEANUP_JOB } from "./wahoo-staging-cleanup";

const WAHOO_PUBLISH_HORIZON_DAYS = 6;
const WAHOO_DISCONNECT_JOB = "wahoo.disconnect";
const WAHOO_PUBLISH_EVENT_JOB = "wahoo.publish_event";
const WAHOO_UNSYNC_EVENT_JOB = "wahoo.unsync_event";

type WahooDisconnectPayload = { expectedGeneration: number };
type WahooPublishJobPayload = {
  performanceModelAsOf: string;
  eventId: string;
  operation: "publish";
  projectionHash: string;
  projectionSnapshot: WahooProjectionSnapshot;
  startsAt: string;
  timezone: string;
};

type WahooUnsyncJobPayload = {
  eventId: string;
  operation: "unsync";
  unsyncTarget?: { externalId: string; resourceLinkId: string };
};

type WahooJobPayload = WahooPublishJobPayload | WahooUnsyncJobPayload;

function isWahooJobPayload(value: unknown): value is WahooJobPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.eventId !== "string" ||
    payload.eventId.length === 0 ||
    (payload.operation !== "publish" && payload.operation !== "unsync")
  )
    return false;
  if (payload.operation === "publish") {
    return (
      typeof payload.startsAt === "string" &&
      !Number.isNaN(Date.parse(payload.startsAt)) &&
      typeof payload.timezone === "string" &&
      isValidIanaTimeZone(payload.timezone) &&
      typeof payload.performanceModelAsOf === "string" &&
      !Number.isNaN(Date.parse(payload.performanceModelAsOf)) &&
      typeof payload.projectionHash === "string" &&
      payload.projectionHash.length > 0 &&
      wahooProjectionSnapshotSchema.safeParse(payload.projectionSnapshot).success &&
      payload.unsyncTarget === undefined
    );
  }
  if (
    payload.performanceModelAsOf !== undefined ||
    payload.projectionHash !== undefined ||
    payload.projectionSnapshot !== undefined ||
    payload.startsAt !== undefined ||
    payload.timezone !== undefined
  )
    return false;
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
      providerSyncRepository: WahooSyncRepository;
      executionLimiter?: WahooSyncConcurrencyLimiter;
      /** Required to drain planned activity jobs; omitted deployments fail closed. */
      syncService?: WahooSyncService;
      wahooRepository: WahooRepository;
      removeWahooStagingObject?: (path: string, signal: AbortSignal) => Promise<void>;
      wahooClientFactory?: (input: {
        accessToken: string;
      }) => Pick<WahooClient, "disconnect" | "getUserProfile">;
    },
  ) {}

  async processDueJobs(input: {
    concurrency?: number;
    leaseMs?: number;
    limit?: number;
    workerId?: string;
  }): Promise<{ completed: number; failed: number; processed: number }> {
    if (!isWahooIntegrationEnabled()) return { completed: 0, failed: 0, processed: 0 };
    const concurrency = Math.max(1, Math.floor(input.concurrency ?? 4));
    const requested = Math.min(Math.max(1, Math.floor(input.limit ?? 10)), concurrency);
    const capacity = this.deps.executionLimiter?.reserve(requested) ?? requested;
    if (capacity === 0) return { completed: 0, failed: 0, processed: 0 };
    const now = new Date().toISOString();
    const leaseMs = input.leaseMs ?? 5 * 60_000;
    const workerId = createWahooSyncWorkerId(input.workerId ?? "wahoo-sync-worker");
    const plannedActivityDrainEnabled = Boolean(this.deps.syncService);

    try {
      const jobs = await this.deps.providerSyncRepository.claimDueJobs({
        jobTypes: [
          WAHOO_DISCONNECT_JOB,
          WAHOO_PROFILE_ENRICHMENT_JOB,
          ...(plannedActivityDrainEnabled ? [WAHOO_PUBLISH_EVENT_JOB, WAHOO_UNSYNC_EVENT_JOB] : []),
          ...(this.deps.removeWahooStagingObject ? [WAHOO_STAGING_CLEANUP_JOB] : []),
        ],
        limit: capacity,
        lockExpiresAt: new Date(Date.parse(now) + leaseMs).toISOString(),
        now,
        provider: "wahoo",
        workerId,
      });

      return await executeWahooSyncJobs({
        concurrency: capacity,
        getEndingQueueTelemetry: () =>
          this.deps.providerSyncRepository.getQueueTelemetry?.({
            jobTypes: [
              ...(plannedActivityDrainEnabled
                ? [WAHOO_PUBLISH_EVENT_JOB, WAHOO_UNSYNC_EVENT_JOB]
                : []),
              ...(this.deps.removeWahooStagingObject ? [WAHOO_STAGING_CLEANUP_JOB] : []),
            ],
            now: new Date().toISOString(),
            provider: "wahoo",
          }) ?? Promise.resolve({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
        jobFamily: plannedActivityDrainEnabled ? "wahoo_sync" : "lifecycle",
        jobs,
        leaseRenewIntervalMs: Math.max(1_000, Math.floor(leaseMs / 3)),
        renewLease: (job) =>
          this.deps.providerSyncRepository.renewJobLease({
            id: job.id,
            lockExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
            workerId,
          }),
        processJob: async (job, context) => {
          if (job.jobType === WAHOO_PROFILE_ENRICHMENT_JOB) {
            if (!isWahooProfileEnrichmentPayload(job.payload)) {
              const finalized = await this.deps.providerSyncRepository.markJobFailed({
                id: job.id,
                lastError: "invalid_wahoo_profile_enrichment_payload",
                status: "dead_lettered",
                workerId,
              });
              return finalized ? "dead_lettered" : "failed";
            }
            const generation = job.integrationGeneration ?? 0;
            const enrichmentResource = getWahooProfileEnrichmentResource(job.payload.trigger);
            if (
              generation < 1 ||
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
              const scopes = new Set((integration?.scope ?? "").split(/[\s,]+/).filter(Boolean));
              if (
                !integration ||
                integration.id !== job.integrationId ||
                integration.integrationGeneration !== generation ||
                !scopes.has("user_read")
              ) {
                const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState({
                  expectedIntegrationGeneration: generation,
                  highWatermark: now,
                  id: job.id,
                  integrationId: job.integrationId,
                  metadata: { status: "skipped" },
                  provider: "wahoo",
                  resource: enrichmentResource,
                  workerId,
                });
                return finalized ? "completed" : "failed";
              }

              if (context.signal.aborted) throw new Error("wahoo_profile_enrichment_aborted");
              const client = (this.deps.wahooClientFactory ?? createWahooClient)({
                accessToken: integration.accessToken,
              });
              const profile = await client.getUserProfile();
              if (context.signal.aborted) throw new Error("wahoo_profile_enrichment_aborted");
              const enrichment = normalizeWahooProfileEnrichment(profile);
              const applied = await this.deps.wahooRepository.applyProfileEnrichmentIfAbsent({
                ...enrichment,
                expectedIntegrationGeneration: generation,
                integrationId: job.integrationId,
                profileId: job.profileId,
              });
              const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState({
                expectedIntegrationGeneration: generation,
                highWatermark: now,
                id: job.id,
                integrationId: job.integrationId,
                metadata: {
                  fields_imported: applied.fieldsFilled,
                  fields_kept: applied.fieldsKept,
                  status: "succeeded",
                  trigger: job.payload.trigger,
                },
                provider: "wahoo",
                resource: enrichmentResource,
                workerId,
              });
              return finalized ? "completed" : "failed";
            } catch (error) {
              if (error instanceof Error && error.message === "integration_generation_inactive") {
                const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                  job.id,
                  workerId,
                );
                return finalized ? "completed" : "failed";
              }
              const deadLetter = job.attempt >= job.maxAttempts;
              const finalized = await this.deps.providerSyncRepository.failJobWithSyncState({
                expectedIntegrationGeneration: generation,
                id: job.id,
                integrationId: job.integrationId,
                lastError: "wahoo_profile_enrichment_failed",
                ...(deadLetter
                  ? {}
                  : { nextRunAt: addMinutes(now, Math.min(job.attempt * 5, 60)) }),
                provider: "wahoo",
                resource: enrichmentResource,
                status: deadLetter ? "dead_lettered" : "failed",
                workerId,
              });
              return finalized ? (deadLetter ? "dead_lettered" : "failed") : "failed";
            }
          }
          if (job.jobType === WAHOO_PUBLISH_EVENT_JOB || job.jobType === WAHOO_UNSYNC_EVENT_JOB) {
            const expectedOperation =
              job.jobType === WAHOO_PUBLISH_EVENT_JOB ? "publish" : "unsync";
            if (
              !this.deps.syncService ||
              !isWahooJobPayload(job.payload) ||
              job.payload.operation !== expectedOperation ||
              job.operation !== expectedOperation ||
              job.internalResourceId !== job.payload.eventId
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
              const payload = job.payload;
              const result =
                payload.operation === "publish"
                  ? await this.deps.syncService.syncEvent(payload.eventId, job.profileId, {
                      performanceModelAsOf: payload.performanceModelAsOf,
                      expectedProjectionHash: payload.projectionHash,
                      expectedStartsAt: payload.startsAt,
                      expectedTimezone: payload.timezone,
                      expectedIntegrationGeneration: generation,
                      integrationId: job.integrationId,
                      queuedProjectionSnapshot: payload.projectionSnapshot,
                      signal: context.signal,
                      updateDesiredProjection: async (latest) => {
                        const desiredPayload = {
                          eventId: payload.eventId,
                          operation: "publish" as const,
                          projectionHash: latest.projectionHash,
                          projectionSnapshot: latest.projectionSnapshot,
                          startsAt: payload.startsAt,
                          timezone: payload.timezone,
                        };
                        return this.deps.providerSyncRepository.updateRunningJobDesiredState({
                          expectedIntegrationGeneration: generation,
                          id: job.id,
                          integrationId: job.integrationId,
                          payload: {
                            performanceModelAsOf: latest.performanceModelAsOf,
                            ...desiredPayload,
                          },
                          payloadHash: hashPlannedActivityPayload(desiredPayload),
                          profileId: job.profileId,
                          provider: "wahoo",
                          workerId,
                        });
                      },
                    })
                  : await this.deps.syncService.unsyncEvent(
                      payload.eventId,
                      job.profileId,
                      payload.unsyncTarget,
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

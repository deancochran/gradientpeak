import type { WahooIntegrationRecord, WahooSyncRepository } from "../../repositories";
import type { createActivityImportRepository } from "../../repositories/activity-import-repository";
import { isWahooIntegrationEnabled } from "../integrations/oauth-config";
import {
  getWahooActivityStartedAtFailureReason,
  type WahooActivityImporter,
} from "../integrations/wahoo/activity-importer";
import {
  activateWahooAccessToken,
  refreshWahooAccessToken,
  WahooClient,
  type WahooTokenRefreshResult,
  type WahooWorkoutSummary,
} from "../integrations/wahoo/client";
import {
  resolveWahooCredentials,
  WAHOO_AUTHORIZATION_RESET_REQUIRED_MESSAGE,
  WahooAuthorizationResetRequiredError,
} from "../integrations/wahoo/credentials";
import { logger } from "../logger";
import {
  createWahooSyncWorkerId,
  executeWahooSyncJobs,
  type WahooSyncConcurrencyLimiter,
} from "./wahoo-job-execution";

const WAHOO_ACTIVITY_HISTORY_JOB = "wahoo.activity_history_reconcile";
const WAHOO_ACTIVITY_HISTORY_RESOURCE = "historical_activities";
const MAX_IMPORT_TELEMETRY_COUNT = 100_000;

function boundedImportTelemetryCount(value: number) {
  return Math.min(MAX_IMPORT_TELEMETRY_COUNT, Math.max(0, Math.floor(value)));
}
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGES_PER_LEASE = 4;

class StaleIntegrationGenerationError extends Error {
  constructor() {
    super("integration_generation_inactive");
  }
}

class PermanentActivityHistoryError extends Error {
  constructor(public readonly code: "missing_started_at" | "invalid_started_at") {
    super(code);
  }
}

type WahooActivityHistoryPayload = {
  trigger: "connect" | "manual" | "scheduled";
  importRunId?: string;
};

type WahooWorkoutSummaryClient = {
  listWorkoutSummaries(input: {
    endDate: string;
    page?: number;
    perPage?: number;
    startDate: string;
  }): Promise<{
    page?: number;
    reachedStartBoundary?: boolean;
    sourceCount: number;
    summaries: WahooWorkoutSummary[];
    total?: number | null;
  }>;
  getWorkoutSummary?(workoutSummaryId: string): Promise<WahooWorkoutSummary>;
};

function addMinutes(isoString: string, minutes: number): string {
  const date = new Date(isoString);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

function isActivityHistoryPayload(value: unknown): value is WahooActivityHistoryPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "trigger" in value &&
      (value.trigger === "connect" ||
        value.trigger === "manual" ||
        value.trigger === "scheduled") &&
      (!("importRunId" in value) ||
        value.importRunId === undefined ||
        typeof value.importRunId === "string"),
  );
}

function createDefaultWahooClient(integration: WahooIntegrationRecord): WahooWorkoutSummaryClient {
  return new WahooClient({
    accessToken: integration.accessToken,
    refreshToken: integration.refreshToken ?? undefined,
  });
}

export class WahooActivityHistoryJobService {
  constructor(
    private readonly deps: {
      activateAccessToken?: (accessToken: string) => Promise<void>;
      importer: WahooActivityImporter;
      importRuns: ReturnType<typeof createActivityImportRepository>;
      executionLimiter?: WahooSyncConcurrencyLimiter;
      providerSyncRepository: WahooSyncRepository;
      refreshAccessToken?: (refreshToken: string) => Promise<WahooTokenRefreshResult>;
      wahooClientFactory?: (integration: WahooIntegrationRecord) => WahooWorkoutSummaryClient;
      wahooRepository: {
        findWahooIntegrationByProfileId(profileId: string): Promise<WahooIntegrationRecord | null>;
        updateWahooIntegrationTokens(input: {
          accessToken: string;
          expectedCredentialGeneration: number;
          expectedIntegrationGeneration: number;
          expiresAt: string | null;
          id: string;
          refreshToken: string | null;
        }): Promise<number | null>;
        markWahooReconnectRequired?(input: {
          expectedCredentialGeneration: number;
          expectedIntegrationGeneration: number;
          id: string;
        }): Promise<boolean>;
      };
    },
  ) {}

  async processDueJobs(input: {
    concurrency?: number;
    leaseMs?: number;
    limit?: number;
    workerId?: string;
  }): Promise<{ completed: number; failed: number; processed: number }> {
    if (!isWahooIntegrationEnabled()) return { completed: 0, failed: 0, processed: 0 };
    const concurrency = Math.max(1, Math.floor(input.concurrency ?? 2));
    const requested = Math.min(Math.max(1, Math.floor(input.limit ?? 5)), concurrency);
    const capacity = this.deps.executionLimiter?.reserve(requested) ?? requested;
    if (capacity === 0) return { completed: 0, failed: 0, processed: 0 };
    const now = new Date().toISOString();
    const leaseMs = input.leaseMs ?? 10 * 60_000;
    const workerId = createWahooSyncWorkerId(input.workerId ?? "wahoo-activity-history-worker");

    try {
      const jobs = await this.deps.providerSyncRepository.claimDueJobs({
        jobTypes: [WAHOO_ACTIVITY_HISTORY_JOB],
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
            jobTypes: [WAHOO_ACTIVITY_HISTORY_JOB],
            now: new Date().toISOString(),
            provider: "wahoo",
          }) ?? Promise.resolve({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
        jobFamily: "activity_history",
        jobs,
        leaseRenewIntervalMs: Math.max(1_000, Math.floor(leaseMs / 3)),
        renewLease: (job) =>
          this.deps.providerSyncRepository.renewJobLease({
            id: job.id,
            lockExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
            workerId,
          }),
        processJob: async (job, { signal }) => {
          signal.throwIfAborted();
          if (
            !(await (this.deps.providerSyncRepository.isIntegrationGenerationActive?.({
              generation: job.integrationGeneration ?? 1,
              integrationId: job.integrationId,
              profileId: job.profileId,
            }) ?? true))
          ) {
            await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
            return "completed";
          }
          if (!isActivityHistoryPayload(job.payload)) {
            const finalized = await this.deps.providerSyncRepository.markJobFailed({
              id: job.id,
              lastError: "Invalid Wahoo activity history job payload",
              status: "dead_lettered",
              workerId,
            });
            return finalized === false ? "failed" : "dead_lettered";
          }

          let activeImportRunId: string | undefined;
          let importRunCompleted = false;
          try {
            const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(
              job.profileId,
            );
            if (!integration || integration.id !== job.integrationId) {
              const finalized = await this.deps.providerSyncRepository.markJobSucceeded(
                job.id,
                workerId,
              );
              return finalized === false ? "failed" : "completed";
            }

            const generation = job.integrationGeneration ?? 1;
            const assertActive = async () => {
              signal.throwIfAborted();
              if (
                !(await (this.deps.providerSyncRepository.isIntegrationGenerationActive?.({
                  generation,
                  integrationId: job.integrationId,
                  profileId: job.profileId,
                }) ?? true))
              ) {
                throw new StaleIntegrationGenerationError();
              }
              signal.throwIfAborted();
            };
            await assertActive();

            let run = job.payload.importRunId
              ? await this.deps.importRuns.read(job.payload.importRunId)
              : null;
            if (
              job.payload.importRunId &&
              (!run ||
                run.profile_id !== job.profileId ||
                run.integration_id !== job.integrationId ||
                run.integration_generation !== generation)
            ) {
              const finalized = await this.deps.providerSyncRepository.markJobFailed({
                id: job.id,
                lastError: "Invalid activity import run identity",
                status: "dead_lettered",
                workerId,
              });
              return finalized === false ? "failed" : "dead_lettered";
            }
            activeImportRunId = run?.id;

            if (!/^\d+$/.test(integration.externalId)) {
              throw new Error("Wahoo integration external ID is not numeric");
            }
            const resolvedIntegration = await resolveWahooCredentials({
              activateAccessToken: this.deps.activateAccessToken ?? activateWahooAccessToken,
              integration,
              persistTokens: (tokens) =>
                this.deps.wahooRepository.updateWahooIntegrationTokens({
                  ...tokens,
                  expectedCredentialGeneration: tokens.credentialGeneration,
                  expectedIntegrationGeneration: tokens.integrationGeneration,
                }),
              markReconnectRequired: ({ credentialGeneration, id, integrationGeneration }) =>
                this.deps.wahooRepository.markWahooReconnectRequired?.({
                  expectedCredentialGeneration: credentialGeneration,
                  expectedIntegrationGeneration: integrationGeneration,
                  id,
                }) ?? Promise.resolve(false),
              readCurrentCredentials: () =>
                this.deps.wahooRepository.findWahooIntegrationByProfileId(job.profileId),
              refreshAccessToken: this.deps.refreshAccessToken ?? refreshWahooAccessToken,
            });
            await assertActive();
            const providerUserId = Number.parseInt(resolvedIntegration.externalId, 10);
            if (!run) {
              run = await this.deps.importRuns.create({
                profileId: job.profileId,
                integrationId: job.integrationId,
                integrationGeneration: generation,
                kind:
                  job.payload.trigger === "connect"
                    ? "onboarding"
                    : job.payload.trigger === "manual"
                      ? "manual_sync"
                      : "history_sync",
                windowStartAt: new Date("1900-01-01T00:00:00.000Z"),
                windowEndAt: new Date(now),
                nextPage: 1,
                now: new Date(now),
              });
            }
            activeImportRunId = run.id;
            if (!job.payload.importRunId) {
              const bound = await this.deps.providerSyncRepository.bindJobImportRun({
                expectedIntegrationGeneration: generation,
                id: job.id,
                importRunId: run.id,
                payload: { ...job.payload, importRunId: run.id },
                workerId,
              });
              if (!bound) {
                await this.deps.importRuns.fail(run.id, "job_binding_lost");
                return "failed";
              }
            }
            if (run.status === "queued") {
              const started = await this.deps.importRuns.start(run.id);
              if (!started) {
                const continued = await this.deps.providerSyncRepository.continueJob({
                  expectedIntegrationGeneration: generation,
                  id: job.id,
                  importRunId: run.id,
                  payload: { ...job.payload, importRunId: run.id },
                  runAt: new Date(Date.now() + 1_000).toISOString(),
                  workerId,
                });
                return continued ? "completed" : "failed";
              }
              run = started;
            }
            if (run.status === "failed") {
              const resumed = await this.deps.importRuns.resume(run.id);
              if (!resumed) {
                const continued = await this.deps.providerSyncRepository.continueJob({
                  expectedIntegrationGeneration: generation,
                  id: job.id,
                  importRunId: run.id,
                  payload: { ...job.payload, importRunId: run.id },
                  runAt: new Date(Date.now() + 1_000).toISOString(),
                  workerId,
                });
                return continued ? "completed" : "failed";
              }
              run = resumed;
            }
            const historyStart = run.window_start_at?.toISOString() ?? "1900-01-01T00:00:00.000Z";
            const historyEnd = run.window_end_at?.toISOString() ?? now;
            const completeHistoryJob = async (
              completedRun: NonNullable<typeof run>,
              pageCount: number,
            ) =>
              this.deps.providerSyncRepository.completeJobWithSyncState({
                expectedIntegrationGeneration: job.integrationGeneration ?? 1,
                highWatermark: historyEnd,
                id: job.id,
                integrationId: job.integrationId,
                metadata: {
                  activityHistoryCoverage: {
                    end: historyEnd,
                    // Written only after every page and import completes. This records a
                    // bounded source read, not proof that an empty result means no older
                    // provider activities exist.
                    highWatermark: historyEnd,
                    start: historyStart,
                    itemCount: completedRun.discovered_count,
                    pageCount,
                    importRunId: completedRun.id,
                    version: 3,
                  },
                },
                provider: "wahoo",
                resource: WAHOO_ACTIVITY_HISTORY_RESOURCE,
                workerId,
              });
            if (run.status === "completed") {
              const finalized = await completeHistoryJob(
                run,
                Math.max(1, Math.ceil(run.discovered_count / DEFAULT_PAGE_SIZE)),
              );
              return finalized === false ? "failed" : "completed";
            }
            if (run.status !== "running") throw new Error("activity_import_run_unavailable");
            const client = (this.deps.wahooClientFactory ?? createDefaultWahooClient)(
              resolvedIntegration,
            );
            let page = run.next_page ?? 1;
            let terminal = false;
            for (let pageOffset = 0; pageOffset < MAX_PAGES_PER_LEASE; pageOffset += 1) {
              await assertActive();
              const pageResult = await client.listWorkoutSummaries({
                endDate: historyEnd,
                startDate: historyStart,
                page,
                perPage: DEFAULT_PAGE_SIZE,
              });
              if (pageResult.page !== undefined && pageResult.page !== page)
                throw new Error("activity_history_page_mismatch");
              let imported = 0;
              let skipped = 0;
              let failed = 0;
              let earliestTimestamp: number | null = null;
              let latestTimestamp: number | null = null;
              for (const summary of pageResult.summaries) {
                const startedAtFailureReason = getWahooActivityStartedAtFailureReason(
                  summary.started_at,
                );
                if (startedAtFailureReason) {
                  throw new PermanentActivityHistoryError(startedAtFailureReason);
                }
                const importSummary = summary.file?.url
                  ? summary
                  : await (async () => {
                      if (!client.getWorkoutSummary) {
                        throw new Error(
                          `Wahoo summary ${summary.id} omitted its artifact URL and detail lookup is unavailable`,
                        );
                      }
                      const workoutId = summary.workout_id ?? summary.workout?.id;
                      if (!workoutId) {
                        throw new Error(
                          `Wahoo summary ${summary.id} omitted its artifact URL and Wahoo workout identity`,
                        );
                      }
                      await assertActive();
                      const detail = await client.getWorkoutSummary(workoutId.toString());
                      await assertActive();
                      return {
                        ...summary,
                        ...detail,
                        workout_id: summary.workout_id ?? detail.workout_id,
                        workout: summary.workout ?? detail.workout,
                        started_at: summary.started_at,
                      };
                    })();
                await assertActive();
                const startedAt = importSummary.started_at;
                const result = await this.deps.importer.importWorkoutSummary(
                  providerUserId,
                  importSummary,
                  {
                    integrationGeneration: generation,
                    integrationId: job.integrationId,
                    importRunId: run.id,
                    deferAthleteStateRefresh: true,
                    signal,
                  },
                );
                await assertActive();
                if (!result.success) {
                  failed += 1;
                  logger.warn("Wahoo activity history summary import failed", {
                    jobFamily: "activity_history",
                    provider: "wahoo",
                  });
                } else if (result.skipped) skipped += 1;
                else imported += 1;
                const startedAtTimestamp = Date.parse(startedAt as string);
                earliestTimestamp =
                  earliestTimestamp === null
                    ? startedAtTimestamp
                    : Math.min(earliestTimestamp, startedAtTimestamp);
                latestTimestamp =
                  latestTimestamp === null
                    ? startedAtTimestamp
                    : Math.max(latestTimestamp, startedAtTimestamp);
              }
              if (failed > 0) throw new Error("activity_history_import_failed");
              terminal =
                (pageResult.total !== undefined &&
                  pageResult.total !== null &&
                  page * DEFAULT_PAGE_SIZE >= pageResult.total) ||
                pageResult.sourceCount < DEFAULT_PAGE_SIZE ||
                pageResult.reachedStartBoundary === true;
              const nextPage = terminal ? null : page + 1;
              run = await this.deps.importRuns.recordPageCommitted({
                id: run.id,
                discovered: pageResult.sourceCount,
                imported,
                skipped,
                failed,
                earliestActivityAt: earliestTimestamp === null ? null : new Date(earliestTimestamp),
                latestActivityAt: latestTimestamp === null ? null : new Date(latestTimestamp),
                nextPage,
                now: new Date(),
              });
              if (terminal) break;
              page += 1;
            }

            await assertActive();
            if (!terminal) {
              const continued = await this.deps.providerSyncRepository.continueJob({
                expectedIntegrationGeneration: generation,
                id: job.id,
                importRunId: run.id,
                payload: { ...job.payload, importRunId: run.id },
                runAt: new Date().toISOString(),
                workerId,
              });
              return continued ? "completed" : "failed";
            }
            const completedRun = await this.deps.importRuns.complete(run.id, new Date());
            if (!completedRun) throw new Error("activity_import_run_completion_lost");
            run = completedRun;
            importRunCompleted = true;
            const finalized = await completeHistoryJob(run, page);
            if (finalized === false) return "failed";
            logger.info("Wahoo activity history import completed", {
              discoveredCount: boundedImportTelemetryCount(run.discovered_count),
              importedCount: boundedImportTelemetryCount(run.imported_count),
              jobFamily: "activity_history",
              outcome: "completed",
              provider: "wahoo",
              skippedCount: boundedImportTelemetryCount(run.skipped_count),
            });
            return "completed";
          } catch (error) {
            if (activeImportRunId && !importRunCompleted)
              await this.deps.importRuns.fail(
                activeImportRunId,
                error instanceof Error ? error.message : "activity_history_failed",
              );
            if (signal.aborted) return "failed";
            if (error instanceof StaleIntegrationGenerationError) {
              await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
              return "completed";
            }
            const authorizationResetRequired =
              error instanceof WahooAuthorizationResetRequiredError;
            if (error instanceof PermanentActivityHistoryError) {
              const finalized = await this.deps.providerSyncRepository.markJobFailed({
                id: job.id,
                lastError: error.code,
                status: "dead_lettered",
                workerId,
              });
              return finalized === false ? "failed" : "dead_lettered";
            }
            const lastError = authorizationResetRequired
              ? WAHOO_AUTHORIZATION_RESET_REQUIRED_MESSAGE
              : "activity_history_failed";
            const shouldDeadLetter = authorizationResetRequired || job.attempt >= job.maxAttempts;
            logger.warn("Wahoo activity history import did not complete", {
              jobFamily: "activity_history",
              outcome: shouldDeadLetter ? "dead_lettered" : "retry_scheduled",
              provider: "wahoo",
            });
            const nextRunAt = shouldDeadLetter
              ? undefined
              : addMinutes(now, Math.min(job.attempt * 5, 60));
            const finalized = await this.deps.providerSyncRepository.failJobWithSyncState({
              expectedIntegrationGeneration: job.integrationGeneration ?? 1,
              id: job.id,
              integrationId: job.integrationId,
              lastError,
              nextRunAt,
              provider: "wahoo",
              resource: WAHOO_ACTIVITY_HISTORY_RESOURCE,
              status: shouldDeadLetter ? "dead_lettered" : "failed",
              workerId,
            });
            if (finalized === false) return "failed";
            return shouldDeadLetter ? "dead_lettered" : "failed";
          }
        },
      });
    } finally {
      this.deps.executionLimiter?.release(capacity);
    }
  }
}

export function getWahooActivityHistoryJobType() {
  return WAHOO_ACTIVITY_HISTORY_JOB;
}

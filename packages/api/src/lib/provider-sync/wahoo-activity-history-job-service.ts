import { reconcileOnboardingStatus } from "../../application/onboarding/readiness";
import { finalizeThresholdsAfterHistoryImport } from "../../application/performance-model/reconcile-thresholds";
import type { getRequiredDb } from "../../db";
import type { WahooIntegrationRecord, WahooSyncRepository } from "../../repositories";
import type {
  ActivityImportSkipDiagnostic,
  ActivityImportSkipReasonCode,
  createActivityImportRepository,
} from "../../repositories/activity-import-repository";
import { isWahooIntegrationEnabled } from "../integrations/oauth-config";
import {
  getWahooActivityStartedAtFailureReason,
  type WahooActivityImporter,
} from "../integrations/wahoo/activity-importer";
import {
  activateWahooAccessToken,
  isWahooActivityItemError,
  refreshWahooAccessToken,
  WahooClient,
  WahooIntegrationError,
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
const RECENT_HISTORY_WINDOW_DAYS = 90;
const ONBOARDING_SUMMARY_LIMIT = 100;
const MAX_IMPORT_TELEMETRY_COUNT = 100_000;

function boundedImportTelemetryCount(value: number) {
  return Math.min(MAX_IMPORT_TELEMETRY_COUNT, Math.max(0, Math.floor(value)));
}
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGES_PER_LEASE = 4;

function skippedImportReason(reason: string | undefined): ActivityImportSkipReasonCode {
  switch (reason) {
    case "Activity already imported":
      return "already_imported";
    case "Activity artifact format is unsupported":
    case "Activity file semantics are unsupported":
      return "unsupported_activity_file";
    case "Activity persistence semantics are unsupported":
      return "unsupported_activity_invariant";
    case "Provider activity resolves to an existing canonical activity":
      return "canonical_identity_mismatch";
    case "Canonical activity evidence was unchanged":
      return "canonical_evidence_unchanged";
    case "activity_import_failed":
      return "activity_import_failed";
    default:
      return "unspecified";
  }
}

function skippedImportDiagnostic(
  summaryId: unknown,
  reason: string | undefined,
): ActivityImportSkipDiagnostic | null {
  if (typeof summaryId !== "number" || !Number.isSafeInteger(summaryId) || summaryId < 0) {
    return null;
  }
  return { providerExternalId: String(summaryId), reason: skippedImportReason(reason) };
}

class StaleIntegrationGenerationError extends WahooIntegrationError {
  constructor() {
    super({ kind: "import_unavailable", scope: "job" });
    this.name = "StaleIntegrationGenerationError";
  }
}

type WahooActivityHistoryPayload = {
  trigger: "connect" | "manual" | "onboarding" | "scheduled";
  importRunId?: string;
};

type WahooWorkoutSummaryClient = {
  listWorkoutSummaries(input: {
    endDate: string;
    page?: number;
    perPage?: number;
    signal?: AbortSignal;
    startDate: string;
  }): Promise<{
    page?: number;
    reachedStartBoundary?: boolean;
    sourceCount: number;
    summaries: WahooWorkoutSummary[];
    total?: number | null;
  }>;
  getWorkoutSummary?(workoutSummaryId: string, signal?: AbortSignal): Promise<WahooWorkoutSummary>;
};

function addMinutes(isoString: string, minutes: number): string {
  const date = new Date(isoString);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

function recentHistoryStartAt(endAt: Date): Date {
  return new Date(endAt.getTime() - RECENT_HISTORY_WINDOW_DAYS * 24 * 60 * 60_000);
}

function boundedItemFailureCode(code: string | undefined): string {
  return code && /^[a-z][a-z0-9_]{0,63}$/.test(code) ? code : "activity_import_failed";
}

function isActivityHistoryPayload(value: unknown): value is WahooActivityHistoryPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "trigger" in value &&
      (value.trigger === "connect" ||
        value.trigger === "manual" ||
        value.trigger === "onboarding" ||
        value.trigger === "scheduled") &&
      (!("importRunId" in value) ||
        value.importRunId === undefined ||
        typeof value.importRunId === "string"),
  );
}

function createDefaultWahooClient(integration: WahooIntegrationRecord): WahooWorkoutSummaryClient {
  return new WahooClient({
    accessToken: integration.accessToken,
    ...(integration.refreshToken === null ? {} : { refreshToken: integration.refreshToken }),
  });
}

export class WahooActivityHistoryJobService {
  constructor(
    private readonly deps: {
      activateAccessToken?: (accessToken: string, signal?: AbortSignal) => Promise<void>;
      importer: WahooActivityImporter;
      importRuns: ReturnType<typeof createActivityImportRepository>;
      executionLimiter?: WahooSyncConcurrencyLimiter;
      providerSyncRepository: WahooSyncRepository;
      db?: ReturnType<typeof getRequiredDb>;
      reconcileOnboardingStatus?: typeof reconcileOnboardingStatus;
      refreshAccessToken?: (
        refreshToken: string,
        signal?: AbortSignal,
      ) => Promise<WahooTokenRefreshResult>;
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
          const activityHistoryPayload = job.payload;

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
              (job.importRunId ?? null) !== (job.payload.importRunId ?? null) ||
              (job.payload.importRunId &&
                (!run ||
                  run.profile_id !== job.profileId ||
                  run.integration_id !== job.integrationId ||
                  run.integration_generation !== generation))
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
              activateAccessToken: (accessToken) =>
                (this.deps.activateAccessToken ?? activateWahooAccessToken)(accessToken, signal),
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
              refreshAccessToken: (refreshToken) =>
                (this.deps.refreshAccessToken ?? refreshWahooAccessToken)(refreshToken, signal),
            });
            await assertActive();
            const providerUserId = Number.parseInt(resolvedIntegration.externalId, 10);
            if (!run) {
              const windowEndAt = new Date(now);
              run = await this.deps.importRuns.create({
                profileId: job.profileId,
                integrationId: job.integrationId,
                integrationGeneration: generation,
                kind:
                  job.payload.trigger === "onboarding"
                    ? "onboarding"
                    : job.payload.trigger === "manual"
                      ? "manual_sync"
                      : "history_sync",
                // Every automatic path is recent-only. Onboarding additionally stops after
                // considering 100 summaries, while later manual/scheduled runs can reconcile
                // the complete captured recent window without ever falling back to all history.
                windowStartAt: recentHistoryStartAt(windowEndAt),
                windowEndAt,
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
            const historyEnd = run.window_end_at?.toISOString() ?? now;
            const oldestAllowedStart = recentHistoryStartAt(new Date(historyEnd));
            const persistedHistoryStart = run.window_start_at ?? oldestAllowedStart;
            const historyStart = new Date(
              Math.max(persistedHistoryStart.getTime(), oldestAllowedStart.getTime()),
            ).toISOString();
            const completeHistoryJob = async (
              completedRun: NonNullable<typeof run>,
              pageCount: number,
            ) =>
              this.deps.providerSyncRepository.completeJobWithSyncState({
                expectedIntegrationGeneration: job.integrationGeneration ?? 1,
                highWatermark: historyEnd,
                id: job.id,
                importRunId: completedRun.id,
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
            const reconcileCompletedOnboarding = async () => {
              if (activityHistoryPayload.trigger !== "onboarding" || !this.deps.db) return;
              try {
                await (this.deps.reconcileOnboardingStatus ?? reconcileOnboardingStatus)({
                  db: this.deps.db,
                  profileId: job.profileId,
                });
              } catch {
                // Import completion and coverage are already durable. A later completed-run
                // replay, athlete-state publication, or authenticated reconcileStatus call
                // converges this idempotent lifecycle projection.
                logger.warn("Wahoo onboarding reconciliation pending", {
                  jobFamily: "activity_history",
                  operation: "reconcile_onboarding",
                  outcome: "unexpected_error",
                  provider: "wahoo",
                });
              }
            };
            if (run.status === "completed") {
              importRunCompleted = true;
              const finalized = await completeHistoryJob(
                run,
                Math.max(1, Math.ceil(run.discovered_count / DEFAULT_PAGE_SIZE)),
              );
              if (finalized === false) return "failed";
              await reconcileCompletedOnboarding();
              return "completed";
            }
            if (run.status !== "running") throw new Error("activity_import_run_unavailable");
            const client = (this.deps.wahooClientFactory ?? createDefaultWahooClient)(
              resolvedIntegration,
            );
            // A running Wahoo run with no next page has durably committed its terminal
            // page. It is waiting only for completion/freshness finalization, not for
            // page one to be retried.
            let page = run.next_page ?? 1;
            let terminal =
              run.next_page === null ||
              (activityHistoryPayload.trigger === "onboarding" &&
                run.discovered_count >= ONBOARDING_SUMMARY_LIMIT);
            for (
              let pageOffset = 0;
              !terminal && pageOffset < MAX_PAGES_PER_LEASE;
              pageOffset += 1
            ) {
              await assertActive();
              const pageResult = await client.listWorkoutSummaries({
                endDate: historyEnd,
                startDate: historyStart,
                page,
                perPage: DEFAULT_PAGE_SIZE,
                signal,
              });
              await assertActive();
              if (pageResult.page !== undefined && pageResult.page !== page)
                throw new Error("activity_history_page_mismatch");
              const remainingOnboardingSummaries =
                activityHistoryPayload.trigger === "onboarding"
                  ? Math.max(0, ONBOARDING_SUMMARY_LIMIT - run.discovered_count)
                  : Number.POSITIVE_INFINITY;
              // Apply the cap before detail lookup, artifact download, or importer work.
              const summaries = pageResult.summaries.slice(0, remainingOnboardingSummaries);
              let imported = 0;
              let failed = 0;
              let lastFailureCode: string | undefined;
              let skipped = 0;
              const skippedDiagnostics: ActivityImportSkipDiagnostic[] = [];
              let earliestTimestamp: number | null = null;
              let latestTimestamp: number | null = null;
              for (const summary of summaries) {
                const startedAtFailureReason = getWahooActivityStartedAtFailureReason(
                  summary.started_at,
                );
                if (startedAtFailureReason) {
                  failed += 1;
                  lastFailureCode ??= startedAtFailureReason;
                  const diagnostic = skippedImportDiagnostic(summary.id, "activity_import_failed");
                  if (diagnostic) skippedDiagnostics.push(diagnostic);
                  continue;
                }
                const startedAtTimestamp = Date.parse(summary.started_at as string);
                earliestTimestamp =
                  earliestTimestamp === null
                    ? startedAtTimestamp
                    : Math.min(earliestTimestamp, startedAtTimestamp);
                latestTimestamp =
                  latestTimestamp === null
                    ? startedAtTimestamp
                    : Math.max(latestTimestamp, startedAtTimestamp);
                try {
                  const importSummary = summary.file?.url
                    ? summary
                    : await (async () => {
                        if (!client.getWorkoutSummary) {
                          throw new WahooIntegrationError({
                            kind: "activity_unsupported",
                            scope: "activity",
                          });
                        }
                        const workoutId = summary.workout_id ?? summary.workout?.id;
                        if (!workoutId) {
                          throw new WahooIntegrationError({
                            kind: "activity_missing",
                            scope: "activity",
                          });
                        }
                        await assertActive();
                        const detail = await client.getWorkoutSummary(workoutId.toString(), signal);
                        await assertActive();
                        const mergedWorkoutId = summary.workout_id ?? detail.workout_id;
                        const workout = summary.workout ?? detail.workout;
                        return {
                          ...summary,
                          ...detail,
                          ...(mergedWorkoutId === undefined ? {} : { workout_id: mergedWorkoutId }),
                          ...(workout === undefined ? {} : { workout }),
                          ...(summary.started_at === undefined
                            ? {}
                            : { started_at: summary.started_at }),
                        };
                      })();
                  await assertActive();
                  const result = await this.deps.importer.importWorkoutSummary(
                    providerUserId,
                    importSummary,
                    {
                      integrationGeneration: generation,
                      integrationId: job.integrationId,
                      importRunId: run.id,
                      deferAthleteStateRefresh: true,
                      deferPerformanceCalibration: true,
                      signal,
                    },
                  );
                  await assertActive();
                  if (!result.success) {
                    if (result.failureScope !== "activity") {
                      throw new WahooIntegrationError({
                        kind: "import_unavailable",
                        scope: "job",
                      });
                    }
                    failed += 1;
                    lastFailureCode ??= boundedItemFailureCode(result.errorCode);
                    const diagnostic = skippedImportDiagnostic(
                      importSummary.id,
                      "activity_import_failed",
                    );
                    if (diagnostic) skippedDiagnostics.push(diagnostic);
                    logger.warn("Wahoo activity history summary import failed", {
                      jobFamily: "activity_history",
                      provider: "wahoo",
                    });
                  } else if (result.skipped) {
                    skipped += 1;
                    const diagnostic = skippedImportDiagnostic(importSummary.id, result.reason);
                    if (diagnostic) skippedDiagnostics.push(diagnostic);
                  } else imported += 1;
                } catch (error) {
                  // Only a closed activity-scoped classification can be reduced to one item.
                  // Provider, account, network, timeout, generation, and lease failures escape.
                  if (!isWahooActivityItemError(error)) throw error;
                  await assertActive();
                  failed += 1;
                  lastFailureCode ??= "activity_import_failed";
                  const diagnostic = skippedImportDiagnostic(summary.id, "activity_import_failed");
                  if (diagnostic) skippedDiagnostics.push(diagnostic);
                  logger.warn("Wahoo activity history summary import failed", {
                    jobFamily: "activity_history",
                    provider: "wahoo",
                  });
                }
              }
              const onboardingCapReached =
                activityHistoryPayload.trigger === "onboarding" &&
                run.discovered_count + summaries.length >= ONBOARDING_SUMMARY_LIMIT;
              terminal =
                onboardingCapReached ||
                (pageResult.total !== undefined &&
                  pageResult.total !== null &&
                  page * DEFAULT_PAGE_SIZE >= pageResult.total) ||
                pageResult.sourceCount < DEFAULT_PAGE_SIZE ||
                pageResult.reachedStartBoundary === true;
              const nextPage = terminal ? null : page + 1;
              run = await this.deps.importRuns.recordPageCommitted({
                id: run.id,
                discovered: summaries.length,
                imported,
                skipped,
                skippedDiagnostics,
                failed,
                ...(lastFailureCode === undefined ? {} : { lastErrorCode: lastFailureCode }),
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
            const completionNow = new Date();
            const completedRun = await this.deps.importRuns.complete(
              run.id,
              completionNow,
              (tx, lockedRun) =>
                finalizeThresholdsAfterHistoryImport(tx, {
                  profileId: lockedRun.profile_id,
                  asOf: lockedRun.window_end_at ?? completionNow,
                  now: completionNow,
                }).then(() => undefined),
            );
            if (!completedRun) throw new Error("activity_import_run_completion_lost");
            run = completedRun;
            importRunCompleted = true;
            const finalized = await completeHistoryJob(
              run,
              Math.max(page, Math.ceil(run.discovered_count / DEFAULT_PAGE_SIZE), 1),
            );
            if (finalized === false) return "failed";
            await reconcileCompletedOnboarding();
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
            if (signal.aborted) return "failed";
            if (error instanceof StaleIntegrationGenerationError) {
              await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
              return "completed";
            }
            const authorizationResetRequired =
              error instanceof WahooAuthorizationResetRequiredError;
            const shouldDeadLetter = authorizationResetRequired || job.attempt >= job.maxAttempts;
            if (shouldDeadLetter && activeImportRunId && !importRunCompleted) {
              await this.deps.importRuns.fail(activeImportRunId, "activity_history_failed");
            }
            const lastError = authorizationResetRequired
              ? WAHOO_AUTHORIZATION_RESET_REQUIRED_MESSAGE
              : "activity_history_failed";
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
              ...(nextRunAt === undefined ? {} : { nextRunAt }),
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

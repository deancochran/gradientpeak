import type { ProviderSyncRepository, WahooIntegrationRecord } from "../../repositories";
import type { WahooActivityImporter } from "../integrations/wahoo/activity-importer";
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
  createProviderSyncWorkerId,
  executeProviderSyncJobs,
  type ProviderSyncConcurrencyLimiter,
} from "./job-execution";

const WAHOO_ACTIVITY_HISTORY_JOB = "wahoo.activity_history_reconcile";
const WAHOO_ACTIVITY_HISTORY_RESOURCE = "historical_activities";
const DEFAULT_HISTORY_WINDOW_MONTHS = 12;
const DEFAULT_PAGE_SIZE = 30;
const MAX_HISTORY_PAGES = 24;
const MAX_HISTORY_WORKOUTS = 720;

class StaleIntegrationGenerationError extends Error {
  constructor() {
    super("integration_generation_inactive");
  }
}

type WahooActivityHistoryPayload = {
  trigger: "connect" | "manual" | "scheduled";
  windowMonths?: number;
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

function subtractMonths(isoString: string, months: number): string {
  const date = new Date(isoString);
  const dayOfMonth = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
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
      (!("windowMonths" in value) ||
        value.windowMonths === undefined ||
        (typeof value.windowMonths === "number" &&
          Number.isInteger(value.windowMonths) &&
          value.windowMonths > 0 &&
          value.windowMonths <= 24)),
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
      executionLimiter?: ProviderSyncConcurrencyLimiter;
      providerSyncRepository: ProviderSyncRepository;
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
    const concurrency = Math.max(1, Math.floor(input.concurrency ?? 2));
    const requested = Math.min(Math.max(1, Math.floor(input.limit ?? 5)), concurrency);
    const capacity = this.deps.executionLimiter?.reserve(requested) ?? requested;
    if (capacity === 0) return { completed: 0, failed: 0, processed: 0 };
    const now = new Date().toISOString();
    const leaseMs = input.leaseMs ?? 10 * 60_000;
    const workerId = createProviderSyncWorkerId(input.workerId ?? "wahoo-activity-history-worker");

    try {
      const jobs = await this.deps.providerSyncRepository.claimDueJobs({
        jobTypes: [WAHOO_ACTIVITY_HISTORY_JOB],
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
            jobTypes: [WAHOO_ACTIVITY_HISTORY_JOB],
            now: new Date().toISOString(),
            provider: "wahoo",
          }) ?? Promise.resolve({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
        jobFamily: "activity_history",
        jobs,
        leaseRenewIntervalMs: Math.max(1_000, Math.floor(leaseMs / 3)),
        provider: "wahoo",
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
            const windowMonths = job.payload.windowMonths ?? DEFAULT_HISTORY_WINDOW_MONTHS;
            const historyStart = subtractMonths(now, windowMonths);
            const historyEnd = now;
            const client = (this.deps.wahooClientFactory ?? createDefaultWahooClient)(
              resolvedIntegration,
            );
            const history = await this.listAllSummaries(
              client,
              {
                endDate: historyEnd,
                startDate: historyStart,
              },
              assertActive,
            );

            const importErrors: string[] = [];
            for (const summary of history.summaries) {
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
                      started_at: detail.started_at ?? summary.started_at,
                    };
                  })();
              await assertActive();
              const result = await this.deps.importer.importWorkoutSummary(
                providerUserId,
                importSummary,
                {
                  integrationGeneration: generation,
                  integrationId: job.integrationId,
                  signal,
                },
              );
              await assertActive();
              if (!result.success) {
                importErrors.push(result.error ?? "Failed to import Wahoo summary");
                logger.warn("Wahoo activity history summary import failed", {
                  jobFamily: "activity_history",
                  provider: "wahoo",
                });
              }
            }
            if (importErrors.length > 0) {
              throw new Error("activity_history_import_failed");
            }

            await assertActive();
            const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState({
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
                  itemCount: history.itemCount,
                  pageCount: history.pageCount,
                  version: 2,
                },
              },
              provider: "wahoo",
              resource: WAHOO_ACTIVITY_HISTORY_RESOURCE,
              workerId,
            });
            if (finalized === false) return "failed";
            return "completed";
          } catch (error) {
            if (signal.aborted) return "failed";
            if (error instanceof StaleIntegrationGenerationError) {
              await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
              return "completed";
            }
            const authorizationResetRequired =
              error instanceof WahooAuthorizationResetRequiredError;
            const lastError = authorizationResetRequired
              ? WAHOO_AUTHORIZATION_RESET_REQUIRED_MESSAGE
              : error instanceof Error && error.message === "activity_history_budget_exceeded"
                ? "activity_history_budget_exceeded"
                : "activity_history_failed";
            const shouldDeadLetter = authorizationResetRequired || job.attempt >= job.maxAttempts;
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

  private async listAllSummaries(
    client: WahooWorkoutSummaryClient,
    input: { endDate: string; startDate: string },
    assertActive: () => Promise<void>,
  ): Promise<{ summaries: WahooWorkoutSummary[]; itemCount: number; pageCount: number }> {
    const summaries: WahooWorkoutSummary[] = [];
    let itemCount = 0;

    for (let page = 1; page <= MAX_HISTORY_PAGES; page += 1) {
      await assertActive();
      const pageResult = await client.listWorkoutSummaries({
        ...input,
        page,
        perPage: DEFAULT_PAGE_SIZE,
      });
      await assertActive();
      if (pageResult.page !== undefined && pageResult.page !== page) {
        throw new Error("activity_history_budget_exceeded");
      }
      itemCount += pageResult.sourceCount;
      if (itemCount > MAX_HISTORY_WORKOUTS) throw new Error("activity_history_budget_exceeded");
      summaries.push(...pageResult.summaries);

      const terminal =
        (pageResult.total !== undefined &&
          pageResult.total !== null &&
          page * DEFAULT_PAGE_SIZE >= pageResult.total) ||
        pageResult.sourceCount < DEFAULT_PAGE_SIZE ||
        pageResult.reachedStartBoundary === true;
      if (terminal) return { summaries, itemCount, pageCount: page };
    }
    throw new Error("activity_history_budget_exceeded");
  }
}

export function getWahooActivityHistoryJobType() {
  return WAHOO_ACTIVITY_HISTORY_JOB;
}

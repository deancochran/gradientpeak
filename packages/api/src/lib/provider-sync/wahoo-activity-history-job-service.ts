import type { ProviderSyncRepository, WahooIntegrationRecord } from "../../repositories";
import type { WahooActivityImporter } from "../integrations/wahoo/activity-importer";
import {
  refreshWahooAccessToken,
  WahooClient,
  type WahooTokenRefreshResult,
  type WahooWorkoutSummary,
} from "../integrations/wahoo/client";
import { resolveWahooCredentials } from "../integrations/wahoo/credentials";
import { logger } from "../logger";
import {
  createProviderSyncWorkerId,
  executeProviderSyncJobs,
  type ProviderSyncConcurrencyLimiter,
} from "./job-execution";

const WAHOO_ACTIVITY_HISTORY_JOB = "wahoo.activity_history_reconcile";
const WAHOO_ACTIVITY_HISTORY_RESOURCE = "historical_activities";
const DEFAULT_HISTORY_WINDOW_MONTHS = 12;
const DEFAULT_PAGE_SIZE = 50;

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
  }): Promise<{ sourceCount: number; summaries: WahooWorkoutSummary[] }>;
  getWorkoutSummary?(workoutSummaryId: string): Promise<WahooWorkoutSummary>;
};

function addMinutes(isoString: string, minutes: number): string {
  const date = new Date(isoString);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

function subtractMonths(isoString: string, months: number): string {
  const date = new Date(isoString);
  date.setUTCMonth(date.getUTCMonth() - months);
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
        (typeof value.windowMonths === "number" && value.windowMonths > 0)),
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
      importer: WahooActivityImporter;
      executionLimiter?: ProviderSyncConcurrencyLimiter;
      providerSyncRepository: ProviderSyncRepository;
      refreshAccessToken?: (refreshToken: string) => Promise<WahooTokenRefreshResult>;
      wahooClientFactory?: (integration: WahooIntegrationRecord) => WahooWorkoutSummaryClient;
      wahooRepository: {
        findWahooIntegrationByProfileId(profileId: string): Promise<WahooIntegrationRecord | null>;
        updateWahooIntegrationTokens(input: {
          accessToken: string;
          expiresAt: string | null;
          id: string;
          refreshToken: string | null;
        }): Promise<void>;
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
        processJob: async (job) => {
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

            if (!/^\d+$/.test(integration.externalId)) {
              throw new Error("Wahoo integration external ID is not numeric");
            }
            const resolvedIntegration = await resolveWahooCredentials({
              integration,
              persistTokens: (tokens) =>
                this.deps.wahooRepository.updateWahooIntegrationTokens(tokens),
              refreshAccessToken: this.deps.refreshAccessToken ?? refreshWahooAccessToken,
            });
            const providerUserId = Number.parseInt(resolvedIntegration.externalId, 10);
            const windowMonths = job.payload.windowMonths ?? DEFAULT_HISTORY_WINDOW_MONTHS;
            const historyStart = subtractMonths(now, windowMonths);
            const historyEnd = now;
            const client = (this.deps.wahooClientFactory ?? createDefaultWahooClient)(
              resolvedIntegration,
            );
            const summaries = await this.listAllSummaries(client, {
              endDate: historyEnd,
              startDate: historyStart,
            });

            const importErrors: string[] = [];
            for (const summary of summaries) {
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
                        `Wahoo summary ${summary.id} omitted its artifact URL and workout identity`,
                      );
                    }
                    const detail = await client.getWorkoutSummary(workoutId.toString());
                    return {
                      ...summary,
                      ...detail,
                      workout_id: summary.workout_id ?? detail.workout_id,
                      workout: summary.workout ?? detail.workout,
                      started_at: detail.started_at ?? summary.started_at,
                    };
                  })();
              const result = await this.deps.importer.importWorkoutSummary(
                providerUserId,
                importSummary,
              );
              if (!result.success) {
                importErrors.push(result.error ?? "Failed to import Wahoo summary");
                logger.warn("Wahoo activity history summary import failed", {
                  jobFamily: "activity_history",
                  provider: "wahoo",
                });
              }
            }
            if (importErrors.length > 0) {
              throw new Error(
                `Wahoo activity history partially failed: ${importErrors.slice(0, 3).join("; ")}`,
              );
            }

            const finalized = await this.deps.providerSyncRepository.completeJobWithSyncState({
              highWatermark: historyEnd,
              id: job.id,
              integrationId: job.integrationId,
              metadata: {
                activityHistoryCoverage: {
                  end: historyEnd,
                  start: historyStart,
                },
              },
              provider: "wahoo",
              resource: WAHOO_ACTIVITY_HISTORY_RESOURCE,
              workerId,
            });
            if (finalized === false) return "failed";
            return "completed";
          } catch (error) {
            const lastError =
              error instanceof Error ? error.message : "Unknown Wahoo activity history job failure";
            const shouldDeadLetter = job.attempt >= job.maxAttempts;
            const nextRunAt = shouldDeadLetter
              ? undefined
              : addMinutes(now, Math.min(job.attempt * 5, 60));
            const finalized = await this.deps.providerSyncRepository.markJobFailed({
              id: job.id,
              lastError,
              nextRunAt,
              status: shouldDeadLetter ? "dead_lettered" : "failed",
              workerId,
            });
            if (finalized === false) return "failed";
            await this.deps.providerSyncRepository.updateSyncStateAfterFailure({
              integrationId: job.integrationId,
              lastError,
              nextSyncAt: nextRunAt,
              provider: "wahoo",
              resource: WAHOO_ACTIVITY_HISTORY_RESOURCE,
            });
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
  ): Promise<WahooWorkoutSummary[]> {
    const summaries: WahooWorkoutSummary[] = [];

    for (let page = 1; ; page += 1) {
      const pageResult = await client.listWorkoutSummaries({
        ...input,
        page,
        perPage: DEFAULT_PAGE_SIZE,
      });
      summaries.push(...pageResult.summaries);

      if (pageResult.sourceCount < DEFAULT_PAGE_SIZE) {
        return summaries;
      }
    }
  }
}

export function getWahooActivityHistoryJobType() {
  return WAHOO_ACTIVITY_HISTORY_JOB;
}

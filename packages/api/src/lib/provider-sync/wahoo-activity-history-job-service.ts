import type { ProviderSyncRepository, WahooIntegrationRecord } from "../../repositories";
import type { WahooActivityImporter } from "../integrations/wahoo/activity-importer";
import { WahooClient, type WahooWorkoutSummary } from "../integrations/wahoo/client";

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
  }): Promise<WahooWorkoutSummary[]>;
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
      providerSyncRepository: ProviderSyncRepository;
      wahooClientFactory?: (integration: WahooIntegrationRecord) => WahooWorkoutSummaryClient;
      wahooRepository: {
        findWahooIntegrationByProfileId(profileId: string): Promise<WahooIntegrationRecord | null>;
      };
    },
  ) {}

  async processDueJobs(input: { limit?: number; workerId?: string }): Promise<{
    completed: number;
    failed: number;
    processed: number;
  }> {
    const now = new Date().toISOString();
    const workerId = input.workerId ?? "wahoo-activity-history-worker";
    const jobs = await this.deps.providerSyncRepository.claimDueJobs({
      jobTypes: [WAHOO_ACTIVITY_HISTORY_JOB],
      limit: input.limit ?? 5,
      lockExpiresAt: addMinutes(now, 10),
      now,
      provider: "wahoo",
      workerId,
    });

    let completed = 0;
    let failed = 0;

    for (const job of jobs) {
      if (!isActivityHistoryPayload(job.payload)) {
        await this.deps.providerSyncRepository.markJobFailed({
          id: job.id,
          lastError: "Invalid Wahoo activity history job payload",
          status: "dead_lettered",
          workerId,
        });
        failed += 1;
        continue;
      }

      try {
        const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(
          job.profileId,
        );
        if (!integration || integration.id !== job.integrationId) {
          await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
          completed += 1;
          continue;
        }

        if (!/^\d+$/.test(integration.externalId)) {
          throw new Error("Wahoo integration external ID is not numeric");
        }
        const providerUserId = Number.parseInt(integration.externalId, 10);

        const windowMonths = job.payload.windowMonths ?? DEFAULT_HISTORY_WINDOW_MONTHS;
        const client = (this.deps.wahooClientFactory ?? createDefaultWahooClient)(integration);
        const summaries = await this.listAllSummaries(client, {
          endDate: now,
          startDate: subtractMonths(now, windowMonths),
        });

        const importErrors: string[] = [];
        for (const summary of summaries) {
          const result = await this.deps.importer.importWorkoutSummary(providerUserId, summary);
          if (!result.success) {
            importErrors.push(result.error ?? `Failed to import Wahoo summary ${summary.id}`);
            console.warn("[Wahoo Activity History] Failed to import summary", {
              error: result.error,
              summaryId: summary.id,
            });
          }
        }

        if (importErrors.length > 0) {
          throw new Error(
            `Wahoo activity history partially failed: ${importErrors.slice(0, 3).join("; ")}`,
          );
        }

        await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
        await this.deps.providerSyncRepository.updateSyncStateAfterRun({
          integrationId: job.integrationId,
          provider: "wahoo",
          resource: WAHOO_ACTIVITY_HISTORY_RESOURCE,
          succeeded: true,
        });
        completed += 1;
      } catch (error) {
        const lastError =
          error instanceof Error ? error.message : "Unknown Wahoo activity history job failure";
        const shouldDeadLetter = job.attempt >= job.maxAttempts;
        await this.deps.providerSyncRepository.markJobFailed({
          id: job.id,
          lastError,
          nextRunAt: shouldDeadLetter ? undefined : addMinutes(now, Math.min(job.attempt * 5, 60)),
          status: shouldDeadLetter ? "dead_lettered" : "failed",
          workerId,
        });
        await this.deps.providerSyncRepository.updateSyncStateAfterFailure({
          integrationId: job.integrationId,
          lastError,
          nextSyncAt: shouldDeadLetter ? undefined : addMinutes(now, Math.min(job.attempt * 5, 60)),
          provider: "wahoo",
          resource: WAHOO_ACTIVITY_HISTORY_RESOURCE,
        });
        failed += 1;
      }
    }

    return {
      completed,
      failed,
      processed: jobs.length,
    };
  }

  private async listAllSummaries(
    client: WahooWorkoutSummaryClient,
    input: { endDate: string; startDate: string },
  ): Promise<WahooWorkoutSummary[]> {
    const summaries: WahooWorkoutSummary[] = [];

    for (let page = 1; ; page += 1) {
      const pageSummaries = await client.listWorkoutSummaries({
        ...input,
        page,
        perPage: DEFAULT_PAGE_SIZE,
      });
      summaries.push(...pageSummaries);

      if (pageSummaries.length < DEFAULT_PAGE_SIZE) {
        return summaries;
      }
    }
  }
}

export function getWahooActivityHistoryJobType() {
  return WAHOO_ACTIVITY_HISTORY_JOB;
}

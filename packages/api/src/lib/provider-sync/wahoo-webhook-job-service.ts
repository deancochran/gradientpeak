import crypto from "node:crypto";
import type { ProviderSyncRepository, WahooRepository } from "../../repositories";
import type { WahooActivityImporter } from "../integrations/wahoo/activity-importer";
import {
  createProviderSyncWorkerId,
  executeProviderSyncJobs,
  type ProviderSyncConcurrencyLimiter,
} from "./job-execution";

const WAHOO_WEBHOOK_RECEIPT_JOB = "wahoo.process_webhook_receipt";

type WahooWebhookPayload = {
  event_type: string;
  user: { id: number };
  workout_summary?: Record<string, unknown>;
};

type WahooWebhookReceiptJobPayload = {
  receiptId: string;
};

type WahooWebhookReceiptQueueResult = {
  jobId: string | null;
  queued: boolean;
  receiptId: string;
};

function addMinutes(isoString: string, minutes: number): string {
  const date = new Date(isoString);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

function isWebhookJobPayload(value: unknown): value is WahooWebhookReceiptJobPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "receiptId" in value &&
      typeof value.receiptId === "string",
  );
}

function isWahooWebhookPayload(value: unknown): value is WahooWebhookPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "event_type" in value &&
      typeof value.event_type === "string" &&
      "user" in value &&
      value.user &&
      typeof value.user === "object" &&
      "id" in value.user &&
      typeof value.user.id === "number",
  );
}

export class WahooWebhookJobService {
  constructor(
    private readonly deps: {
      importer: WahooActivityImporter;
      executionLimiter?: ProviderSyncConcurrencyLimiter;
      providerSyncRepository: ProviderSyncRepository;
      wahooRepository: WahooRepository;
    },
  ) {}

  private async enqueueReceiptJob(input: {
    integrationId: string;
    profileId: string;
    receiptId: string;
  }): Promise<{ jobId: string; queued: boolean }> {
    const job = await this.deps.providerSyncRepository.enqueueJob({
      dedupeKey: `wahoo:webhook:${input.receiptId}`,
      integrationId: input.integrationId,
      jobType: WAHOO_WEBHOOK_RECEIPT_JOB,
      maxAttempts: 5,
      payload: { receiptId: input.receiptId },
      profileId: input.profileId,
      provider: "wahoo",
      runAt: new Date().toISOString(),
    });

    await this.deps.providerSyncRepository.setWebhookReceiptJob({
      id: input.receiptId,
      jobId: job.id,
    });

    return {
      jobId: job.id,
      queued: job.status === "queued",
    };
  }

  async storeAndEnqueueReceipt(
    payload: WahooWebhookPayload,
  ): Promise<WahooWebhookReceiptQueueResult> {
    const providerAccountId = payload.user.id.toString();
    const providerEventId =
      payload.event_type === "workout_summary" && payload.workout_summary?.id != null
        ? String(payload.workout_summary.id)
        : undefined;
    const integration =
      await this.deps.wahooRepository.findWahooIntegrationByExternalId(providerAccountId);
    const payloadHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

    const receipt = await this.deps.providerSyncRepository.storeWebhookReceipt({
      eventType: payload.event_type,
      integrationId: integration?.integrationId,
      objectId: providerEventId,
      objectType: payload.event_type,
      payload,
      payloadHash,
      provider: "wahoo",
      providerAccountId,
      providerEventId,
    });

    if (!integration || !receipt.inserted) {
      return {
        jobId: null,
        queued: false,
        receiptId: receipt.id,
      };
    }

    let queuedJob: { jobId: string; queued: boolean };
    try {
      queuedJob = await this.enqueueReceiptJob({
        integrationId: integration.integrationId,
        profileId: integration.profileId,
        receiptId: receipt.id,
      });
    } catch (error) {
      console.warn("Wahoo webhook receipt persisted for pending-job recovery", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
      return {
        jobId: null,
        queued: false,
        receiptId: receipt.id,
      };
    }

    return {
      jobId: queuedJob.jobId,
      queued: queuedJob.queued,
      receiptId: receipt.id,
    };
  }

  async recoverPendingReceipts(input: { limit?: number } = {}): Promise<{
    recovered: number;
    skipped: number;
  }> {
    const receipts = await this.deps.providerSyncRepository.listWebhookReceipts({
      limit: input.limit ?? 25,
      provider: "wahoo",
      statuses: ["pending"],
    });
    let recovered = 0;
    let skipped = 0;

    for (const receipt of receipts) {
      if (receipt.jobId) {
        skipped += 1;
        continue;
      }

      if (!receipt.providerAccountId) {
        await this.deps.providerSyncRepository.markWebhookReceiptProcessed({
          id: receipt.id,
          lastError: "Pending Wahoo webhook receipt has no provider account id",
          status: "failed",
        });
        skipped += 1;
        continue;
      }

      const integration = await this.deps.wahooRepository.findWahooIntegrationByExternalId(
        receipt.providerAccountId,
      );
      if (!integration) {
        await this.deps.providerSyncRepository.markWebhookReceiptProcessed({
          id: receipt.id,
          lastError: "No Wahoo integration found for pending webhook receipt",
          status: "failed",
        });
        skipped += 1;
        continue;
      }

      await this.enqueueReceiptJob({
        integrationId: integration.integrationId,
        profileId: integration.profileId,
        receiptId: receipt.id,
      });
      recovered += 1;
    }

    return { recovered, skipped };
  }

  async processDueJobs(input: {
    concurrency?: number;
    leaseMs?: number;
    limit?: number;
    workerId?: string;
  }): Promise<{ completed: number; failed: number; processed: number }> {
    await this.recoverPendingReceipts({ limit: input.limit ?? 10 });

    const concurrency = Math.max(1, Math.floor(input.concurrency ?? 4));
    const requested = Math.min(Math.max(1, Math.floor(input.limit ?? 10)), concurrency);
    const capacity = this.deps.executionLimiter?.reserve(requested) ?? requested;
    if (capacity === 0) return { completed: 0, failed: 0, processed: 0 };
    const now = new Date().toISOString();
    const leaseMs = input.leaseMs ?? 5 * 60_000;
    const workerId = createProviderSyncWorkerId(input.workerId ?? "wahoo-webhook-worker");

    try {
      const jobs = await this.deps.providerSyncRepository.claimDueJobs({
        jobTypes: [WAHOO_WEBHOOK_RECEIPT_JOB],
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
            jobTypes: [WAHOO_WEBHOOK_RECEIPT_JOB],
            now: new Date().toISOString(),
            provider: "wahoo",
          }) ?? Promise.resolve({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
        jobFamily: "webhooks",
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
          if (!isWebhookJobPayload(job.payload)) {
            const finalized = await this.deps.providerSyncRepository.markJobFailed({
              id: job.id,
              lastError: "Invalid Wahoo webhook receipt job payload",
              status: "dead_lettered",
              workerId,
            });
            return finalized === false ? "failed" : "dead_lettered";
          }

          const receipt = await this.deps.providerSyncRepository.getWebhookReceipt(
            job.payload.receiptId,
          );
          if (!receipt) {
            const finalized = await this.deps.providerSyncRepository.markJobFailed({
              id: job.id,
              lastError: "Webhook receipt not found",
              status: "dead_lettered",
              workerId,
            });
            return finalized === false ? "failed" : "dead_lettered";
          }

          try {
            if (!isWahooWebhookPayload(receipt.payload)) {
              throw new Error("Invalid Wahoo webhook payload");
            }

            if (
              receipt.payload.event_type !== "workout_summary" ||
              !receipt.payload.workout_summary
            ) {
              signal.throwIfAborted();
              const finalized = await this.deps.providerSyncRepository.finalizeWebhookReceiptJob({
                jobId: job.id,
                jobStatus: "completed",
                receiptId: receipt.id,
                receiptStatus: "processed",
                workerId,
              });
              return finalized === false ? "failed" : "completed";
            }

            signal.throwIfAborted();
            const result = await this.deps.importer.importWorkoutSummary(
              receipt.payload.user.id,
              receipt.payload.workout_summary as never,
              { signal },
            );
            if (!result.success) {
              throw new Error(result.error ?? "Failed to import Wahoo webhook workout summary");
            }

            signal.throwIfAborted();
            const finalized = await this.deps.providerSyncRepository.finalizeWebhookReceiptJob({
              jobId: job.id,
              jobStatus: "completed",
              receiptId: receipt.id,
              receiptStatus: "processed",
              workerId,
            });
            return finalized === false ? "failed" : "completed";
          } catch (error) {
            const lastError =
              error instanceof Error ? error.message : "Unknown Wahoo webhook job failure";
            const shouldDeadLetter = job.attempt >= job.maxAttempts;
            const finalized = await this.deps.providerSyncRepository.finalizeWebhookReceiptJob({
              jobId: job.id,
              jobStatus: shouldDeadLetter ? "dead_lettered" : "failed",
              lastError,
              nextRunAt: shouldDeadLetter
                ? undefined
                : addMinutes(now, Math.min(job.attempt * 5, 60)),
              receiptId: receipt.id,
              receiptStatus: "failed",
              workerId,
            });
            return finalized === false || !shouldDeadLetter ? "failed" : "dead_lettered";
          }
        },
      });
    } finally {
      this.deps.executionLimiter?.release(capacity);
    }
  }
}

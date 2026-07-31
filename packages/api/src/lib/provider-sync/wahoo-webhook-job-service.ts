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
    integrationGeneration: number;
    integrationId: string;
    profileId: string;
    receiptId: string;
  }): Promise<{ jobId: string; queued: boolean }> {
    const job = await this.deps.providerSyncRepository.enqueueJob({
      dedupeKey: `wahoo:webhook:${input.receiptId}`,
      integrationId: input.integrationId,
      integrationGeneration: input.integrationGeneration,
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
      integrationGeneration: integration?.integrationGeneration,
      objectId: providerEventId,
      objectType: payload.event_type,
      payload,
      payloadHash,
      provider: "wahoo",
      providerAccountId,
      providerEventId,
    });

    if (!integration || !receipt.inserted || !receipt.captured) {
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
        integrationGeneration: integration.integrationGeneration,
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

      if (!receipt.integrationId || !receipt.integrationGeneration) {
        await this.deps.providerSyncRepository.markWebhookReceiptProcessed({
          id: receipt.id,
          lastError: "integration_inactive_at_receipt",
          status: "processed",
        });
        skipped += 1;
        continue;
      }

      const integration = await this.deps.wahooRepository.findWahooIntegrationByIdAndGeneration({
        integrationGeneration: receipt.integrationGeneration,
        integrationId: receipt.integrationId,
      });
      if (!integration) {
        await this.deps.providerSyncRepository.markWebhookReceiptProcessed({
          id: receipt.id,
          lastError: "integration_generation_inactive",
          status: "processed",
        });
        skipped += 1;
        continue;
      }

      await this.enqueueReceiptJob({
        integrationId: receipt.integrationId,
        integrationGeneration: receipt.integrationGeneration,
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
          const isActive = () =>
            this.deps.providerSyncRepository.isIntegrationGenerationActive?.({
              generation: job.integrationGeneration ?? 1,
              integrationId: job.integrationId,
              profileId: job.profileId,
            }) ?? Promise.resolve(true);
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

          const finalizeInactive = async () => {
            await this.deps.providerSyncRepository.finalizeWebhookReceiptJob({
              jobId: job.id,
              jobStatus: "completed",
              lastError: "integration_generation_inactive",
              receiptId: receipt.id,
              receiptStatus: "processed",
              workerId,
            });
            return "completed" as const;
          };
          if (!(await isActive())) return finalizeInactive();

          try {
            // Receipt loading is outside the import transaction. A disconnect can
            // linearize while it is in flight, so re-check before any importer work.
            if (!(await isActive())) return finalizeInactive();
            if (!isWahooWebhookPayload(receipt.payload)) {
              throw new Error("invalid_webhook_payload");
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
            if (!(await isActive())) return finalizeInactive();
            const result = await this.deps.importer.importWorkoutSummary(
              receipt.payload.user.id,
              receipt.payload.workout_summary as never,
              {
                integrationGeneration: job.integrationGeneration ?? 1,
                integrationId: job.integrationId,
                signal,
              },
            );
            if (!result.success) {
              if (result.failureReason === "unsupported_persisted_version") {
                const finalized = await this.deps.providerSyncRepository.finalizeWebhookReceiptJob({
                  jobId: job.id,
                  jobStatus: "dead_lettered",
                  lastError: "unsupported_persisted_version",
                  receiptId: receipt.id,
                  receiptStatus: "failed",
                  workerId,
                });
                return finalized === false ? "failed" : "dead_lettered";
              }
              throw new Error("webhook_import_failed");
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
            const message = error instanceof Error ? error.message : "";
            const lastError = new Set([
              "invalid_webhook_payload",
              "webhook_import_failed",
              "integration_generation_inactive",
            ]).has(message)
              ? message
              : "provider_sync_failed";
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

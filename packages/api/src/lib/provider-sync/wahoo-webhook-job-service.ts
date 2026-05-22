import crypto from "node:crypto";
import type { ProviderSyncRepository, WahooRepository } from "../../repositories";
import type { WahooActivityImporter } from "../integrations/wahoo/activity-importer";

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

    const queuedJob = await this.enqueueReceiptJob({
      integrationId: integration.integrationId,
      profileId: integration.profileId,
      receiptId: receipt.id,
    });

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

  async processDueJobs(input: { limit?: number; workerId?: string }): Promise<{
    completed: number;
    failed: number;
    processed: number;
  }> {
    await this.recoverPendingReceipts({ limit: input.limit ?? 10 });

    const now = new Date().toISOString();
    const workerId = input.workerId ?? "wahoo-webhook-worker";
    const jobs = await this.deps.providerSyncRepository.claimDueJobs({
      jobTypes: [WAHOO_WEBHOOK_RECEIPT_JOB],
      limit: input.limit ?? 10,
      lockExpiresAt: addMinutes(now, 5),
      now,
      provider: "wahoo",
      workerId,
    });

    let completed = 0;
    let failed = 0;

    for (const job of jobs) {
      if (!isWebhookJobPayload(job.payload)) {
        await this.deps.providerSyncRepository.markJobFailed({
          id: job.id,
          lastError: "Invalid Wahoo webhook receipt job payload",
          status: "dead_lettered",
          workerId,
        });
        failed += 1;
        continue;
      }

      const receipt = await this.deps.providerSyncRepository.getWebhookReceipt(
        job.payload.receiptId,
      );
      if (!receipt) {
        await this.deps.providerSyncRepository.markJobFailed({
          id: job.id,
          lastError: "Webhook receipt not found",
          status: "dead_lettered",
          workerId,
        });
        failed += 1;
        continue;
      }

      try {
        if (!isWahooWebhookPayload(receipt.payload)) {
          throw new Error("Invalid Wahoo webhook payload");
        }

        if (receipt.payload.event_type !== "workout_summary" || !receipt.payload.workout_summary) {
          await this.deps.providerSyncRepository.markWebhookReceiptProcessed({
            id: receipt.id,
            status: "processed",
          });
          await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
          completed += 1;
          continue;
        }

        const result = await this.deps.importer.importWorkoutSummary(
          receipt.payload.user.id,
          receipt.payload.workout_summary as never,
        );

        if (!result.success) {
          throw new Error(result.error ?? "Failed to import Wahoo webhook workout summary");
        }

        await this.deps.providerSyncRepository.markWebhookReceiptProcessed({
          id: receipt.id,
          status: "processed",
        });
        await this.deps.providerSyncRepository.markJobSucceeded(job.id, workerId);
        completed += 1;
      } catch (error) {
        const lastError =
          error instanceof Error ? error.message : "Unknown Wahoo webhook job failure";
        const shouldDeadLetter = job.attempt >= job.maxAttempts;
        await this.deps.providerSyncRepository.markWebhookReceiptProcessed({
          id: receipt.id,
          lastError,
          status: "failed",
        });
        await this.deps.providerSyncRepository.markJobFailed({
          id: job.id,
          lastError,
          nextRunAt: shouldDeadLetter ? undefined : addMinutes(now, Math.min(job.attempt * 5, 60)),
          status: shouldDeadLetter ? "dead_lettered" : "failed",
          workerId,
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
}

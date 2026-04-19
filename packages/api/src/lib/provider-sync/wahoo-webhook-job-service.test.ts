import { describe, expect, it, vi } from "vitest";
import { WahooWebhookJobService } from "./wahoo-webhook-job-service";

function createDeps() {
  return {
    importer: {
      importWorkoutSummary: vi.fn(),
    },
    providerSyncRepository: {
      claimDueJobs: vi.fn(),
      enqueueJob: vi.fn(),
      getWebhookReceipt: vi.fn(),
      markJobFailed: vi.fn(),
      markJobSucceeded: vi.fn(),
      markWebhookReceiptProcessed: vi.fn(),
      setWebhookReceiptJob: vi.fn(),
      storeWebhookReceipt: vi.fn(),
    },
    wahooRepository: {
      findWahooIntegrationByExternalId: vi.fn(),
    },
  };
}

describe("WahooWebhookJobService", () => {
  it("stores and enqueues a webhook receipt for a known Wahoo integration", async () => {
    const deps = createDeps();
    deps.wahooRepository.findWahooIntegrationByExternalId.mockResolvedValue({
      integrationId: "integration-1",
      profileId: "profile-1",
    });
    deps.providerSyncRepository.storeWebhookReceipt.mockResolvedValue({
      id: "receipt-1",
      inserted: true,
    });
    deps.providerSyncRepository.enqueueJob.mockResolvedValue({ id: "job-1", status: "queued" });

    const service = new WahooWebhookJobService(deps as never);

    await expect(
      service.storeAndEnqueueReceipt({
        event_type: "workout_summary",
        user: { id: 42 },
        workout_summary: { id: 99 },
      }),
    ).resolves.toEqual({
      jobId: "job-1",
      queued: true,
      receiptId: "receipt-1",
    });

    expect(deps.providerSyncRepository.storeWebhookReceipt).toHaveBeenCalled();
    expect(deps.providerSyncRepository.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "integration-1",
        jobType: "wahoo.process_webhook_receipt",
        profileId: "profile-1",
      }),
    );
    expect(deps.providerSyncRepository.setWebhookReceiptJob).toHaveBeenCalledWith({
      id: "receipt-1",
      jobId: "job-1",
    });
  });

  it("processes queued workout summary receipts through the importer", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        dedupeKey: "wahoo:webhook:receipt-1",
        id: "job-1",
        integrationId: "integration-1",
        internalResourceId: null,
        jobType: "wahoo.process_webhook_receipt",
        maxAttempts: 5,
        payload: { receiptId: "receipt-1" },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: null,
        runAt: "2026-04-01T12:00:00.000Z",
        status: "running",
      },
    ]);
    deps.providerSyncRepository.getWebhookReceipt.mockResolvedValue({
      eventType: "workout_summary",
      id: "receipt-1",
      integrationId: "integration-1",
      payload: {
        event_type: "workout_summary",
        user: { id: 42 },
        workout_summary: { id: 99, duration_total_accum: 1200 },
      },
      provider: "wahoo",
      providerAccountId: "42",
      providerEventId: "99",
    });
    deps.importer.importWorkoutSummary.mockResolvedValue({
      success: true,
      activityId: "activity-1",
    });

    const service = new WahooWebhookJobService(deps as never);

    await expect(service.processDueJobs({ workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });

    expect(deps.importer.importWorkoutSummary).toHaveBeenCalledWith(42, {
      id: 99,
      duration_total_accum: 1200,
    });
    expect(deps.providerSyncRepository.markWebhookReceiptProcessed).toHaveBeenCalledWith({
      id: "receipt-1",
      status: "processed",
    });
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith("job-1");
  });
});

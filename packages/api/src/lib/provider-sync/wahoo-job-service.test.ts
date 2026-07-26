import { afterEach, describe, expect, it, vi } from "vitest";
import { WahooSyncJobService } from "./wahoo-job-service";
import { WAHOO_STAGING_CLEANUP_JOB } from "./wahoo-staging-cleanup";

function cleanupJob(overrides: Record<string, unknown> = {}) {
  return {
    attempt: 1,
    id: "cleanup-1",
    integrationGeneration: 2,
    integrationId: "integration-1",
    jobType: WAHOO_STAGING_CLEANUP_JOB,
    maxAttempts: 3,
    payload: {
      path: "activities/profile-1/providers/wahoo/staging/integration-1/2/123/11111111-1111-4111-8111-111111111111.fit",
      uploadOutcome: "committed",
    },
    profileId: "profile-1",
    provider: "wahoo",
    runAt: new Date().toISOString(),
    status: "running",
    ...overrides,
  };
}

describe("WahooSyncJobService", () => {
  afterEach(() => vi.useRealTimers());
  it("cleans an owned staging object after disconnect without active credentials", async () => {
    const repository = {
      claimDueJobs: vi.fn().mockResolvedValue([cleanupJob()]),
      getQueueTelemetry: vi
        .fn()
        .mockResolvedValue({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
      isIntegrationGenerationActive: vi.fn().mockResolvedValue(false),
      markJobSucceeded: vi.fn().mockResolvedValue(true),
      renewJobLease: vi.fn().mockResolvedValue(true),
    };
    const removeWahooStagingObject = vi.fn().mockResolvedValue(undefined);
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      removeWahooStagingObject,
      wahooRepository: {} as never,
    });

    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(removeWahooStagingObject).toHaveBeenCalledWith(
      "activities/profile-1/providers/wahoo/staging/integration-1/2/123/11111111-1111-4111-8111-111111111111.fit",
      expect.any(AbortSignal),
    );
    expect(repository.isIntegrationGenerationActive).not.toHaveBeenCalled();
    expect(repository.markJobSucceeded).toHaveBeenCalledWith(
      "cleanup-1",
      expect.stringMatching(/^test:/),
    );
  });

  it("completes a conclusively not-started cleanup after idempotent removal", async () => {
    const repository = {
      claimDueJobs: vi.fn().mockResolvedValue([
        cleanupJob({
          payload: {
            path: "activities/profile-1/providers/wahoo/staging/integration-1/2/123/11111111-1111-4111-8111-111111111111.fit",
            uploadOutcome: "not_started",
          },
        }),
      ]),
      getQueueTelemetry: vi
        .fn()
        .mockResolvedValue({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
      markJobSucceeded: vi.fn().mockResolvedValue(true),
      renewJobLease: vi.fn().mockResolvedValue(true),
    };
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      removeWahooStagingObject: vi.fn().mockResolvedValue(undefined),
      wahooRepository: {} as never,
    });

    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(repository.markJobSucceeded).toHaveBeenCalled();
  });

  it("never completes an uncertain cleanup even when removal reports success", async () => {
    const repository = {
      claimDueJobs: vi.fn().mockResolvedValue([
        cleanupJob({
          payload: {
            path: "activities/profile-1/providers/wahoo/staging/integration-1/2/123/11111111-1111-4111-8111-111111111111.fit",
            uploadOutcome: "uncertain",
          },
        }),
      ]),
      getQueueTelemetry: vi
        .fn()
        .mockResolvedValue({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
      markJobFailed: vi.fn().mockResolvedValue(true),
      markJobSucceeded: vi.fn(),
      renewJobLease: vi.fn().mockResolvedValue(true),
    };
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      removeWahooStagingObject: vi.fn().mockResolvedValue(undefined),
      wahooRepository: {} as never,
    });

    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(repository.markJobSucceeded).not.toHaveBeenCalled();
    expect(repository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "wahoo_staging_cleanup_uncertain",
        status: "failed",
      }),
    );
    expect(repository.markJobFailed.mock.calls[0]?.[0].lastError).not.toContain("activities/");
  });

  it("dead-letters an uncertain cleanup after its bounded attempts", async () => {
    const repository = {
      claimDueJobs: vi.fn().mockResolvedValue([
        cleanupJob({
          attempt: 3,
          payload: {
            path: "activities/profile-1/providers/wahoo/staging/integration-1/2/123/11111111-1111-4111-8111-111111111111.fit",
            uploadOutcome: "uncertain",
          },
        }),
      ]),
      getQueueTelemetry: vi
        .fn()
        .mockResolvedValue({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
      markJobFailed: vi.fn().mockResolvedValue(true),
      markJobSucceeded: vi.fn(),
      renewJobLease: vi.fn().mockResolvedValue(true),
    };
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      removeWahooStagingObject: vi.fn().mockResolvedValue(undefined),
      wahooRepository: {} as never,
    });

    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(repository.markJobSucceeded).not.toHaveBeenCalled();
    expect(repository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "wahoo_staging_cleanup_uncertain",
        status: "dead_lettered",
      }),
    );
  });

  it("dead-letters an invalid cleanup payload without passing its path to storage", async () => {
    const repository = {
      claimDueJobs: vi
        .fn()
        .mockResolvedValue([cleanupJob({ payload: { path: "activities/other/file.fit" } })]),
      getQueueTelemetry: vi
        .fn()
        .mockResolvedValue({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
      markJobFailed: vi.fn().mockResolvedValue(true),
      renewJobLease: vi.fn().mockResolvedValue(true),
    };
    const removeWahooStagingObject = vi.fn();
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      removeWahooStagingObject,
      wahooRepository: {} as never,
    });

    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(removeWahooStagingObject).not.toHaveBeenCalled();
    expect(repository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "invalid_wahoo_staging_cleanup_payload",
        status: "dead_lettered",
      }),
    );
  });

  it("does not claim cleanup jobs in a drain without a storage remover", async () => {
    const repository = {
      claimDueJobs: vi.fn().mockResolvedValue([]),
      getQueueTelemetry: vi
        .fn()
        .mockResolvedValue({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
    };
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      wahooRepository: {} as never,
    });

    await service.processDueJobs({ workerId: "test" });
    expect(repository.claimDueJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTypes: expect.not.arrayContaining([WAHOO_STAGING_CLEANUP_JOB]),
      }),
    );
  });

  it("requeues a failed staging cleanup with bounded backoff and no path in the durable error", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));
    const repository = {
      claimDueJobs: vi.fn().mockResolvedValue([cleanupJob()]),
      getQueueTelemetry: vi
        .fn()
        .mockResolvedValue({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
      markJobFailed: vi.fn().mockResolvedValue(true),
      renewJobLease: vi.fn().mockResolvedValue(true),
    };
    const removeWahooStagingObject = vi
      .fn()
      .mockRejectedValue(new DOMException("request timed out", "AbortError"));
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      removeWahooStagingObject,
      wahooRepository: {} as never,
    });

    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(repository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "wahoo_staging_cleanup_failed",
        nextRunAt: "2026-07-24T12:05:00.000Z",
        status: "failed",
      }),
    );
    expect(repository.markJobFailed.mock.calls[0]?.[0].lastError).not.toContain("activities/");
    expect(removeWahooStagingObject).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(AbortSignal),
    );
  });

  it("dead-letters the final failed staging cleanup attempt without its path", async () => {
    const repository = {
      claimDueJobs: vi.fn().mockResolvedValue([cleanupJob({ attempt: 3 })]),
      getQueueTelemetry: vi
        .fn()
        .mockResolvedValue({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
      markJobFailed: vi.fn().mockResolvedValue(true),
      renewJobLease: vi.fn().mockResolvedValue(true),
    };
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      removeWahooStagingObject: vi.fn().mockRejectedValue(new Error("storage unavailable")),
      wahooRepository: {} as never,
    });

    await expect(service.processDueJobs({ workerId: "test" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(repository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "wahoo_staging_cleanup_failed",
        status: "dead_lettered",
      }),
    );
    expect(repository.markJobFailed.mock.calls[0]?.[0]).not.toHaveProperty("nextRunAt");
    expect(repository.markJobFailed.mock.calls[0]?.[0].lastError).not.toContain("activities/");
  });
});

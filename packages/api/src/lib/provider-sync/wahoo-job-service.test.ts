import { afterEach, describe, expect, it, vi } from "vitest";
import type { WahooProjectionSnapshot } from "../integrations/wahoo/plan-converter";
import type { WahooSyncService } from "../integrations/wahoo/sync-service";
import { WahooSyncJobService } from "./wahoo-job-service";
import { WAHOO_PROFILE_ENRICHMENT_JOB } from "./wahoo-profile-enrichment";
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

function projectionSnapshot(ftp = 250): WahooProjectionSnapshot {
  return {
    plan: {
      header: {
        name: "Tempo Intervals",
        version: "1.0.0",
        workout_type_family: 0,
        workout_type_location: 0,
        ftp,
      },
      intervals: [],
    },
  };
}

function plannedJob(overrides: Record<string, unknown> = {}) {
  return {
    attempt: 1,
    id: "planned-job-1",
    integrationGeneration: 3,
    integrationId: "integration-1",
    internalResourceId: "event-1",
    jobType: "wahoo.publish_event",
    maxAttempts: 3,
    operation: "publish",
    payload: {
      performanceModelAsOf: "2026-07-28T12:00:00.000Z",
      eventId: "event-1",
      operation: "publish",
      projectionHash: "projection-1",
      projectionSnapshot: projectionSnapshot(),
      startsAt: "2026-07-29T12:00:00.000Z",
    },
    profileId: "profile-1",
    provider: "wahoo",
    runAt: new Date().toISOString(),
    status: "running",
    ...overrides,
  };
}

function profileEnrichmentJob(overrides: Record<string, unknown> = {}) {
  return plannedJob({
    id: "profile-enrichment-job-1",
    internalResourceId: null,
    jobType: WAHOO_PROFILE_ENRICHMENT_JOB,
    operation: "fill_absent",
    payload: { trigger: "connect" },
    ...overrides,
  });
}

function plannedRepository(job: ReturnType<typeof plannedJob>, active = true) {
  return {
    claimDueJobs: vi.fn().mockResolvedValue([job]),
    completeJobWithSyncState: vi.fn().mockResolvedValue(true),
    failJobWithSyncState: vi.fn().mockResolvedValue(true),
    getQueueTelemetry: vi
      .fn()
      .mockResolvedValue({ deadLetterDepth: 0, oldestDueAt: null, queueDepth: 0 }),
    isIntegrationGenerationActive: vi.fn().mockResolvedValue(active),
    markJobFailed: vi.fn().mockResolvedValue(true),
    markJobSucceeded: vi.fn().mockResolvedValue(true),
    renewJobLease: vi.fn().mockResolvedValue(true),
    updateRunningJobDesiredState: vi.fn().mockResolvedValue(true),
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

describe("WahooSyncJobService profile enrichment", () => {
  it("fills only absent profile facts under the claimed integration generation", async () => {
    const job = profileEnrichmentJob();
    const repository = plannedRepository(job);
    const applyProfileEnrichmentIfAbsent = vi.fn().mockResolvedValue({
      fieldsFilled: ["dob", "weight_kg"],
      fieldsKept: ["gender"],
    });
    const getUserProfile = vi.fn().mockResolvedValue({
      birth: "1990-06-15",
      gender: 1,
      id: 7,
      weight: 61.5,
    });
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      wahooClientFactory: () => ({ disconnect: vi.fn(), getUserProfile }) as never,
      wahooRepository: {
        applyProfileEnrichmentIfAbsent,
        findWahooIntegrationByProfileId: vi.fn().mockResolvedValue({
          accessToken: "token",
          id: "integration-1",
          integrationGeneration: 3,
          scope: "user_read",
        }),
      } as never,
    });

    await expect(service.processDueJobs({ workerId: "profile-test" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(applyProfileEnrichmentIfAbsent).toHaveBeenCalledWith({
      dob: new Date("1990-06-15T00:00:00.000Z"),
      expectedIntegrationGeneration: 3,
      gender: "female",
      integrationId: "integration-1",
      profileId: "profile-1",
      weightKg: 61.5,
    });
    expect(repository.completeJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedIntegrationGeneration: 3,
        metadata: expect.objectContaining({
          fields_imported: ["dob", "weight_kg"],
          fields_kept: ["gender"],
          status: "succeeded",
        }),
        resource: "profile_enrichment",
      }),
    );
  });

  it("finishes a stale-generation enrichment without calling Wahoo or writing profile data", async () => {
    const job = profileEnrichmentJob();
    const repository = plannedRepository(job, false);
    const getUserProfile = vi.fn();
    const applyProfileEnrichmentIfAbsent = vi.fn();
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      wahooClientFactory: () => ({ disconnect: vi.fn(), getUserProfile }) as never,
      wahooRepository: {
        applyProfileEnrichmentIfAbsent,
        findWahooIntegrationByProfileId: vi.fn(),
      } as never,
    });

    await expect(service.processDueJobs({ workerId: "profile-test" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(getUserProfile).not.toHaveBeenCalled();
    expect(applyProfileEnrichmentIfAbsent).not.toHaveBeenCalled();
    expect(repository.markJobSucceeded).toHaveBeenCalled();
  });
});

describe("WahooSyncJobService planned activities", () => {
  it("claims and completes a generation-fenced publish with the lease signal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T13:00:00.000Z"));
    const job = plannedJob();
    const repository = plannedRepository(job);
    const syncEvent = vi.fn().mockResolvedValue({ action: "created", success: true });
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncEvent } as never,
      wahooRepository: {} as never,
    });

    await expect(service.processDueJobs({ workerId: "planned-test" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });

    expect(repository.claimDueJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTypes: expect.arrayContaining(["wahoo.publish_event", "wahoo.unsync_event"]),
      }),
    );
    const claimedJobTypes = repository.claimDueJobs.mock.calls[0]?.[0].jobTypes;
    expect(claimedJobTypes).not.toEqual(
      expect.arrayContaining([
        "wahoo.upsert_owned_route",
        "wahoo.delete_owned_route",
        "wahoo.reconcile_owned_routes",
        "wahoo.deliver_group_event_route",
        "wahoo.reconcile_group_event_route_deliveries",
      ]),
    );
    expect(syncEvent).toHaveBeenCalledWith(
      "event-1",
      "profile-1",
      expect.objectContaining({
        performanceModelAsOf: "2026-07-28T12:00:00.000Z",
        expectedIntegrationGeneration: 3,
        expectedProjectionHash: "projection-1",
        expectedStartsAt: "2026-07-29T12:00:00.000Z",
        integrationId: "integration-1",
        queuedProjectionSnapshot: projectionSnapshot(),
        signal: expect.any(AbortSignal),
        updateDesiredProjection: expect.any(Function),
      }),
    );
    expect(repository.completeJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({ expectedIntegrationGeneration: 3, id: "planned-job-1" }),
    );
  });

  it("atomically advances a running job to the latest target projection before completion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T13:00:00.000Z"));
    const repository = plannedRepository(plannedJob());
    type SyncExecution = NonNullable<Parameters<WahooSyncService["syncEvent"]>[2]>;
    const syncEvent = vi.fn(
      async (_eventId: string, _profileId: string, execution: SyncExecution) => {
        const updateDesiredProjection = execution.updateDesiredProjection;
        if (!updateDesiredProjection) throw new Error("Expected desired-state updater");
        await updateDesiredProjection({
          performanceModelAsOf: "2026-07-28T13:00:00.000Z",
          projectionHash: "projection-2",
          projectionSnapshot: projectionSnapshot(275),
        });
        return { action: "updated" as const, success: true as const };
      },
    );
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncEvent } as never,
      wahooRepository: {} as never,
    });

    await expect(service.processDueJobs({ workerId: "planned-test" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });

    expect(repository.updateRunningJobDesiredState).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedIntegrationGeneration: 3,
        id: "planned-job-1",
        integrationId: "integration-1",
        payload: expect.objectContaining({
          performanceModelAsOf: "2026-07-28T13:00:00.000Z",
          projectionHash: "projection-2",
          projectionSnapshot: projectionSnapshot(275),
        }),
        payloadHash: expect.any(String),
        profileId: "profile-1",
        provider: "wahoo",
        workerId: expect.stringMatching(/^planned-test:/),
      }),
    );
    expect(repository.completeJobWithSyncState).toHaveBeenCalled();
  });

  it.each([
    [
      "missing performance-model timestamp",
      {
        eventId: "event-1",
        operation: "publish",
        projectionHash: "projection-1",
        startsAt: "2026-07-29T12:00:00.000Z",
      },
    ],
    [
      "malformed",
      {
        performanceModelAsOf: "not-a-timestamp",
        eventId: "event-1",
        operation: "publish",
        projectionHash: "projection-1",
        startsAt: "not-a-timestamp",
      },
    ],
  ])("dead-letters a %s publish startsAt fence before provider work", async (_label, payload) => {
    const job = plannedJob({ payload });
    const repository = plannedRepository(job);
    const syncEvent = vi.fn();
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncEvent } as never,
      wahooRepository: {} as never,
    });

    await expect(service.processDueJobs({ workerId: "planned-test" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(repository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "invalid_wahoo_planned_activity_payload",
        status: "dead_lettered",
      }),
    );
    expect(syncEvent).not.toHaveBeenCalled();
  });

  it("does not claim planned jobs when the planned sync runtime is absent", async () => {
    const repository = plannedRepository(plannedJob());
    repository.claimDueJobs.mockResolvedValue([]);
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      wahooRepository: {} as never,
    });

    await service.processDueJobs({ workerId: "planned-test" });

    expect(repository.claimDueJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTypes: expect.not.arrayContaining(["wahoo.publish_event", "wahoo.unsync_event"]),
      }),
    );
  });

  it("dead-letters malformed planned payloads", async () => {
    const job = plannedJob({
      payload: { eventId: "event-1", operation: "unsync", projectionHash: "bad" },
    });
    const repository = plannedRepository(job);
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncEvent: vi.fn() } as never,
      wahooRepository: {} as never,
    });

    await service.processDueJobs({ workerId: "planned-test" });

    expect(repository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "invalid_wahoo_planned_activity_payload",
        status: "dead_lettered",
      }),
    );
  });

  it("dead-letters publish payloads without an explicit calibration timestamp", async () => {
    const job = plannedJob({
      payload: {
        eventId: "event-1",
        operation: "publish",
        projectionHash: "projection-1",
        startsAt: "2026-07-29T12:00:00.000Z",
      },
    });
    const repository = plannedRepository(job);
    const syncEvent = vi.fn();
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncEvent } as never,
      wahooRepository: {} as never,
    });

    await service.processDueJobs({ workerId: "planned-test" });

    expect(syncEvent).not.toHaveBeenCalled();
    expect(repository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "invalid_wahoo_planned_activity_payload",
        status: "dead_lettered",
      }),
    );
  });

  it("dead-letters planned jobs whose payload event does not match the ordered resource", async () => {
    const job = plannedJob({ internalResourceId: "event-2" });
    const repository = plannedRepository(job);
    const syncEvent = vi.fn();
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncEvent } as never,
      wahooRepository: {} as never,
    });

    await service.processDueJobs({ workerId: "planned-test" });

    expect(syncEvent).not.toHaveBeenCalled();
    expect(repository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "invalid_wahoo_planned_activity_payload",
        status: "dead_lettered",
      }),
    );
  });

  it("terminalizes a superseded generation without provider work", async () => {
    const job = plannedJob();
    const repository = plannedRepository(job, false);
    const syncEvent = vi.fn();
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncEvent } as never,
      wahooRepository: {} as never,
    });

    await service.processDueJobs({ workerId: "planned-test" });

    expect(syncEvent).not.toHaveBeenCalled();
    expect(repository.markJobSucceeded).toHaveBeenCalledWith(
      "planned-job-1",
      expect.stringMatching(/^planned-test:/),
    );
  });

  it.each([
    [
      "retryable",
      {
        failureCode: "provider_failure",
        failureCategory: "provider",
        retryable: true,
        success: false,
      },
      "failed",
    ],
    [
      "ambiguous",
      {
        failureCode: "ambiguous_create",
        failureCategory: "provider",
        retryable: false,
        success: false,
      },
      "dead_lettered",
    ],
  ])("classifies a %s publish failure", async (_label, result, expectedStatus) => {
    const repository = plannedRepository(plannedJob());
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncEvent: vi.fn().mockResolvedValue(result) } as never,
      wahooRepository: {} as never,
    });

    await service.processDueJobs({ workerId: "planned-test" });

    expect(repository.failJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({ status: expectedStatus }),
    );
  });

  it("terminally completes a missing unsync link", async () => {
    const job = plannedJob({
      jobType: "wahoo.unsync_event",
      operation: "unsync",
      payload: { eventId: "event-1", operation: "unsync" },
    });
    const repository = plannedRepository(job);
    const unsyncEvent = vi.fn().mockResolvedValue({
      failureCode: "missing_event",
      failureCategory: "eligibility",
      retryable: false,
      success: false,
    });
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { unsyncEvent } as never,
      wahooRepository: {} as never,
    });

    await service.processDueJobs({ workerId: "planned-test" });

    expect(repository.completeJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { status: "skipped" } }),
    );
  });
});

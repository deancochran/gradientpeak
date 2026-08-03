import { afterEach, describe, expect, it, vi } from "vitest";
import type { WahooProjectionSnapshot } from "../integrations/wahoo/plan-converter";
import type { WahooSyncService } from "../integrations/wahoo/sync-service";
import { getWahooGroupEventRouteDeliveryExternalId } from "./event-delivery/wahoo-group-event-route-delivery";
import { getWahooOwnedRouteExternalId } from "./owned-routes/wahoo-owned-route-mirror";
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

function routeJob(overrides: Record<string, unknown> = {}) {
  return plannedJob({
    id: "route-job-1",
    internalResourceId: "route-1",
    jobType: "wahoo.upsert_owned_route",
    operation: "upsert",
    payload: {
      expectedRouteUpdatedAt: "2026-07-29T12:00:00.000Z",
      externalId: getWahooOwnedRouteExternalId("route-1"),
      operation: "upsert",
      routeId: "route-1",
    },
    resourceKind: "activity_route",
    ...overrides,
  });
}

function deliveryJob(overrides: Record<string, unknown> = {}) {
  return plannedJob({
    id: "delivery-job-1",
    internalResourceId: "event-1",
    jobType: "wahoo.deliver_group_event_route",
    operation: "deliver",
    payload: {
      eventId: "event-1",
      expectedEventUpdatedAt: "2026-07-29T12:00:00.000Z",
      expectedRouteUpdatedAt: "2026-07-29T12:01:00.000Z",
      externalId: getWahooGroupEventRouteDeliveryExternalId({
        eventId: "event-1",
        profileId: "profile-1",
        sourceRouteId: "route-1",
      }),
      sourceRouteId: "route-1",
    },
    resourceKind: "group_event_route_delivery",
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
    expect(syncEvent).toHaveBeenCalledWith(
      "event-1",
      "profile-1",
      expect.objectContaining({
        performanceModelAsOf: "2026-07-28T13:00:00.000Z",
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

describe("WahooSyncJobService owned routes", () => {
  it("claims and completes a generation-fenced route upsert", async () => {
    const repository = plannedRepository(routeJob());
    const syncOwnedRoute = vi.fn().mockResolvedValue({ action: "created", success: true });
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncOwnedRoute } as never,
      wahooRepository: {} as never,
    });

    await expect(service.processDueJobs({ workerId: "route-test" })).resolves.toMatchObject({
      completed: 1,
      processed: 1,
    });
    expect(syncOwnedRoute).toHaveBeenCalledWith(
      "route-1",
      "profile-1",
      getWahooOwnedRouteExternalId("route-1"),
      expect.objectContaining({
        expectedIntegrationGeneration: 3,
        expectedRouteUpdatedAt: "2026-07-29T12:00:00.000Z",
        integrationId: "integration-1",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(repository.completeJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "routes" }),
    );
  });

  it("dead-letters an ambiguous route create", async () => {
    const repository = plannedRepository(routeJob());
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: {
        syncOwnedRoute: vi.fn().mockResolvedValue({
          failureCategory: "provider",
          failureCode: "ambiguous_create",
          retryable: false,
          success: false,
        }),
      } as never,
      wahooRepository: {} as never,
    });

    await service.processDueJobs({ workerId: "route-test" });
    expect(repository.failJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({ lastError: "ambiguous_create", status: "dead_lettered" }),
    );
  });

  it("dead-letters a route job whose provider identity does not match its local route", async () => {
    const repository = plannedRepository(
      routeJob({
        payload: {
          expectedRouteUpdatedAt: "2026-07-29T12:00:00.000Z",
          externalId: getWahooOwnedRouteExternalId("different-route"),
          operation: "upsert",
          routeId: "route-1",
        },
      }),
    );
    const syncOwnedRoute = vi.fn();
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncOwnedRoute } as never,
      wahooRepository: {} as never,
    });

    await service.processDueJobs({ workerId: "route-test" });

    expect(repository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "invalid_wahoo_owned_route_payload",
        status: "dead_lettered",
      }),
    );
    expect(syncOwnedRoute).not.toHaveBeenCalled();
  });

  it("fans a reconciliation job into one serialized upsert per owned route", async () => {
    const repository = plannedRepository(
      routeJob({
        jobType: "wahoo.reconcile_owned_routes",
        operation: "reconcile",
        payload: { trigger: "connect" },
      }),
    );
    const enqueueJob = vi.fn().mockResolvedValue({ id: "upsert-1", status: "queued" });
    Object.assign(repository, { enqueueJob });
    const listOwnedRoutesForMirror = vi
      .fn()
      .mockResolvedValueOnce([{ id: "route-1", updatedAt: "2026-07-29T12:00:00.000Z" }]);
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: {} as never,
      wahooRepository: {
        findWahooIntegrationByProfileId: vi.fn().mockResolvedValue({
          id: "integration-1",
          integrationGeneration: 3,
          scope: "routes_read routes_write offline_data",
        }),
        listOwnedRoutesForMirror,
      } as never,
    });

    await service.processDueJobs({ workerId: "route-test" });
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "wahoo.upsert_owned_route",
        internalResourceId: "route-1",
      }),
    );
    expect(repository.completeJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { affectedCount: 1, status: "reconciled" } }),
    );
  });
});

describe("WahooSyncJobService group-event route delivery", () => {
  const integration = {
    externalId: "wahoo-user-1",
    id: "integration-1",
    integrationGeneration: 3,
    scope: "routes_read routes_write offline_data",
  };

  it("dead-letters a payload mismatch before provider work", async () => {
    const repository = plannedRepository(
      deliveryJob({
        payload: { eventId: "event-1", externalId: "wrong", sourceRouteId: "route-1" },
      }),
    );
    const syncGroupEventRouteDelivery = vi.fn();
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncGroupEventRouteDelivery } as never,
      wahooRepository: {} as never,
    });

    await service.processDueJobs({ workerId: "delivery-test" });

    expect(repository.markJobFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "invalid_wahoo_group_event_route_delivery_payload",
        status: "dead_lettered",
      }),
    );
    expect(syncGroupEventRouteDelivery).not.toHaveBeenCalled();
  });

  it("completes an ineligible delivery as skipped without deleting a route", async () => {
    const repository = plannedRepository(deliveryJob());
    const syncGroupEventRouteDelivery = vi.fn().mockResolvedValue({
      failureCategory: "eligibility",
      failureCode: "missing_route",
      retryable: false,
      success: false,
    });
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncGroupEventRouteDelivery } as never,
      wahooRepository: {
        findWahooIntegrationByProfileId: vi.fn().mockResolvedValue(integration),
      } as never,
    });

    await service.processDueJobs({ workerId: "delivery-test" });

    expect(repository.completeJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { status: "skipped" },
        resource: "group_event_route_delivery",
      }),
    );
  });

  it("dead-letters an ambiguous delivery", async () => {
    const repository = plannedRepository(deliveryJob());
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: {
        syncGroupEventRouteDelivery: vi.fn().mockResolvedValue({
          failureCategory: "provider",
          failureCode: "ambiguous_create",
          retryable: false,
          success: false,
        }),
      } as never,
      wahooRepository: {
        findWahooIntegrationByProfileId: vi.fn().mockResolvedValue(integration),
      } as never,
    });

    await service.processDueJobs({ workerId: "delivery-test" });
    expect(repository.failJobWithSyncState).toHaveBeenCalledWith(
      expect.objectContaining({ lastError: "ambiguous_create", status: "dead_lettered" }),
    );
  });

  it("calls the delivery sync service with a generation-fenced recipient account", async () => {
    const repository = plannedRepository(deliveryJob());
    const syncGroupEventRouteDelivery = vi
      .fn()
      .mockResolvedValue({ action: "created", success: true });
    const service = new WahooSyncJobService({
      providerSyncRepository: repository as never,
      syncService: { syncGroupEventRouteDelivery } as never,
      wahooRepository: {
        findWahooIntegrationByProfileId: vi.fn().mockResolvedValue(integration),
      } as never,
    });

    await service.processDueJobs({ workerId: "delivery-test" });

    expect(syncGroupEventRouteDelivery).toHaveBeenCalledWith(
      "event-1",
      "profile-1",
      "route-1",
      getWahooGroupEventRouteDeliveryExternalId({
        eventId: "event-1",
        profileId: "profile-1",
        sourceRouteId: "route-1",
      }),
      expect.objectContaining({
        expectedIntegrationGeneration: 3,
        integrationId: "integration-1",
        providerAccountExternalId: "wahoo-user-1",
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { WahooSyncJobService } from "./wahoo-job-service";

function createDeps() {
  return {
    providerSyncRepository: {
      claimDueJobs: vi.fn(),
      enqueueJob: vi.fn(),
      markJobFailed: vi.fn(),
      markJobSucceeded: vi.fn(),
      renewJobLease: vi.fn().mockResolvedValue(true),
      touchSyncState: vi.fn(),
      updateSyncStateAfterFailure: vi.fn(),
      updateSyncStateAfterRun: vi.fn(),
    },
    syncService: {
      syncEvent: vi.fn(),
      unsyncEvent: vi.fn(),
    },
    wahooRepository: {
      findWahooIntegrationByProfileId: vi.fn(),
      getPlannedEventForSync: vi.fn(),
      getProfileSyncMetrics: vi.fn().mockResolvedValue({
        bikePowerEfforts: [],
        ftpMetrics: [],
        maxHr: null,
        thresholdHr: null,
      }),
      getRouteForSync: vi.fn(),
    },
  };
}

describe("WahooSyncJobService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules publish jobs when an event is outside the Wahoo display horizon", async () => {
    const deps = createDeps();
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({ id: "integration-1" });
    deps.wahooRepository.getPlannedEventForSync.mockResolvedValue({
      id: "event-1",
      startsAt: "2026-04-15T09:00:00.000Z",
      activityPlan: {
        id: "plan-1",
        name: "Bike",
        routeId: null,
        updatedAt: "2026-04-01T00:00:00.000Z",
        structure: {
          version: 3,
          segments: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              role: "activity",
              category: "bike",
              name: "Bike",
              intervals: [
                {
                  id: "10000000-0000-4000-8000-000000000002",
                  name: "Set",
                  repetitions: 1,
                  steps: [
                    {
                      id: "10000000-0000-4000-8000-000000000003",
                      name: "Work",
                      duration: { type: "time", seconds: 600 },
                      targets: [{ type: "watts", intensity: 200 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    deps.providerSyncRepository.enqueueJob.mockResolvedValue({ id: "job-1", status: "queued" });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));

    const service = new WahooSyncJobService(deps as never);

    await expect(
      service.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" }),
    ).resolves.toEqual({
      jobId: "job-1",
      queued: true,
    });

    expect(deps.providerSyncRepository.touchSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "integration-1",
        nextSyncAt: "2026-04-09T09:00:00.000Z",
        provider: "wahoo",
        publishHorizonDays: 6,
        resource: "planned_workouts",
      }),
    );
    expect(deps.providerSyncRepository.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "wahoo:publish:event:event-1",
        integrationId: "integration-1",
        internalResourceId: "event-1",
        jobType: "wahoo.publish_event",
        operation: "publish",
        payloadHash: expect.any(String),
        runAt: "2026-04-09T09:00:00.000Z",
        syncLaneKey: "wahoo:integration-1:planned_workout:event-1",
      }),
    );
    const firstEnqueue = deps.providerSyncRepository.enqueueJob.mock.calls[0]?.[0];
    expect(firstEnqueue?.payload).toMatchObject({
      projectionHash: expect.any(String),
      projectionSnapshot: {
        plan: {
          header: expect.not.objectContaining({
            ftp: expect.anything(),
            max_hr: expect.anything(),
          }),
          intervals: expect.any(Array),
        },
      },
    });

    deps.wahooRepository.getProfileSyncMetrics.mockResolvedValue({
      bikePowerEfforts: [],
      ftpMetrics: [],
      maxHr: 190,
      thresholdHr: null,
    });
    deps.providerSyncRepository.enqueueJob.mockResolvedValue({ id: "job-2", status: "queued" });
    await service.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" });
    const secondEnqueue = deps.providerSyncRepository.enqueueJob.mock.calls[1]?.[0];
    expect(secondEnqueue?.payload.projectionSnapshot.plan.header.max_hr).toBeUndefined();
    expect(secondEnqueue?.payloadHash).toBe(firstEnqueue?.payloadHash);
    expect(secondEnqueue?.payload.projectionHash).toBe(firstEnqueue?.payload.projectionHash);

    const planned = await deps.wahooRepository.getPlannedEventForSync();
    deps.wahooRepository.getPlannedEventForSync.mockResolvedValue({
      ...planned,
      activityPlan: { ...planned.activityPlan, routeId: "missing-route" },
    });
    deps.wahooRepository.getRouteForSync.mockResolvedValue(null);
    await expect(
      service.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" }),
    ).rejects.toThrow(/linked route is missing/);
    expect(deps.providerSyncRepository.enqueueJob).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("rejects unsupported compiled semantics before enqueue", async () => {
    const deps = createDeps();
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({ id: "integration-1" });
    deps.wahooRepository.getPlannedEventForSync.mockResolvedValue({
      id: "event-1",
      startsAt: "2026-04-15T09:00:00.000Z",
      activityPlan: {
        id: "plan-1",
        name: "Swim",
        routeId: null,
        updatedAt: "2026-04-01T00:00:00.000Z",
        structure: {
          version: 3,
          segments: [
            {
              id: "20000000-0000-4000-8000-000000000001",
              role: "activity",
              category: "swim",
              name: "Swim",
              intervals: [
                {
                  id: "20000000-0000-4000-8000-000000000002",
                  name: "Set",
                  repetitions: 1,
                  steps: [
                    {
                      id: "20000000-0000-4000-8000-000000000003",
                      name: "Work",
                      duration: { type: "time", seconds: 600 },
                      targets: [{ type: "RPE", intensity: 5 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    const service = new WahooSyncJobService(deps as never);
    await expect(
      service.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" }),
    ).rejects.toThrow(/single-sport run or bike/);
    expect(deps.providerSyncRepository.touchSyncState).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.enqueueJob).not.toHaveBeenCalled();
  });

  it("processes due publish jobs through the existing Wahoo sync service", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        dedupeKey: "wahoo:publish:event:event-1",
        id: "job-1",
        integrationId: "integration-1",
        internalResourceId: "event-1",
        jobType: "wahoo.publish_event",
        maxAttempts: 8,
        payload: { eventId: "event-1", operation: "publish", projectionHash: "projection-1" },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: "event",
        runAt: "2026-04-01T12:00:00.000Z",
        status: "running",
      },
    ]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({ id: "integration-1" });
    deps.syncService.syncEvent.mockResolvedValue({ success: true });

    const service = new WahooSyncJobService(deps as never);

    await expect(service.processDueJobs({ limit: 5, workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });

    expect(deps.syncService.syncEvent).toHaveBeenCalledWith("event-1", "profile-1", {
      expectedProjectionHash: "projection-1",
    });
    expect(deps.providerSyncRepository.claimDueJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 4,
        workerId: expect.stringMatching(/^worker-1:/),
      }),
    );
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith(
      "job-1",
      expect.stringMatching(/^worker-1:/),
    );
    expect(deps.providerSyncRepository.updateSyncStateAfterRun).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "integration-1",
        provider: "wahoo",
        resource: "planned_workouts",
        succeeded: true,
      }),
    );
  });

  it.each([
    ["missing_metric", "A positive FTP is required before this workout can sync."],
    ["unsupported_target", "RPE targets are not supported by Wahoo."],
    ["invalid_plan", "Linked route no longer exists."],
  ])("terminally skips a deterministic worker-time %s result", async (failureCode, error) => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        dedupeKey: "wahoo:publish:event:event-1",
        id: "job-1",
        integrationId: "integration-1",
        internalResourceId: "event-1",
        jobType: "wahoo.publish_event",
        maxAttempts: 8,
        payload: { eventId: "event-1", operation: "publish" },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: "event",
        runAt: "2026-04-01T12:00:00.000Z",
        status: "running",
      },
    ]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({ id: "integration-1" });
    deps.syncService.syncEvent.mockResolvedValue({
      success: false,
      action: "no_change",
      error,
      failureCode,
      failureCategory: "eligibility",
      retryable: false,
    });

    const service = new WahooSyncJobService(deps as never);

    await expect(service.processDueJobs({ limit: 1, workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith(
      "job-1",
      expect.stringMatching(/^worker-1:/),
    );
    expect(deps.providerSyncRepository.markJobFailed).not.toHaveBeenCalled();
  });

  it("keeps corrupt queue payloads in the dead-letter path", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        id: "job-corrupt",
        integrationId: "integration-1",
        jobType: "wahoo.publish_event",
        maxAttempts: 8,
        payload: { corrupted: true },
        profileId: "profile-1",
        provider: "wahoo",
        runAt: "2026-04-01T12:00:00.000Z",
        status: "running",
      },
    ]);
    const service = new WahooSyncJobService(deps as never);

    await expect(service.processDueJobs({ limit: 1, workerId: "worker-1" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(deps.providerSyncRepository.markJobFailed).toHaveBeenCalledWith({
      id: "job-corrupt",
      lastError: "Invalid Wahoo job payload",
      status: "dead_lettered",
      workerId: expect.stringMatching(/^worker-1:/),
    });
  });

  it("keeps a first-attempt transient provider failure retryable with backoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        dedupeKey: "wahoo:publish:event:event-1",
        id: "job-1",
        integrationId: "integration-1",
        internalResourceId: "event-1",
        jobType: "wahoo.publish_event",
        maxAttempts: 8,
        payload: { eventId: "event-1", operation: "publish" },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: "event",
        runAt: "2026-04-01T12:00:00.000Z",
        status: "running",
      },
    ]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({ id: "integration-1" });
    deps.syncService.syncEvent.mockResolvedValue({
      success: false,
      action: "no_change",
      error: "Wahoo is temporarily unavailable.",
      failureCode: "provider_failure",
      failureCategory: "provider",
      retryable: true,
    });

    const service = new WahooSyncJobService(deps as never);

    await expect(service.processDueJobs({ limit: 1, workerId: "worker-1" })).resolves.toEqual({
      completed: 0,
      failed: 1,
      processed: 1,
    });
    expect(deps.providerSyncRepository.markJobFailed).toHaveBeenCalledWith({
      id: "job-1",
      lastError: "Wahoo is temporarily unavailable.",
      nextRunAt: "2026-04-01T12:05:00.000Z",
      status: "failed",
      workerId: expect.stringMatching(/^worker-1:/),
    });
  });

  it("completes due jobs without syncing when the integration was disconnected", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        dedupeKey: "wahoo:publish:event:event-1",
        id: "job-1",
        integrationId: "integration-1",
        internalResourceId: "event-1",
        jobType: "wahoo.publish_event",
        maxAttempts: 8,
        payload: { eventId: "event-1", operation: "publish" },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: "event",
        runAt: "2026-04-01T12:00:00.000Z",
        status: "running",
      },
    ]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue(null);

    const service = new WahooSyncJobService(deps as never);

    await expect(service.processDueJobs({ limit: 5, workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });

    expect(deps.syncService.syncEvent).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith(
      "job-1",
      expect.stringMatching(/^worker-1:/),
    );
    expect(deps.providerSyncRepository.updateSyncStateAfterRun).not.toHaveBeenCalled();
  });

  it("treats unsync jobs without an existing provider record as no-ops", async () => {
    const deps = createDeps();
    deps.providerSyncRepository.claimDueJobs.mockResolvedValue([
      {
        attempt: 1,
        dedupeKey: "wahoo:unsync:event:event-1",
        id: "job-1",
        integrationId: "integration-1",
        internalResourceId: "event-1",
        jobType: "wahoo.unsync_event",
        maxAttempts: 8,
        payload: { eventId: "event-1", operation: "unsync" },
        profileId: "profile-1",
        provider: "wahoo",
        resourceKind: "event",
        runAt: "2026-04-01T12:00:00.000Z",
        status: "running",
      },
    ]);
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({ id: "integration-1" });
    deps.syncService.unsyncEvent.mockResolvedValue({
      success: false,
      action: "no_change",
      error: "Sync record not found",
    });

    const service = new WahooSyncJobService(deps as never);

    await expect(service.processDueJobs({ limit: 5, workerId: "worker-1" })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });

    expect(deps.syncService.unsyncEvent).toHaveBeenCalledWith("event-1", "profile-1");
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith(
      "job-1",
      expect.stringMatching(/^worker-1:/),
    );
    expect(deps.providerSyncRepository.markJobFailed).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.updateSyncStateAfterRun).not.toHaveBeenCalled();
  });
});

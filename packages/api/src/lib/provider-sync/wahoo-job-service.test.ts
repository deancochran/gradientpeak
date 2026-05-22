import { describe, expect, it, vi } from "vitest";
import { WahooSyncJobService } from "./wahoo-job-service";

function createDeps() {
  return {
    providerSyncRepository: {
      claimDueJobs: vi.fn(),
      enqueueJob: vi.fn(),
      markJobFailed: vi.fn(),
      markJobSucceeded: vi.fn(),
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
    },
  };
}

describe("WahooSyncJobService", () => {
  it("schedules publish jobs when an event is outside the Wahoo display horizon", async () => {
    const deps = createDeps();
    deps.wahooRepository.findWahooIntegrationByProfileId.mockResolvedValue({ id: "integration-1" });
    deps.wahooRepository.getPlannedEventForSync.mockResolvedValue({
      id: "event-1",
      startsAt: "2026-04-15T09:00:00.000Z",
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

    vi.useRealTimers();
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
        payload: { eventId: "event-1", operation: "publish" },
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

    expect(deps.syncService.syncEvent).toHaveBeenCalledWith("event-1", "profile-1");
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith("job-1", "worker-1");
    expect(deps.providerSyncRepository.updateSyncStateAfterRun).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "integration-1",
        provider: "wahoo",
        resource: "planned_workouts",
        succeeded: true,
      }),
    );
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
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith("job-1", "worker-1");
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
    expect(deps.providerSyncRepository.markJobSucceeded).toHaveBeenCalledWith("job-1", "worker-1");
    expect(deps.providerSyncRepository.markJobFailed).not.toHaveBeenCalled();
    expect(deps.providerSyncRepository.updateSyncStateAfterRun).not.toHaveBeenCalled();
  });
});

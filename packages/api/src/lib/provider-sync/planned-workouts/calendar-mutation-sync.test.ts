import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueuePlannedWorkoutSyncAfterCalendarMutation,
  getEventPlannedWorkoutProviderStatuses,
} from "./calendar-mutation-sync";

const {
  drainDueWahooPlannedWorkoutJobs,
  enqueueJob,
  findCredentialsByProfileIdAndProvider,
  findWahooIntegrationByProfileId,
  getPlannedEventForSync,
  integrationsListByProfileId,
  listEventResourceLinks,
  listJobs,
  touchSyncState,
} = vi.hoisted(() => ({
  drainDueWahooPlannedWorkoutJobs: vi.fn(),
  enqueueJob: vi.fn(),
  findCredentialsByProfileIdAndProvider: vi.fn(),
  findWahooIntegrationByProfileId: vi.fn(),
  getPlannedEventForSync: vi.fn(),
  integrationsListByProfileId: vi.fn(),
  listEventResourceLinks: vi.fn(),
  listJobs: vi.fn(),
  touchSyncState: vi.fn(),
}));

vi.mock("../../../infrastructure/repositories", () => ({
  createIntegrationsRepositories: vi.fn(() => ({
    integrations: {
      findCredentialsByProfileIdAndProvider,
      listByProfileId: integrationsListByProfileId,
    },
  })),
  createProviderSyncRepository: vi.fn(() => ({
    enqueueJob,
    listJobs,
    touchSyncState,
  })),
  createWahooRepository: vi.fn(() => ({
    findWahooIntegrationByProfileId,
    getPlannedEventForSync,
    listEventResourceLinks,
  })),
}));

vi.mock("../wahoo-planned-workout-drain", () => ({
  drainDueWahooPlannedWorkoutJobs,
}));

describe("enqueuePlannedWorkoutSyncAfterCalendarMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    integrationsListByProfileId.mockResolvedValue([{ id: "integration-1", provider: "wahoo" }]);
    findWahooIntegrationByProfileId.mockResolvedValue({ id: "integration-1" });
    getPlannedEventForSync.mockResolvedValue({
      id: "event-1",
      startsAt: "2026-04-10T09:00:00.000Z",
      activityPlan: {
        id: "plan-1",
        routeId: null,
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
    });
    enqueueJob.mockResolvedValue({ id: "job-1", status: "queued" });
    drainDueWahooPlannedWorkoutJobs.mockResolvedValue({ completed: 1, failed: 0, processed: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the calendar event owner profile when enqueueing provider sync", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));

    await expect(
      enqueuePlannedWorkoutSyncAfterCalendarMutation({
        db: {} as never,
        eventIds: ["event-1", "event-1"],
        operation: "publish",
        profileId: "athlete-profile-id",
      }),
    ).resolves.toEqual({
      affectedCount: 1,
      jobId: "job-1",
      operation: "publish",
      queued: true,
      success: true,
    });

    expect(integrationsListByProfileId).toHaveBeenCalledWith("athlete-profile-id");
    expect(findWahooIntegrationByProfileId).toHaveBeenCalledWith("athlete-profile-id");
    expect(getPlannedEventForSync).toHaveBeenCalledWith({
      eventId: "event-1",
      profileId: "athlete-profile-id",
    });
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        internalResourceId: "event-1",
        profileId: "athlete-profile-id",
        syncLaneKey: "wahoo:integration-1:planned_workout:event-1",
      }),
    );
    expect(drainDueWahooPlannedWorkoutJobs).toHaveBeenCalledWith({
      db: {},
      limit: 3,
      workerId: "calendar-mutation-planned-workout-drain",
    });

    vi.useRealTimers();
  });

  it("returns the enqueue result when the immediate due-job drain fails", async () => {
    drainDueWahooPlannedWorkoutJobs.mockRejectedValueOnce(new Error("worker unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      enqueuePlannedWorkoutSyncAfterCalendarMutation({
        db: {} as never,
        eventIds: ["event-1"],
        operation: "publish",
        profileId: "athlete-profile-id",
      }),
    ).resolves.toEqual({
      affectedCount: 1,
      jobId: "job-1",
      operation: "publish",
      queued: true,
      success: true,
    });

    expect(console.error).toHaveBeenCalledWith(
      "Failed to drain due planned workout sync jobs after enqueue:",
      expect.any(Error),
    );
  });

  it("does not enqueue when the owner has no planned-push provider connected", async () => {
    integrationsListByProfileId.mockResolvedValue([{ id: "integration-1", provider: "strava" }]);

    await expect(
      enqueuePlannedWorkoutSyncAfterCalendarMutation({
        db: {} as never,
        eventIds: ["event-1"],
        operation: "publish",
        profileId: "athlete-profile-id",
      }),
    ).resolves.toBeNull();

    expect(enqueueJob).not.toHaveBeenCalled();
    expect(drainDueWahooPlannedWorkoutJobs).not.toHaveBeenCalled();
  });

  it("can skip the immediate drain when the caller only wants to enqueue", async () => {
    await expect(
      enqueuePlannedWorkoutSyncAfterCalendarMutation({
        db: {} as never,
        drainDueJobs: false,
        eventIds: ["event-1"],
        operation: "publish",
        profileId: "athlete-profile-id",
      }),
    ).resolves.toMatchObject({ queued: true, success: true });

    expect(enqueueJob).toHaveBeenCalled();
    expect(drainDueWahooPlannedWorkoutJobs).not.toHaveBeenCalled();
  });
});

describe("getEventPlannedWorkoutProviderStatuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    integrationsListByProfileId.mockResolvedValue([{ id: "integration-1", provider: "wahoo" }]);
    findCredentialsByProfileIdAndProvider.mockResolvedValue(null);
    listEventResourceLinks.mockResolvedValue([]);
    listJobs.mockResolvedValue([]);
  });

  it.each([
    "queued",
    "running",
  ] as const)("prefers a newer %s intent over an old dead-lettered job", async (status) => {
    listJobs.mockResolvedValue([
      {
        id: "job-old-dead-letter",
        internalResourceId: "event-1",
        lastError: "old failure",
        provider: "wahoo",
        queueSequence: 41,
        runAt: "2026-04-01T12:00:00.000Z",
        status: "dead_lettered",
        supersedesJobId: null,
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
      {
        id: "job-new-intent",
        internalResourceId: "event-1",
        lastError: null,
        provider: "wahoo",
        queueSequence: 42,
        runAt: "2026-04-01T11:00:00.000Z",
        status,
        supersedesJobId: null,
        updatedAt: "2026-04-01T11:00:00.000Z",
      },
    ]);

    await expect(
      getEventPlannedWorkoutProviderStatuses({
        db: {} as never,
        eventId: "event-1",
        profileId: "athlete-profile-id",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        jobId: "job-new-intent",
        lastError: null,
        provider: "wahoo",
        status: "queued",
      }),
    ]);
    expect(listJobs).toHaveBeenCalledWith({
      internalResourceId: "event-1",
      limit: 100,
      order: "newest_authority",
      profileId: "athlete-profile-id",
      provider: "wahoo",
      statuses: ["queued", "running", "failed", "dead_lettered"],
    });
  });

  it("prefers a newer successful resource link over an old failed job", async () => {
    listJobs.mockResolvedValue([
      {
        id: "job-old-failure",
        internalResourceId: "event-1",
        lastError: "old failure",
        provider: "wahoo",
        runAt: "2026-04-01T12:00:00.000Z",
        status: "failed",
        supersedesJobId: null,
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
    ]);
    listEventResourceLinks.mockResolvedValue([
      {
        externalId: "wahoo-plan-1",
        id: "link-1",
        provider: "wahoo",
        syncedAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:00:00.000Z",
      },
    ]);

    await expect(
      getEventPlannedWorkoutProviderStatuses({
        db: {} as never,
        eventId: "event-1",
        profileId: "athlete-profile-id",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        externalId: "wahoo-plan-1",
        jobId: null,
        provider: "wahoo",
        status: "synced",
      }),
    ]);
  });

  it("does not hide a failure that is newer than the successful resource link", async () => {
    listJobs.mockResolvedValue([
      {
        id: "job-new-failure",
        internalResourceId: "event-1",
        lastError: "new failure",
        provider: "wahoo",
        runAt: "2026-04-01T09:00:00.000Z",
        status: "failed",
        supersedesJobId: null,
        updatedAt: "2026-04-01T11:00:00.000Z",
      },
    ]);
    listEventResourceLinks.mockResolvedValue([
      {
        externalId: "wahoo-plan-1",
        id: "link-1",
        provider: "wahoo",
        syncedAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:00:00.000Z",
      },
    ]);

    await expect(
      getEventPlannedWorkoutProviderStatuses({
        db: {} as never,
        eventId: "event-1",
        profileId: "athlete-profile-id",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        externalId: null,
        jobId: "job-new-failure",
        lastError: "new failure",
        provider: "wahoo",
        status: "failed",
      }),
    ]);
  });
});

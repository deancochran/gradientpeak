import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueuePlannedWorkoutSyncAfterCalendarMutation } from "./calendar-mutation-sync";

const {
  drainDueWahooPlannedWorkoutJobs,
  enqueueJob,
  findWahooIntegrationByProfileId,
  getPlannedEventForSync,
  integrationsListByProfileId,
  touchSyncState,
} = vi.hoisted(() => ({
  drainDueWahooPlannedWorkoutJobs: vi.fn(),
  enqueueJob: vi.fn(),
  findWahooIntegrationByProfileId: vi.fn(),
  getPlannedEventForSync: vi.fn(),
  integrationsListByProfileId: vi.fn(),
  touchSyncState: vi.fn(),
}));

vi.mock("../../../infrastructure/repositories", () => ({
  createIntegrationsRepositories: vi.fn(() => ({
    integrations: {
      listByProfileId: integrationsListByProfileId,
    },
  })),
  createProviderSyncRepository: vi.fn(() => ({
    enqueueJob,
    touchSyncState,
  })),
  createWahooRepository: vi.fn(() => ({
    findWahooIntegrationByProfileId,
    getPlannedEventForSync,
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

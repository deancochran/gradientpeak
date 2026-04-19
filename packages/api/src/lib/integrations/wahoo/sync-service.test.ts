import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  calculateWorkoutDurationMock,
  convertToWahooPlanMock,
  createWahooClientMock,
  extractStartCoordinatesMock,
  getWorkoutTypeFamilyForRouteMock,
  prepareGPXForWahooMock,
  supportsRoutesMock,
  validateRouteForWahooMock,
  validateWahooCompatibilityMock,
} = vi.hoisted(() => ({
  createWahooClientMock: vi.fn(),
  supportsRoutesMock: vi.fn(),
  calculateWorkoutDurationMock: vi.fn(),
  convertToWahooPlanMock: vi.fn(),
  validateWahooCompatibilityMock: vi.fn(),
  validateRouteForWahooMock: vi.fn(),
  extractStartCoordinatesMock: vi.fn(),
  prepareGPXForWahooMock: vi.fn(),
  getWorkoutTypeFamilyForRouteMock: vi.fn(),
}));

vi.mock("./client", () => ({
  createWahooClient: createWahooClientMock,
  supportsRoutes: supportsRoutesMock,
}));

vi.mock("./plan-converter", () => ({
  calculateWorkoutDuration: calculateWorkoutDurationMock,
  convertToWahooPlan: convertToWahooPlanMock,
  isActivityTypeSupportedByWahoo: vi.fn(() => true),
  validateWahooCompatibility: validateWahooCompatibilityMock,
}));

vi.mock("./route-converter", () => ({
  extractStartCoordinates: extractStartCoordinatesMock,
  getWorkoutTypeFamilyForRoute: getWorkoutTypeFamilyForRouteMock,
  prepareGPXForWahoo: prepareGPXForWahooMock,
  validateRouteForWahoo: validateRouteForWahooMock,
}));

import { WahooSyncService } from "./sync-service";

function createRepositoryMock() {
  return {
    createEventResourceLink: vi.fn().mockResolvedValue(undefined),
    deleteEventResourceLink: vi.fn().mockResolvedValue(undefined),
    findWahooIntegrationByProfileId: vi.fn().mockResolvedValue({
      accessToken: "access-token",
      externalId: "wahoo-user-1",
      id: "integration-1",
      profileId: "profile-1",
      refreshToken: "refresh-token",
    }),
    getPlannedEventForSync: vi.fn().mockResolvedValue({
      id: "event-1",
      startsAt: "2026-04-05T09:00:00.000Z",
      activityPlan: {
        activity_category: "bike",
        description: "Steady endurance ride",
        id: "plan-1",
        name: "Long Ride",
        route_id: null,
        structure: { intervals: [] },
        updated_at: "2026-04-01T09:00:00.000Z",
      },
    }),
    getProfileSyncMetrics: vi.fn().mockResolvedValue({ ftp: 250, thresholdHr: 170 }),
    getRouteForSync: vi.fn().mockResolvedValue(null),
    getEventResourceLink: vi.fn().mockResolvedValue(null),
    listEventResourceLinks: vi.fn().mockResolvedValue([]),
    updateEventResourceLink: vi.fn().mockResolvedValue(undefined),
  };
}

function createClientMock() {
  return {
    createPlan: vi.fn().mockResolvedValue({ id: 42 }),
    createRoute: vi.fn().mockResolvedValue({ id: 41 }),
    createWorkout: vi.fn().mockResolvedValue({ id: 43 }),
    deleteWorkout: vi.fn().mockResolvedValue(undefined),
    updateWorkout: vi.fn().mockResolvedValue({ success: true }),
  };
}

describe("WahooSyncService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    supportsRoutesMock.mockReset();
    supportsRoutesMock.mockReturnValue(true);
    calculateWorkoutDurationMock.mockReset();
    calculateWorkoutDurationMock.mockReturnValue(1800);
    convertToWahooPlanMock.mockReset();
    convertToWahooPlanMock.mockReturnValue({ header: {}, intervals: [] });
    validateWahooCompatibilityMock.mockReset();
    validateWahooCompatibilityMock.mockReturnValue({ compatible: true, warnings: [] });
    validateRouteForWahooMock.mockReset();
    validateRouteForWahooMock.mockReturnValue({ valid: true, errors: [], warnings: [] });
    extractStartCoordinatesMock.mockReset();
    extractStartCoordinatesMock.mockReturnValue({ latitude: 35.1, longitude: -80.8 });
    prepareGPXForWahooMock.mockReset();
    prepareGPXForWahooMock.mockReturnValue("encoded-gpx");
    getWorkoutTypeFamilyForRouteMock.mockReset();
    getWorkoutTypeFamilyForRouteMock.mockReturnValue(0);
    createWahooClientMock.mockReset();

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates a new sync with route data when no prior sync exists", async () => {
    const repository = createRepositoryMock();
    repository.getRouteForSync.mockResolvedValueOnce({
      activityCategory: "bike",
      description: "Greenway loop",
      filePath: "routes/greenway.gpx",
      id: "route-1",
      name: "Greenway Loop",
      totalAscent: 340,
      totalDescent: 330,
      totalDistance: 40234,
    });
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      id: "event-1",
      startsAt: "2026-04-05T09:00:00.000Z",
      activityPlan: {
        activity_category: "bike",
        description: "Endurance with route",
        id: "plan-1",
        name: "Long Ride",
        route_id: "route-1",
        structure: { intervals: [] },
        updated_at: "2026-04-01T09:00:00.000Z",
      },
    });
    validateRouteForWahooMock.mockReturnValueOnce({
      valid: true,
      errors: [],
      warnings: ["Route is very short (less than 100 meters)"],
    });
    const storage = { downloadRouteGpx: vi.fn().mockResolvedValue("<gpx></gpx>") };
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({ repository, storage });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toEqual({
      success: true,
      action: "created",
      workoutId: "43",
      warnings: ["Route is very short (less than 100 meters)"],
    });

    expect(storage.downloadRouteGpx).toHaveBeenCalledWith("routes/greenway.gpx");
    expect(wahooClient.createRoute).toHaveBeenCalledWith({
      file: "encoded-gpx",
      filename: "Greenway Loop.gpx",
      externalId: "routes/greenway.gpx",
      providerUpdatedAt: "2026-04-03T12:00:00.000Z",
      name: "Greenway Loop",
      description: "Greenway loop",
      workoutTypeFamilyId: 0,
      startLat: 35.1,
      startLng: -80.8,
      distance: 40234,
      ascent: 340,
      descent: 330,
    });
    expect(wahooClient.createPlan).toHaveBeenCalledWith({
      structure: { header: {}, intervals: [] },
      name: "Long Ride",
      description: "Endurance with route",
      activityType: "bike",
      externalId: "plan-1",
    });
    expect(wahooClient.createWorkout).toHaveBeenCalledWith({
      planId: 42,
      name: "Long Ride",
      scheduledDate: "2026-04-05T09:00:00.000Z",
      externalId: "event-1",
      routeId: 41,
      workoutTypeId: 0,
      durationMinutes: 30,
    });
    expect(repository.createEventResourceLink).toHaveBeenCalledWith({
      profileId: "profile-1",
      eventId: "event-1",
      integrationId: "integration-1",
      provider: "wahoo",
      externalId: "43",
      syncedAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
    });
  });

  it("updates workout metadata only when the synced structure is not older", async () => {
    const repository = createRepositoryMock();
    repository.getEventResourceLink.mockResolvedValueOnce({
      externalId: "workout-77",
      id: "sync-1",
      updatedAt: "2026-04-02T09:00:00.000Z",
    });
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      id: "event-1",
      startsAt: "2026-04-06T07:30:00.000Z",
      activityPlan: {
        activity_category: "bike",
        description: "Metadata-only change",
        id: "plan-1",
        name: "Updated Workout Name",
        route_id: null,
        structure: { intervals: [] },
        updated_at: "2026-04-01T09:00:00.000Z",
      },
    });
    const storage = { downloadRouteGpx: vi.fn() };
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({ repository, storage });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toEqual({
      success: true,
      action: "updated",
      workoutId: "workout-77",
      warnings: [],
    });

    expect(wahooClient.updateWorkout).toHaveBeenCalledWith("workout-77", {
      name: "Updated Workout Name",
      scheduledDate: "2026-04-06T07:30:00.000Z",
    });
    expect(repository.updateEventResourceLink).toHaveBeenCalledWith({
      id: "sync-1",
      updatedAt: "2026-04-03T12:00:00.000Z",
    });
    expect(wahooClient.createPlan).not.toHaveBeenCalled();
    expect(wahooClient.createWorkout).not.toHaveBeenCalled();
  });

  it("recreates the Wahoo workout when the activity plan structure is newer", async () => {
    const repository = createRepositoryMock();
    repository.getEventResourceLink.mockResolvedValueOnce({
      externalId: "workout-77",
      id: "sync-1",
      updatedAt: "2026-04-01T09:00:00.000Z",
    });
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      id: "event-1",
      startsAt: "2026-04-06T07:30:00.000Z",
      activityPlan: {
        activity_category: "bike",
        description: "Structure changed",
        id: "plan-1",
        name: "Rebuilt Workout",
        route_id: "route-1",
        structure: { intervals: [{ repetitions: 1, steps: [] }] },
        updated_at: "2026-04-03T09:00:00.000Z",
      },
    });
    calculateWorkoutDurationMock.mockReturnValueOnce(3661);
    const storage = { downloadRouteGpx: vi.fn() };
    const wahooClient = createClientMock();
    wahooClient.createPlan.mockResolvedValueOnce({ id: 88 });
    wahooClient.createWorkout.mockResolvedValueOnce({ id: 99 });
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({ repository, storage });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toEqual({
      success: true,
      action: "recreated",
      workoutId: "99",
      warnings: [],
    });

    expect(wahooClient.createPlan).toHaveBeenCalledWith({
      structure: { header: {}, intervals: [] },
      name: "Rebuilt Workout",
      description: "Structure changed",
      activityType: "bike",
      externalId: "plan-1",
    });
    expect(wahooClient.createWorkout).toHaveBeenCalledWith({
      planId: 88,
      name: "Rebuilt Workout",
      scheduledDate: "2026-04-06T07:30:00.000Z",
      externalId: "event-1",
      workoutTypeId: 0,
      durationMinutes: 62,
    });
    expect(wahooClient.deleteWorkout).toHaveBeenCalledWith("workout-77");
    expect(repository.updateEventResourceLink).toHaveBeenCalledWith({
      id: "sync-1",
      externalId: "99",
      updatedAt: "2026-04-03T12:00:00.000Z",
    });
  });

  it("deletes the local sync record even if the remote Wahoo delete fails", async () => {
    const repository = createRepositoryMock();
    repository.getEventResourceLink.mockResolvedValueOnce({
      externalId: "workout-77",
      id: "sync-1",
      updatedAt: "2026-04-01T09:00:00.000Z",
    });
    const storage = { downloadRouteGpx: vi.fn() };
    const wahooClient = createClientMock();
    wahooClient.deleteWorkout.mockRejectedValueOnce(new Error("remote unavailable"));
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({ repository, storage });

    await expect(service.unsyncEvent("event-1", "profile-1")).resolves.toEqual({
      success: true,
      action: "updated",
    });

    expect(wahooClient.deleteWorkout).toHaveBeenCalledWith("workout-77");
    expect(repository.deleteEventResourceLink).toHaveBeenCalledWith("sync-1");
  });
});

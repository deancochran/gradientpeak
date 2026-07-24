import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  calculateWorkoutDurationMock,
  convertToWahooPlanMock,
  createWahooClientMock,
  extractStartCoordinatesMock,
  getWorkoutTypeFamilyForRouteMock,
  prepareGPXForWahooMock,
  refreshWahooAccessTokenMock,
  supportsRoutesMock,
  validateRouteForWahooMock,
} = vi.hoisted(() => ({
  createWahooClientMock: vi.fn(),
  refreshWahooAccessTokenMock: vi.fn(),
  supportsRoutesMock: vi.fn(),
  calculateWorkoutDurationMock: vi.fn(),
  convertToWahooPlanMock: vi.fn(),
  validateRouteForWahooMock: vi.fn(),
  extractStartCoordinatesMock: vi.fn(),
  prepareGPXForWahooMock: vi.fn(),
  getWorkoutTypeFamilyForRouteMock: vi.fn(),
}));

vi.mock("./client", () => ({
  createWahooClient: createWahooClientMock,
  refreshWahooAccessToken: refreshWahooAccessTokenMock,
}));

vi.mock("./activity-type-utils", () => ({
  isWahooSupported: vi.fn(() => true),
  supportsRoutes: supportsRoutesMock,
  toActivityType: vi.fn((category) => category),
  toWahooTypes: vi.fn((activityType, options?: { hasRoute?: boolean }) => ({
    workout_type_family: activityType === "run" ? 1 : 0,
    workout_type_location: options?.hasRoute ? 1 : 0,
  })),
  toWahooWorkoutTypeId: vi.fn((activityType, options?: { hasRoute?: boolean }) => {
    if (activityType === "bike") return options?.hasRoute ? 0 : 12;
    if (activityType === "run") return options?.hasRoute ? 1 : 5;
    return null;
  }),
}));

vi.mock("./plan-converter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan-converter")>()),
  calculateWorkoutDuration: calculateWorkoutDurationMock,
  convertToWahooPlan: convertToWahooPlanMock,
}));

vi.mock("./route-converter", () => ({
  extractStartCoordinates: extractStartCoordinatesMock,
  getWorkoutTypeFamilyForRoute: getWorkoutTypeFamilyForRouteMock,
  prepareGPXForWahoo: prepareGPXForWahooMock,
  validateRouteForWahoo: validateRouteForWahooMock,
}));

import { hashPlannedWorkoutPayload } from "../../provider-sync/planned-workouts/planned-workout-hash";
import { getWahooProjectionSnapshot } from "./plan-converter";
import { resolveWahooSyncMetrics, WahooSyncService } from "./sync-service";

const intervalId = "00000000-0000-4000-8000-000000000001";
const stepId = "00000000-0000-4000-8000-000000000002";
const segmentId = "00000000-0000-4000-8000-000000000003";

function createValidStructure(
  targets: Array<{ intensity: number; type: string }> = [{ type: "watts", intensity: 200 }],
) {
  return {
    version: 3 as const,
    segments: [
      {
        id: segmentId,
        name: "Bike",
        role: "activity" as const,
        category: "bike" as const,
        intervals: [
          {
            id: intervalId,
            name: "Main set",
            repetitions: 1,
            steps: [
              {
                id: stepId,
                duration: { type: "time" as const, seconds: 1800 },
                name: "Endurance",
                targets,
              },
            ],
          },
        ],
      },
    ],
  };
}

function currentProjectionHash() {
  return hashPlannedWorkoutPayload({
    projectionSnapshot: getWahooProjectionSnapshot(createValidStructure() as never, {
      activityType: "bike",
      description: "Metadata-only change",
      name: "Updated Workout Name",
      ftp: 250,
      max_hr: 190,
      threshold_hr: 170,
    }),
    sourcePlanId: "plan-1",
    sourceRouteId: null,
  });
}

function createRepositoryMock() {
  return {
    createEventResourceLink: vi.fn().mockResolvedValue(undefined),
    deleteEventResourceLink: vi.fn().mockResolvedValue(undefined),
    findWahooIntegrationByProfileId: vi.fn().mockResolvedValue({
      accessToken: "access-token",
      expiresAt: null,
      externalId: "wahoo-user-1",
      id: "integration-1",
      profileId: "profile-1",
      refreshToken: "refresh-token",
    }),
    getPlannedEventForSync: vi.fn().mockResolvedValue({
      id: "event-1",
      startsAt: "2026-04-05T09:00:00.000Z",
      activityPlan: {
        activityCategory: "bike",
        description: "Steady endurance ride",
        id: "plan-1",
        name: "Long Ride",
        routeId: null,
        structure: createValidStructure(),
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
    }),
    getProfileSyncMetrics: vi.fn().mockResolvedValue({
      bikePowerEfforts: [],
      ftpMetrics: [
        {
          observedAt: "2026-03-01T12:00:00.000Z",
          source: "provider",
          value: 250,
        },
      ],
      maxHr: 190,
      thresholdHr: 170,
    }),
    getRouteForSync: vi.fn().mockResolvedValue(null),
    getEventResourceLink: vi.fn().mockResolvedValue(null),
    listEventResourceLinks: vi.fn().mockResolvedValue([]),
    updateEventResourceLink: vi.fn().mockResolvedValue(undefined),
    updateWahooIntegrationTokens: vi.fn().mockResolvedValue(undefined),
  };
}

function createClientMock() {
  return {
    createPlan: vi.fn().mockResolvedValue({ id: 42 }),
    createRoute: vi.fn().mockResolvedValue({ id: 41 }),
    createWorkout: vi.fn().mockResolvedValue({ id: 43 }),
    deletePlan: vi.fn().mockResolvedValue({ success: true }),
    deleteWorkout: vi.fn().mockResolvedValue(undefined),
    getPlans: vi.fn().mockResolvedValue([]),
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
    validateRouteForWahooMock.mockReset();
    validateRouteForWahooMock.mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
    });
    extractStartCoordinatesMock.mockReset();
    extractStartCoordinatesMock.mockReturnValue({
      latitude: 35.1,
      longitude: -80.8,
    });
    prepareGPXForWahooMock.mockReset();
    prepareGPXForWahooMock.mockReturnValue("encoded-gpx");
    getWorkoutTypeFamilyForRouteMock.mockReset();
    getWorkoutTypeFamilyForRouteMock.mockReturnValue(0);
    createWahooClientMock.mockReset();
    refreshWahooAccessTokenMock.mockReset();
    refreshWahooAccessTokenMock.mockResolvedValue({
      accessToken: "fresh-access-token",
      expiresAt: "2026-04-03T14:00:00.000Z",
      refreshToken: "fresh-refresh-token",
    });

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not expose a stale direct FTP as an outbound calibration", () => {
    expect(
      resolveWahooSyncMetrics(
        {
          bikePowerEfforts: [],
          ftpMetrics: [
            {
              observedAt: "2025-01-01T00:00:00.000Z",
              source: "provider",
              value: 250,
            },
          ],
          maxHr: 190,
          thresholdHr: 170,
        },
        "bike",
      ),
    ).toMatchObject({ ftp: null });
  });

  it("uses a fresh observed 20-minute bike power effort for FTP conversion", async () => {
    const repository = createRepositoryMock();
    repository.getProfileSyncMetrics.mockResolvedValueOnce({
      bikePowerEfforts: [
        {
          observationKind: "actual",
          observedAt: "2026-04-02T12:00:00.000Z",
          value: 300,
          evidence: "imported_activity_stream",
        },
      ],
      ftpMetrics: [
        {
          observedAt: "2026-04-03T10:00:00.000Z",
          source: "manual",
          value: 250,
        },
      ],
      maxHr: 190,
      thresholdHr: 170,
    });
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "created",
    });

    expect(convertToWahooPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({ segments: expect.any(Array) }),
      expect.objectContaining({ ftp: 285, max_hr: 190, threshold_hr: 170 }),
    );
  });

  it("supersedes a stale queued projection before provider mutation", async () => {
    const repository = createRepositoryMock();
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValue(wahooClient);
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(
      service.syncEvent("event-1", "profile-1", { expectedProjectionHash: "stale-hash" }),
    ).resolves.toMatchObject({
      success: true,
      action: "no_change",
      terminalOutcome: "superseded",
    });
    expect(createWahooClientMock).not.toHaveBeenCalled();
    expect(wahooClient.createPlan).not.toHaveBeenCalled();
    expect(wahooClient.createWorkout).not.toHaveBeenCalled();
  });

  it("does not recreate an absolute-watts workout when an irrelevant max-HR anchor changes", async () => {
    const repository = createRepositoryMock();
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValue(wahooClient);
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "created",
    });
    const persistedMetadata =
      repository.createEventResourceLink.mock.calls[0]?.[0]?.providerMetadata;
    expect(persistedMetadata?.wahoo?.projectionHash).toEqual(expect.any(String));

    repository.getEventResourceLink.mockResolvedValue({
      externalId: "43",
      id: "sync-1",
      providerMetadata: persistedMetadata,
      updatedAt: "2026-04-03T12:00:00.000Z",
    });
    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "updated",
    });
    expect(wahooClient.createPlan).toHaveBeenCalledTimes(1);

    repository.getProfileSyncMetrics.mockResolvedValue({
      bikePowerEfforts: [],
      ftpMetrics: [{ observedAt: "2026-03-01T12:00:00.000Z", source: "provider", value: 250 }],
      maxHr: 191,
      thresholdHr: 170,
    });
    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "updated",
    });
    expect(wahooClient.createPlan).toHaveBeenCalledTimes(1);
  });

  it("recreates a relative-HR workout when its selected threshold anchor changes", async () => {
    const repository = createRepositoryMock();
    const planned = await repository.getPlannedEventForSync();
    repository.getPlannedEventForSync.mockResolvedValue({
      ...planned!,
      activityPlan: {
        ...planned!.activityPlan!,
        structure: createValidStructure([{ type: "%ThresholdHR", intensity: 85 }]),
      },
    });
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValue(wahooClient);
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "created",
    });
    const persistedMetadata =
      repository.createEventResourceLink.mock.calls[0]?.[0]?.providerMetadata;
    repository.getEventResourceLink.mockResolvedValue({
      externalId: "43",
      id: "sync-1",
      providerMetadata: persistedMetadata,
      updatedAt: "2026-04-03T12:00:00.000Z",
    });
    repository.getProfileSyncMetrics.mockResolvedValue({
      bikePowerEfforts: [],
      ftpMetrics: [{ observedAt: "2026-03-01T12:00:00.000Z", source: "provider", value: 250 }],
      maxHr: 190,
      thresholdHr: 171,
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "recreated",
    });
    expect(wahooClient.createPlan).toHaveBeenCalledTimes(2);
    expect(repository.updateEventResourceLink).toHaveBeenLastCalledWith(
      expect.objectContaining({
        providerMetadata: {
          wahoo: expect.objectContaining({
            projectionHash: expect.not.stringMatching(
              persistedMetadata?.wahoo?.projectionHash ?? "",
            ),
          }),
        },
      }),
    );
  });

  it("uses the activity sport LTHR before a generic or different-sport value", async () => {
    const repository = createRepositoryMock();
    repository.getProfileSyncMetrics.mockResolvedValueOnce({
      bikePowerEfforts: [],
      ftpMetrics: [],
      maxHr: 190,
      thresholdHr: 160,
      thresholdHrBySport: { bike: 155, run: 172 },
    });
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
    });

    expect(convertToWahooPlanMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ threshold_hr: 155 }),
    );
  });

  it("uses an eligible direct profile FTP when observed effort is unavailable", async () => {
    const repository = createRepositoryMock();
    repository.getProfileSyncMetrics.mockResolvedValueOnce({
      bikePowerEfforts: [
        {
          observationKind: "derived",
          observedAt: "2026-04-02T12:00:00.000Z",
          value: 300,
        },
      ],
      ftpMetrics: [
        {
          observedAt: "2026-04-03T10:00:00.000Z",
          source: "provider",
          value: 250,
        },
      ],
      maxHr: 190,
      thresholdHr: 170,
    });
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "created",
    });

    expect(convertToWahooPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({ segments: expect.any(Array) }),
      expect.objectContaining({ ftp: 250 }),
    );
  });

  it("does not send a stale direct FTP to Wahoo", async () => {
    const repository = createRepositoryMock();
    repository.getProfileSyncMetrics.mockResolvedValueOnce({
      bikePowerEfforts: [],
      ftpMetrics: [
        {
          observedAt: "2025-12-01T10:00:00.000Z",
          source: "provider",
          value: 250,
        },
      ],
      maxHr: 190,
      thresholdHr: 170,
    });
    createWahooClientMock.mockReturnValueOnce(createClientMock());
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
    });
    expect(convertToWahooPlanMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ftp: undefined }),
    );
  });

  it("uses real compatibility validation to classify a missing target metric", async () => {
    const repository = createRepositoryMock();
    repository.getProfileSyncMetrics.mockResolvedValueOnce({
      bikePowerEfforts: [],
      ftpMetrics: [],
      maxHr: null,
      thresholdHr: null,
    });
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      id: "event-1",
      startsAt: "2026-04-05T09:00:00.000Z",
      activityPlan: {
        activityCategory: "bike",
        description: "FTP workout",
        id: "plan-1",
        name: "Threshold Ride",
        routeId: null,
        structure: createValidStructure([{ type: "%FTP", intensity: 100 }]),
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
    });
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: false,
      action: "no_change",
      error: "%FTP targets require an FTP anchor.",
      failureCode: "missing_metric",
      failureCategory: "eligibility",
      retryable: false,
    });
    expect(wahooClient.createPlan).not.toHaveBeenCalled();
  });

  it("uses real compatibility validation to classify an unsupported RPE target", async () => {
    const repository = createRepositoryMock();
    const planned = await repository.getPlannedEventForSync();
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      ...planned!,
      activityPlan: {
        ...planned!.activityPlan!,
        structure: createValidStructure([{ type: "RPE", intensity: 3 }]),
      },
    });
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: false,
      action: "no_change",
      failureCode: "unsupported_target",
      failureCategory: "eligibility",
      retryable: false,
    });
    expect(wahooClient.createPlan).not.toHaveBeenCalled();
  });

  it("keeps an unknown converter exception retryable", async () => {
    const repository = createRepositoryMock();
    createWahooClientMock.mockReturnValueOnce(createClientMock());
    convertToWahooPlanMock.mockImplementationOnce(() => {
      throw new Error("Unexpected converter failure");
    });
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: false,
      failureCode: "provider_failure",
      failureCategory: "provider",
      retryable: true,
    });
  });

  it("classifies a malformed persisted structured plan as invalid_plan", async () => {
    const repository = createRepositoryMock();
    const planned = await repository.getPlannedEventForSync();
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      ...planned!,
      activityPlan: {
        ...planned!.activityPlan!,
        structure: { intervals: "not-an-array", version: 2 },
      },
    });
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: false,
      failureCode: "invalid_plan",
      failureCategory: "eligibility",
      retryable: false,
    });
    expect(createWahooClientMock).not.toHaveBeenCalled();
  });

  it.each([
    { version: 2, intervals: "not-an-array" },
    { version: 1, intervals: [] },
    { version: 2, intervals: [], unexpected: true },
  ])("classifies a malformed route-bearing plan as invalid_plan: %j", async (structure) => {
    const repository = createRepositoryMock();
    const planned = await repository.getPlannedEventForSync();
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      ...planned!,
      activityPlan: {
        ...planned!.activityPlan!,
        routeId: "route-1",
        structure,
      },
    });
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: false,
      failureCode: "invalid_plan",
      failureCategory: "eligibility",
      retryable: false,
    });
    expect(repository.getRouteForSync).not.toHaveBeenCalled();
    expect(createWahooClientMock).not.toHaveBeenCalled();
  });

  it("classifies a missing explicit route as invalid_plan", async () => {
    const repository = createRepositoryMock();
    const planned = await repository.getPlannedEventForSync();
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      ...planned!,
      activityPlan: { ...planned!.activityPlan!, routeId: "route-missing" },
    });
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: false,
      failureCode: "invalid_plan",
      failureCategory: "eligibility",
      retryable: false,
    });
    expect(createWahooClientMock).not.toHaveBeenCalled();
    expect(repository.createEventResourceLink).not.toHaveBeenCalled();
  });

  it("keeps a route storage download exception retryable", async () => {
    const repository = createRepositoryMock();
    const planned = await repository.getPlannedEventForSync();
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      ...planned!,
      activityPlan: { ...planned!.activityPlan!, routeId: "route-1" },
    });
    repository.getRouteForSync.mockResolvedValueOnce({
      description: null,
      filePath: "routes/route-1.gpx",
      id: "route-1",
      name: "Route One",
      totalAscent: 10,
      totalDescent: 10,
      totalDistance: 1000,
    });
    const storageFailure = new Error("Route storage temporarily unavailable");
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn().mockRejectedValue(storageFailure) },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: false,
      error: storageFailure.message,
      failureCode: "provider_failure",
      failureCategory: "provider",
      retryable: true,
    });
    expect(createWahooClientMock).not.toHaveBeenCalled();
  });

  it("keeps an explicit route upload failure retryable", async () => {
    const repository = createRepositoryMock();
    const planned = await repository.getPlannedEventForSync();
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      ...planned!,
      activityPlan: { ...planned!.activityPlan!, routeId: "route-1" },
    });
    repository.getRouteForSync.mockResolvedValueOnce({
      description: null,
      filePath: "routes/route-1.gpx",
      id: "route-1",
      name: "Route One",
      totalAscent: 10,
      totalDescent: 10,
      totalDistance: 1000,
    });
    const wahooClient = createClientMock();
    wahooClient.createRoute.mockRejectedValueOnce(new Error("Wahoo unavailable"));
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn().mockResolvedValue("<gpx />") },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: false,
      failureCode: "provider_failure",
      failureCategory: "provider",
      retryable: true,
    });
    expect(wahooClient.createPlan).not.toHaveBeenCalled();
    expect(repository.createEventResourceLink).not.toHaveBeenCalled();
  });

  it("accepts zero-valued finite route coordinates", async () => {
    const repository = createRepositoryMock();
    const planned = await repository.getPlannedEventForSync();
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      ...planned!,
      activityPlan: { ...planned!.activityPlan!, routeId: "route-1" },
    });
    repository.getRouteForSync.mockResolvedValueOnce({
      description: null,
      filePath: "routes/equator.gpx",
      id: "route-1",
      name: "Equator Route",
      totalAscent: 0,
      totalDescent: 0,
      totalDistance: 1000,
    });
    extractStartCoordinatesMock.mockReturnValueOnce({
      latitude: 0,
      longitude: 0,
    });
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn().mockResolvedValue("<gpx />") },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "created",
    });
    expect(wahooClient.createRoute).toHaveBeenCalledWith(
      expect.objectContaining({ startLat: 0, startLng: 0 }),
    );
  });

  it("creates a new sync with route data when no prior sync exists", async () => {
    const repository = createRepositoryMock();
    repository.getRouteForSync.mockResolvedValueOnce({
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
        activityCategory: "bike",
        description: "Endurance with route",
        id: "plan-1",
        name: "Long Ride",
        routeId: "route-1",
        structure: createValidStructure(),
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
    });
    validateRouteForWahooMock.mockReturnValueOnce({
      valid: true,
      errors: [],
      warnings: ["Route is very short (less than 100 meters)"],
    });
    const storage = {
      downloadRouteGpx: vi.fn().mockResolvedValue("<gpx></gpx>"),
    };
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
    expect(wahooClient.getPlans).toHaveBeenCalledWith("plan-1");
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
      providerMetadata: {
        wahoo: {
          planId: 42,
          projectionHash: expect.any(String),
          routeId: 41,
          sourcePlanId: "plan-1",
          sourceRouteId: "route-1",
        },
      },
      syncedAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
    });
  });

  it("rejects legacy route-only V2 plans before remote mutation", async () => {
    const repository = createRepositoryMock();
    repository.getRouteForSync.mockResolvedValueOnce({
      description: "Park loop",
      filePath: "routes/park-loop.gpx",
      id: "route-1",
      name: "Park Loop",
      totalAscent: 120,
      totalDescent: 115,
      totalDistance: 10420,
    });
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      id: "event-1",
      startsAt: "2026-04-05T09:00:00.000Z",
      activityPlan: {
        activityCategory: "run",
        description: "Run this route",
        id: "plan-1",
        name: "Park Run",
        routeId: "route-1",
        structure: { version: 2, intervals: [] },
        updatedAt: "2026-04-01T09:00:00.000Z",
      },
    });
    const storage = {
      downloadRouteGpx: vi.fn().mockResolvedValue("<gpx></gpx>"),
    };
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({ repository, storage });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: false,
      action: "no_change",
      failureCode: "invalid_plan",
      retryable: false,
    });

    expect(wahooClient.createRoute).not.toHaveBeenCalled();
    expect(convertToWahooPlanMock).not.toHaveBeenCalled();
    expect(wahooClient.getPlans).not.toHaveBeenCalled();
    expect(wahooClient.createPlan).not.toHaveBeenCalled();
    expect(wahooClient.createWorkout).not.toHaveBeenCalled();
    expect(repository.createEventResourceLink).not.toHaveBeenCalled();
  });

  it("updates workout metadata only when the synced structure is not older", async () => {
    const repository = createRepositoryMock();
    repository.getEventResourceLink.mockResolvedValueOnce({
      externalId: "workout-77",
      id: "sync-1",
      providerMetadata: {
        wahoo: {
          projectionHash: currentProjectionHash(),
          sourcePlanId: "plan-1",
          sourceRouteId: null,
        },
      },
      updatedAt: "2026-04-02T09:00:00.000Z",
    });
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      id: "event-1",
      startsAt: "2026-04-06T07:30:00.000Z",
      activityPlan: {
        activityCategory: "bike",
        description: "Metadata-only change",
        id: "plan-1",
        name: "Updated Workout Name",
        routeId: null,
        structure: createValidStructure(),
        updatedAt: "2026-04-01T09:00:00.000Z",
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

  it("refreshes expired Wahoo tokens before publishing planned workouts", async () => {
    const repository = createRepositoryMock();
    repository.findWahooIntegrationByProfileId.mockResolvedValueOnce({
      accessToken: "expired-access-token",
      expiresAt: "2026-04-03T11:59:00.000Z",
      externalId: "wahoo-user-1",
      id: "integration-1",
      profileId: "profile-1",
      refreshToken: "refresh-token",
    });
    const storage = { downloadRouteGpx: vi.fn() };
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({ repository, storage });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "created",
    });

    expect(refreshWahooAccessTokenMock).toHaveBeenCalledWith("refresh-token");
    expect(repository.updateWahooIntegrationTokens).toHaveBeenCalledWith({
      accessToken: "fresh-access-token",
      expiresAt: "2026-04-03T14:00:00.000Z",
      id: "integration-1",
      refreshToken: "fresh-refresh-token",
    });
    expect(createWahooClientMock).toHaveBeenCalledWith({
      accessToken: "fresh-access-token",
      refreshToken: "fresh-refresh-token",
    });
  });

  it("deletes stale Wahoo plans with the same external id before creating a replacement", async () => {
    const repository = createRepositoryMock();
    const storage = { downloadRouteGpx: vi.fn() };
    const wahooClient = createClientMock();
    wahooClient.getPlans.mockResolvedValueOnce([{ id: 123 }, { id: 456 }]);
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({ repository, storage });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "created",
    });

    expect(wahooClient.getPlans).toHaveBeenCalledWith("plan-1");
    expect(wahooClient.deletePlan).toHaveBeenCalledWith(123);
    expect(wahooClient.deletePlan).toHaveBeenCalledWith(456);
    expect(wahooClient.createPlan).toHaveBeenCalled();
  });

  it("does not call Wahoo when an unsync job has no captured or persisted link", async () => {
    const repository = createRepositoryMock();
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({ repository, storage: { downloadRouteGpx: vi.fn() } });

    await expect(service.unsyncEvent("event-1", "profile-1")).resolves.toMatchObject({
      failureCode: "missing_event",
      success: false,
    });

    expect(wahooClient.deleteWorkout).not.toHaveBeenCalled();
    expect(repository.findWahooIntegrationByProfileId).not.toHaveBeenCalled();
  });

  it("prefers the newer persisted link over a stale captured unsync target", async () => {
    const repository = createRepositoryMock();
    repository.getEventResourceLink.mockResolvedValueOnce({
      externalId: "workout-new",
      id: "link-new",
      updatedAt: "2026-04-03T12:00:00.000Z",
    });
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({ repository, storage: { downloadRouteGpx: vi.fn() } });

    await expect(
      service.unsyncEvent("event-1", "profile-1", {
        externalId: "workout-stale",
        resourceLinkId: "link-stale",
      }),
    ).resolves.toMatchObject({ success: true });

    expect(repository.getEventResourceLink).toHaveBeenCalledWith({
      eventId: "event-1",
      profileId: "profile-1",
      provider: "wahoo",
    });
    expect(wahooClient.deleteWorkout).toHaveBeenCalledWith("workout-new");
    expect(wahooClient.deleteWorkout).not.toHaveBeenCalledWith("workout-stale");
    expect(repository.deleteEventResourceLink).toHaveBeenCalledWith("link-new");
  });

  it("deletes a captured Wahoo target after its event and link have already been removed", async () => {
    const repository = createRepositoryMock();
    const wahooClient = createClientMock();
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({ repository, storage: { downloadRouteGpx: vi.fn() } });

    await expect(
      service.unsyncEvent("deleted-event", "profile-1", {
        externalId: "workout-77",
        resourceLinkId: "deleted-link",
      }),
    ).resolves.toMatchObject({ success: true });

    expect(repository.getEventResourceLink).toHaveBeenCalledWith({
      eventId: "deleted-event",
      profileId: "profile-1",
      provider: "wahoo",
    });
    expect(wahooClient.deleteWorkout).toHaveBeenCalledWith("workout-77");
    expect(repository.deleteEventResourceLink).toHaveBeenCalledWith("deleted-link");
  });

  it("recreates the Wahoo workout when the activity plan structure is newer", async () => {
    const repository = createRepositoryMock();
    repository.getEventResourceLink.mockResolvedValueOnce({
      externalId: "workout-77",
      id: "sync-1",
      providerMetadata: {
        wahoo: { planId: 55, sourcePlanId: "plan-1", sourceRouteId: null },
      },
      updatedAt: "2026-04-01T09:00:00.000Z",
    });
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      id: "event-1",
      startsAt: "2026-04-06T07:30:00.000Z",
      activityPlan: {
        activityCategory: "bike",
        description: "Structure changed",
        id: "plan-1",
        name: "Rebuilt Workout",
        routeId: null,
        structure: createValidStructure(),
        updatedAt: "2026-04-03T09:00:00.000Z",
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
    expect(wahooClient.deletePlan).toHaveBeenCalledWith(55);
    expect(wahooClient.createWorkout).toHaveBeenCalledWith({
      planId: 88,
      name: "Rebuilt Workout",
      scheduledDate: "2026-04-06T07:30:00.000Z",
      externalId: "event-1",
      routeId: undefined,
      workoutTypeId: 12,
      durationMinutes: 62,
    });
    expect(wahooClient.deleteWorkout).toHaveBeenCalledWith("workout-77");
    expect(repository.updateEventResourceLink).toHaveBeenCalledWith({
      id: "sync-1",
      externalId: "99",
      providerMetadata: {
        wahoo: {
          planId: 88,
          projectionHash: expect.any(String),
          routeId: undefined,
          sourcePlanId: "plan-1",
        },
      },
      updatedAt: "2026-04-03T12:00:00.000Z",
    });
  });

  it("recreates the Wahoo workout when the event selects a different activity plan", async () => {
    const repository = createRepositoryMock();
    const planned = await repository.getPlannedEventForSync();
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      ...planned!,
      activityPlan: { ...planned!.activityPlan!, id: "plan-2" },
    });
    repository.getEventResourceLink.mockResolvedValueOnce({
      externalId: "workout-77",
      id: "sync-1",
      providerMetadata: {
        wahoo: { planId: 55, sourcePlanId: "plan-1", sourceRouteId: null },
      },
      updatedAt: "2026-04-02T09:00:00.000Z",
    });
    const wahooClient = createClientMock();
    wahooClient.createPlan.mockResolvedValueOnce({ id: 88 });
    wahooClient.createWorkout.mockResolvedValueOnce({ id: 99 });
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "recreated",
      workoutId: "99",
    });

    expect(wahooClient.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "plan-2" }),
    );
    expect(repository.updateEventResourceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        providerMetadata: {
          wahoo: {
            planId: 88,
            projectionHash: expect.any(String),
            routeId: undefined,
            sourcePlanId: "plan-2",
          },
        },
      }),
    );
  });

  it("uploads and attaches a replacement route when the event route changes", async () => {
    const repository = createRepositoryMock();
    const planned = await repository.getPlannedEventForSync();
    repository.getPlannedEventForSync.mockResolvedValueOnce({
      ...planned!,
      activityPlan: { ...planned!.activityPlan!, routeId: "route-2" },
    });
    repository.getEventResourceLink.mockResolvedValueOnce({
      externalId: "workout-77",
      id: "sync-1",
      providerMetadata: {
        wahoo: {
          planId: 55,
          routeId: 40,
          sourcePlanId: "plan-1",
          sourceRouteId: "route-1",
        },
      },
      updatedAt: "2026-04-02T09:00:00.000Z",
    });
    repository.getRouteForSync.mockResolvedValueOnce({
      description: "Replacement route",
      filePath: "routes/replacement.gpx",
      id: "route-2",
      name: "Replacement",
      totalAscent: 100,
      totalDescent: 90,
      totalDistance: 12000,
    });
    const storage = {
      downloadRouteGpx: vi.fn().mockResolvedValue("<gpx></gpx>"),
    };
    const wahooClient = createClientMock();
    wahooClient.createPlan.mockResolvedValueOnce({ id: 88 });
    wahooClient.createWorkout.mockResolvedValueOnce({ id: 99 });
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({ repository, storage });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "recreated",
    });

    expect(storage.downloadRouteGpx).toHaveBeenCalledWith("routes/replacement.gpx");
    expect(wahooClient.createRoute).toHaveBeenCalled();
    expect(wahooClient.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ routeId: 41, workoutTypeId: 0 }),
    );
    expect(repository.updateEventResourceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        providerMetadata: {
          wahoo: {
            planId: 88,
            projectionHash: expect.any(String),
            routeId: 41,
            sourcePlanId: "plan-1",
            sourceRouteId: "route-2",
          },
        },
      }),
    );
  });

  it("recreates without a route when the event route is cleared", async () => {
    const repository = createRepositoryMock();
    repository.getEventResourceLink.mockResolvedValueOnce({
      externalId: "workout-77",
      id: "sync-1",
      providerMetadata: {
        wahoo: {
          planId: 55,
          routeId: 40,
          sourcePlanId: "plan-1",
          sourceRouteId: "route-1",
        },
      },
      updatedAt: "2026-04-02T09:00:00.000Z",
    });
    const wahooClient = createClientMock();
    wahooClient.createPlan.mockResolvedValueOnce({ id: 88 });
    wahooClient.createWorkout.mockResolvedValueOnce({ id: 99 });
    createWahooClientMock.mockReturnValueOnce(wahooClient);
    const service = new WahooSyncService({
      repository,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: true,
      action: "recreated",
    });

    expect(wahooClient.createRoute).not.toHaveBeenCalled();
    expect(wahooClient.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ routeId: undefined, workoutTypeId: 12 }),
    );
    expect(repository.updateEventResourceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        providerMetadata: {
          wahoo: {
            planId: 88,
            projectionHash: expect.any(String),
            routeId: undefined,
            sourcePlanId: "plan-1",
          },
        },
      }),
    );
  });

  it("keeps the local sync record when remote Wahoo delete fails", async () => {
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

    await expect(service.unsyncEvent("event-1", "profile-1")).resolves.toMatchObject({
      success: false,
      action: "no_change",
      error: "remote unavailable",
    });

    expect(wahooClient.deleteWorkout).toHaveBeenCalledWith("workout-77");
    expect(repository.deleteEventResourceLink).not.toHaveBeenCalled();
  });
});

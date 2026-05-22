import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActivityImporter } from "./activity-importer";
import type { WahooWorkoutSummary } from "./client";

function createSummary(overrides: Partial<WahooWorkoutSummary> = {}): WahooWorkoutSummary {
  return {
    id: 123,
    workout_id: 456,
    started_at: "2026-04-03T10:00:00.000Z",
    created_at: "2026-04-03T11:00:00.000Z",
    updated_at: "2026-04-03T11:05:00.000Z",
    ascent_accum: 789.4,
    cadence_avg: 92.4,
    calories_accum: 654.2,
    distance_accum: 40234.7,
    duration_active_accum: 3501.2,
    duration_total_accum: 3600,
    heart_rate_avg: 148.7,
    power_avg: 212.3,
    power_bike_np_last: 228.4,
    power_bike_tss_last: 87,
    speed_avg: 8.9,
    work_accum: 12345,
    file: {
      url: "https://example.com/workout.fit",
    },
    workout: {
      id: 456,
      name: "Tempo Ride",
      workout_type_id: 12,
    },
    fitness_app_id: 99,
    manual: false,
    edited: false,
    ...overrides,
  };
}

function createRepositoryMock() {
  return {
    createImportedActivity: vi.fn().mockResolvedValue({ id: "activity-1" }),
    findImportedActivityLinkByExternalId: vi.fn().mockResolvedValue(null),
    findLinkedPlannedEventId: vi.fn().mockResolvedValue(null),
    findWahooIntegrationByExternalId: vi
      .fn()
      .mockResolvedValue({ integrationId: "integration-1", profileId: "profile-1" }),
    getEventActivityPlanId: vi.fn().mockResolvedValue(null),
  };
}

describe("activity-importer", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => {
      throw new Error("Unexpected fetch call");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns an error when no Wahoo integration exists", async () => {
    const repository = createRepositoryMock();
    repository.findWahooIntegrationByExternalId.mockResolvedValueOnce(null);
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createActivityImporter({ activityFileStorage, repository });

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: false,
      error: "No integration found for Wahoo user 77",
    });

    expect(repository.findImportedActivityLinkByExternalId).not.toHaveBeenCalled();
    expect(repository.createImportedActivity).not.toHaveBeenCalled();
    expect(activityFileStorage.uploadActivityFile).not.toHaveBeenCalled();
  });

  it("short-circuits duplicate imports before any downstream work", async () => {
    const repository = createRepositoryMock();
    repository.findImportedActivityLinkByExternalId.mockResolvedValueOnce({
      activityId: "existing-activity",
      linkId: "link-1",
    });
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createActivityImporter({ activityFileStorage, repository });

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: true,
      skipped: true,
      reason: "Activity already imported",
      activityId: "existing-activity",
    });

    expect(repository.findImportedActivityLinkByExternalId).toHaveBeenCalledWith({
      externalId: "123",
      integrationId: "integration-1",
    });
    expect(repository.findLinkedPlannedEventId).not.toHaveBeenCalled();
    expect(repository.createImportedActivity).not.toHaveBeenCalled();
    expect(activityFileStorage.uploadActivityFile).not.toHaveBeenCalled();
  });

  it("imports a linked planned activity and stores the provider activity file when available", async () => {
    const repository = createRepositoryMock();
    repository.findLinkedPlannedEventId.mockResolvedValueOnce("event-1");
    repository.getEventActivityPlanId.mockResolvedValueOnce("plan-1");
    repository.createImportedActivity.mockResolvedValueOnce({ id: "activity-99" });
    const activityFileStorage = { uploadActivityFile: vi.fn().mockResolvedValue(undefined) };
    const importer = createActivityImporter({ activityFileStorage, repository });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fitBytes.buffer,
    } as Response);

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: true,
      activityId: "activity-99",
    });

    expect(repository.findLinkedPlannedEventId).toHaveBeenCalledWith({
      profileId: "profile-1",
      externalWorkoutId: "456",
    });
    expect(activityFileStorage.uploadActivityFile).toHaveBeenCalledWith({
      bytes: fitBytes,
      contentType: "application/octet-stream",
      path: "activities/profile-1/providers/wahoo/123.fit",
    });
    expect(repository.createImportedActivity).toHaveBeenCalledWith({
      integrationId: "integration-1",
      profileId: "profile-1",
      provider: "wahoo",
      externalId: "123",
      providerUpdatedAt: "2026-04-03T11:05:00.000Z",
      activityPlanId: "plan-1",
      startedAt: "2026-04-03T10:00:00.000Z",
      finishedAt: "2026-04-03T11:00:00.000Z",
      type: "bike",
      name: "bike Activity",
      distanceMeters: 40235,
      durationSeconds: 3600,
      movingSeconds: 3501,
      elevationGainMeters: 789,
      calories: 654,
      avgPower: 212.3,
      normalizedPower: 228.4,
      avgHeartRate: 149,
      avgCadence: 92,
      avgSpeedMps: 8.9,
      activityFilePath: "activities/profile-1/providers/wahoo/123.fit",
      activityFileSize: fitBytes.byteLength,
      polyline: null,
    });
  });

  it("prefers FIT-derived metrics over Wahoo summary metadata and stores a preview polyline", async () => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn().mockResolvedValue(undefined) };
    const activityFileParser = vi.fn().mockReturnValue({
      metadata: {
        startTime: new Date("2026-04-03T09:30:00.000Z"),
        type: "cycling",
      },
      summary: {
        totalTime: 3300,
        totalDistance: 38999.4,
        totalAscent: 456.2,
        calories: 600.2,
        avgPower: 199.6,
        avgHeartRate: 141.4,
        avgCadence: 88.6,
        avgSpeed: 11.8,
      },
      records: [
        {
          timestamp: new Date("2026-04-03T09:30:00.000Z"),
          positionLat: 40,
          positionLong: -75,
        },
        {
          timestamp: new Date("2026-04-03T09:31:00.000Z"),
          positionLat: 40.001,
          positionLong: -75.001,
        },
      ],
      laps: [],
      lengths: [],
    });
    const importer = createActivityImporter({
      activityFileStorage,
      activityFileParser,
      repository,
    });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fitBytes.buffer,
    } as Response);

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toMatchObject({
      success: true,
    });

    expect(activityFileParser).toHaveBeenCalledWith({
      bytes: fitBytes,
      fileName: "activities/profile-1/providers/wahoo/123.fit",
    });
    expect(repository.createImportedActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAt: "2026-04-03T09:30:00.000Z",
        finishedAt: "2026-04-03T10:25:00.000Z",
        type: "bike",
        name: "bike Activity",
        distanceMeters: 38999,
        durationSeconds: 3300,
        movingSeconds: 3300,
        elevationGainMeters: 456,
        calories: 600,
        avgPower: 199.6,
        avgHeartRate: 141,
        avgCadence: 89,
        avgSpeedMps: 11.8,
        polyline: expect.any(String),
      }),
    );
  });

  it("fails safely when FIT upload fails", async () => {
    const repository = createRepositoryMock();
    const activityFileStorage = {
      uploadActivityFile: vi.fn().mockRejectedValue(new Error("storage offline")),
    };
    const importer = createActivityImporter({ activityFileStorage, repository });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fitBytes.buffer,
    } as Response);

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: false,
      error: "Failed to fetch/store Wahoo FIT file for summary 123",
    });

    expect(repository.createImportedActivity).not.toHaveBeenCalled();
  });

  it.each([
    { label: "unknown workout type", workout: { id: 456, workout_type_id: 999 } },
    { label: "missing workout type", workout: { id: 456 } },
  ])("falls back to other for $label", async ({ workout }) => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createActivityImporter({ activityFileStorage, repository });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fitBytes.buffer,
    } as Response);

    await expect(
      importer.importWorkoutSummary(
        77,
        createSummary({
          workout,
        }),
      ),
    ).resolves.toMatchObject({ success: true });

    expect(repository.createImportedActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "other",
        name: "other Activity",
      }),
    );
  });

  it("uses a deterministic fallback start time when started_at is missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createActivityImporter({ activityFileStorage, repository });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fitBytes.buffer,
    } as Response);

    await expect(
      importer.importWorkoutSummary(
        77,
        createSummary({
          started_at: undefined,
          duration_total_accum: 900,
        }),
      ),
    ).resolves.toMatchObject({ success: true });

    expect(repository.createImportedActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAt: "2026-04-03T11:45:00.000Z",
        finishedAt: "2026-04-03T12:00:00.000Z",
      }),
    );
  });
});

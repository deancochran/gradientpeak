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
    findImportedActivityByExternalId: vi.fn().mockResolvedValue(null),
    findLinkedPlannedEventId: vi.fn().mockResolvedValue(null),
    findWahooIntegrationByExternalId: vi.fn().mockResolvedValue({ profileId: "profile-1" }),
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
    const fitFileStorage = { uploadFitFile: vi.fn() };
    const importer = createActivityImporter({ fitFileStorage, repository });

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: false,
      error: "No integration found for Wahoo user 77",
    });

    expect(repository.findImportedActivityByExternalId).not.toHaveBeenCalled();
    expect(repository.createImportedActivity).not.toHaveBeenCalled();
    expect(fitFileStorage.uploadFitFile).not.toHaveBeenCalled();
  });

  it("short-circuits duplicate imports before any downstream work", async () => {
    const repository = createRepositoryMock();
    repository.findImportedActivityByExternalId.mockResolvedValueOnce({ id: "existing-activity" });
    const fitFileStorage = { uploadFitFile: vi.fn() };
    const importer = createActivityImporter({ fitFileStorage, repository });

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: true,
      skipped: true,
      reason: "Activity already imported",
      activityId: "existing-activity",
    });

    expect(repository.findLinkedPlannedEventId).not.toHaveBeenCalled();
    expect(repository.createImportedActivity).not.toHaveBeenCalled();
    expect(fitFileStorage.uploadFitFile).not.toHaveBeenCalled();
  });

  it("imports a linked planned activity and stores the FIT file when available", async () => {
    const repository = createRepositoryMock();
    repository.findLinkedPlannedEventId.mockResolvedValueOnce("event-1");
    repository.getEventActivityPlanId.mockResolvedValueOnce("plan-1");
    repository.createImportedActivity.mockResolvedValueOnce({ id: "activity-99" });
    const fitFileStorage = { uploadFitFile: vi.fn().mockResolvedValue(undefined) };
    const importer = createActivityImporter({ fitFileStorage, repository });
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
    expect(fitFileStorage.uploadFitFile).toHaveBeenCalledWith({
      bytes: fitBytes,
      contentType: "application/octet-stream",
      path: "profile-1/wahoo-123.fit",
    });
    expect(repository.createImportedActivity).toHaveBeenCalledWith({
      profileId: "profile-1",
      provider: "wahoo",
      externalId: "123",
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
      fitFilePath: "profile-1/wahoo-123.fit",
      fitFileSize: fitBytes.byteLength,
    });
  });

  it("imports successfully even when FIT upload fails", async () => {
    const repository = createRepositoryMock();
    const fitFileStorage = {
      uploadFitFile: vi.fn().mockRejectedValue(new Error("storage offline")),
    };
    const importer = createActivityImporter({ fitFileStorage, repository });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fitBytes.buffer,
    } as Response);

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toMatchObject({
      success: true,
      activityId: "activity-1",
    });

    expect(repository.createImportedActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        fitFilePath: null,
        fitFileSize: null,
      }),
    );
  });

  it.each([
    { label: "unknown workout type", workout: { id: 456, workout_type_id: 999 } },
    { label: "missing workout type", workout: { id: 456 } },
  ])("falls back to other for $label", async ({ workout }) => {
    const repository = createRepositoryMock();
    const fitFileStorage = { uploadFitFile: vi.fn() };
    const importer = createActivityImporter({ fitFileStorage, repository });

    await expect(
      importer.importWorkoutSummary(
        77,
        createSummary({
          file: undefined as never,
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
    const fitFileStorage = { uploadFitFile: vi.fn() };
    const importer = createActivityImporter({ fitFileStorage, repository });

    await expect(
      importer.importWorkoutSummary(
        77,
        createSummary({
          started_at: undefined,
          duration_total_accum: 900,
          file: undefined as never,
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

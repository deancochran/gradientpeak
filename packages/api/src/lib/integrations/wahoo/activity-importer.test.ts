import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MATERIALIZER_VERSION } from "../../../application/activities/submit-activity";
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
      url: "https://cdn.wahooligan.com/workout.fit",
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

function activityFileResponse(bytes: Uint8Array, headers?: HeadersInit): Response {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, { headers, status: 200 });
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function createRepositoryMock() {
  return {
    submitActivity: vi.fn().mockResolvedValue({ id: "activity-1" }),
    createImportedActivityResourceLink: vi.fn().mockResolvedValue(undefined),
    findImportedActivityByProviderExternalId: vi.fn().mockResolvedValue(null),
    findImportedActivityLinkByExternalId: vi.fn().mockResolvedValue(null),
    findLinkedPlannedEventId: vi.fn().mockResolvedValue(null),
    findWahooIntegrationByExternalId: vi.fn().mockResolvedValue({
      integrationGeneration: 1,
      integrationId: "integration-1",
      profileId: "profile-1",
    }),
    getEventActivityPlanId: vi.fn().mockResolvedValue(null),
  };
}

const defaultActivityFileParser = vi.fn().mockReturnValue({
  metadata: {
    startTime: new Date("2026-04-03T10:00:00.000Z"),
    type: "cycling",
  },
  summary: {
    totalTime: 3600,
    totalDistance: 40234.7,
    totalAscent: 789.4,
    calories: 654.2,
    avgHeartRate: 148.7,
    avgPower: 212.3,
    avgCadence: 92.4,
    avgSpeed: 8.9,
  },
  records: [],
  laps: [],
  lengths: [],
});

function createTestImporter(
  deps: Omit<Parameters<typeof createActivityImporter>[0], "generationGuard" | "stagingCleanup"> &
    Partial<
      Pick<Parameters<typeof createActivityImporter>[0], "generationGuard" | "stagingCleanup">
    >,
) {
  const stagingCleanup = deps.stagingCleanup ?? {
    reserve: vi
      .fn()
      .mockImplementation(({ integrationGeneration, integrationId, profileId, summaryId }) =>
        Promise.resolve({
          path: `activities/${profileId}/providers/wahoo/staging/${integrationId}/${integrationGeneration}/${summaryId}/11111111-1111-4111-8111-111111111111.fit`,
          recordOutcome: vi.fn().mockResolvedValue(true),
        }),
      ),
  };
  const importer = createActivityImporter({
    ...deps,
    activityFileParser: deps.activityFileParser ?? defaultActivityFileParser,
    generationGuard: deps.generationGuard ?? vi.fn().mockResolvedValue(undefined),
    stagingCleanup,
    submitActivity: deps.submitActivity,
  });
  return {
    importWorkoutSummary(
      wahooUserId: number,
      summary: WahooWorkoutSummary,
      options = { integrationGeneration: 1, integrationId: "integration-1" },
    ) {
      return importer.importWorkoutSummary(wahooUserId, summary, options);
    },
  };
}

describe("activity-importer", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    defaultActivityFileParser.mockClear();
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
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: false,
      error: "Wahoo integration is unavailable",
    });

    expect(repository.findImportedActivityLinkByExternalId).not.toHaveBeenCalled();
    expect(repository.submitActivity).not.toHaveBeenCalled();
    expect(activityFileStorage.uploadActivityFile).not.toHaveBeenCalled();
  });

  it("skips only after confirming an unchanged provider revision and artifact", async () => {
    const repository = createRepositoryMock();
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    repository.findImportedActivityLinkByExternalId.mockResolvedValueOnce({
      activityId: "existing-activity",
      linkId: "link-1",
      profileId: "profile-1",
      activityFilePath: "activities/profile-1/providers/wahoo/123.fit",
      activityFileSize: fitBytes.byteLength,
      artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      artifactSha256: sha256(fitBytes),
      providerRevision: "2026-04-03T11:05:00.000Z",
      analysisReady: true,
      materializerVersion: MATERIALIZER_VERSION,
      segmentsRevision: 1,
      timingCoverage: "complete",
      hasSwimSegment: false,
    });
    const activityFileStorage = { uploadActivityFile: vi.fn().mockResolvedValue(undefined) };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(activityFileResponse(fitBytes));

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
    expect(repository.findImportedActivityByProviderExternalId).toHaveBeenCalledWith({
      externalId: "123",
      provider: "wahoo",
    });
    expect(repository.findLinkedPlannedEventId).toHaveBeenCalledWith({
      externalWorkoutId: "456",
      profileId: "profile-1",
    });
    expect(repository.submitActivity).not.toHaveBeenCalled();
    expect(activityFileStorage.uploadActivityFile).toHaveBeenCalledOnce();
  });

  it("routes a changed artifact at the same revision through atomic reconciliation", async () => {
    const repository = createRepositoryMock();
    const incomingBytes = new TextEncoder().encode("changed-fit-binary-data");
    repository.findImportedActivityLinkByExternalId.mockResolvedValueOnce({
      activityId: "existing-activity",
      linkId: "link-1",
      profileId: "profile-1",
      activityFilePath: "artifacts/sha256/profile-1/old",
      activityFileSize: 15,
      artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      artifactSha256: sha256(new TextEncoder().encode("fit-binary-data")),
      providerRevision: "2026-04-03T11:05:00.000Z",
      analysisReady: true,
      materializerVersion: MATERIALIZER_VERSION,
      segmentsRevision: 1,
      timingCoverage: "complete",
      hasSwimSegment: false,
    });
    repository.submitActivity.mockRejectedValueOnce(
      new Error("Provider payload digest conflicts with the current provider revision"),
    );
    const activityFileParser = vi.fn(defaultActivityFileParser);
    const importer = createTestImporter({
      activityFileParser,
      activityFileStorage: { uploadActivityFile: vi.fn().mockResolvedValue(undefined) },
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(activityFileResponse(incomingBytes));

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: false,
      error: "Wahoo activity persistence failed",
    });
    expect(activityFileParser).toHaveBeenCalledOnce();
    expect(repository.submitActivity).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "123" }),
      expect.any(Object),
      expect.objectContaining({ artifactSha256: sha256(incomingBytes) }),
    );
  });

  it("routes a newer provider revision with unchanged bytes through atomic reconciliation", async () => {
    const repository = createRepositoryMock();
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    repository.findImportedActivityLinkByExternalId.mockResolvedValueOnce({
      activityId: "existing-activity",
      linkId: "link-1",
      profileId: "profile-1",
      activityFilePath: "artifacts/sha256/profile-1/current",
      activityFileSize: fitBytes.byteLength,
      artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      artifactSha256: sha256(fitBytes),
      providerRevision: "2026-04-03T11:04:00.000Z",
      analysisReady: true,
      materializerVersion: MATERIALIZER_VERSION,
      segmentsRevision: 1,
      timingCoverage: "complete",
      hasSwimSegment: false,
    });
    repository.submitActivity.mockResolvedValueOnce({ id: "existing-activity" });
    const activityFileParser = vi.fn(defaultActivityFileParser);
    const importer = createTestImporter({
      activityFileParser,
      activityFileStorage: { uploadActivityFile: vi.fn().mockResolvedValue(undefined) },
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(activityFileResponse(fitBytes));

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: true,
      activityId: "existing-activity",
    });
    expect(activityFileParser).toHaveBeenCalledOnce();
    expect(repository.submitActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "123",
        providerUpdatedAt: "2026-04-03T11:05:00.000Z",
      }),
      expect.any(Object),
      expect.objectContaining({ artifactSha256: sha256(fitBytes) }),
    );
  });

  it("skips an existing import and repairs its link for the current profile", async () => {
    const repository = createRepositoryMock();
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    repository.findImportedActivityByProviderExternalId.mockResolvedValueOnce({
      activityId: "existing-activity",
      profileId: "profile-1",
      activityFilePath: "activities/profile-1/providers/wahoo/123.fit",
      activityFileSize: fitBytes.byteLength,
      artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      artifactSha256: sha256(fitBytes),
      providerRevision: "2026-04-03T11:05:00.000Z",
      analysisReady: true,
      materializerVersion: MATERIALIZER_VERSION,
      segmentsRevision: 1,
      timingCoverage: "complete",
      hasSwimSegment: false,
    });
    const activityFileStorage = { uploadActivityFile: vi.fn().mockResolvedValue(undefined) };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(activityFileResponse(fitBytes));

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: true,
      skipped: true,
      reason: "Activity already imported",
      activityId: "existing-activity",
    });

    expect(repository.createImportedActivityResourceLink).toHaveBeenCalledWith({
      activityId: "existing-activity",
      externalId: "123",
      integrationGeneration: 1,
      integrationId: "integration-1",
      profileId: "profile-1",
      provider: "wahoo",
      providerUpdatedAt: "2026-04-03T11:05:00.000Z",
    });
    expect(repository.findLinkedPlannedEventId).toHaveBeenCalledWith({
      externalWorkoutId: "456",
      profileId: "profile-1",
    });
    expect(repository.submitActivity).not.toHaveBeenCalled();
    expect(activityFileStorage.uploadActivityFile).toHaveBeenCalledOnce();
  });

  it("re-analyzes an existing import that has no ready provider ingestion", async () => {
    const repository = createRepositoryMock();
    repository.findImportedActivityLinkByExternalId.mockResolvedValueOnce({
      activityId: "existing-activity",
      linkId: "link-1",
      profileId: "profile-1",
      activityFilePath: "activities/profile-1/providers/wahoo/123.fit",
      activityFileSize: 15,
      analysisReady: false,
      materializerVersion: MATERIALIZER_VERSION,
    });
    repository.submitActivity.mockResolvedValueOnce({ id: "existing-activity" });
    const storedBytes = new TextEncoder().encode("fit-binary-data");
    const activityFileStorage = {
      readActivityFile: vi
        .fn()
        .mockResolvedValue({ bytes: storedBytes, size: storedBytes.byteLength }),
      uploadActivityFile: vi.fn().mockResolvedValue(undefined),
    };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: true,
      activityId: "existing-activity",
    });

    expect(repository.submitActivity).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "123", profileId: "profile-1" }),
      expect.any(Object),
      expect.objectContaining({ artifactSha256: sha256(storedBytes) }),
    );
    expect(repository.createImportedActivityResourceLink).toHaveBeenCalledOnce();
    expect(activityFileStorage.readActivityFile).toHaveBeenCalledWith(
      "activities/profile-1/providers/wahoo/123.fit",
    );
    expect(activityFileStorage.uploadActivityFile).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a persisted v1 materializer row without reading or replaying its bytes", async () => {
    const repository = createRepositoryMock();
    repository.findImportedActivityLinkByExternalId.mockResolvedValueOnce({
      activityId: "existing-activity",
      linkId: "link-1",
      profileId: "profile-1",
      activityFilePath: "activities/profile-1/providers/wahoo/123.fit",
      activityFileSize: 15,
      artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      analysisReady: true,
      materializerVersion: "activity-segments-v1",
      segmentsRevision: 3,
      timingCoverage: "unavailable",
      hasSwimSegment: false,
    });
    const activityFileStorage = { readActivityFile: vi.fn(), uploadActivityFile: vi.fn() };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: false,
      error: "Wahoo activity has a non-current materializer version",
      failureReason: "unsupported_persisted_version",
    });
    expect(activityFileStorage.readActivityFile).not.toHaveBeenCalled();
    expect(repository.submitActivity).not.toHaveBeenCalled();
    expect(repository.createImportedActivityResourceLink).not.toHaveBeenCalled();
  });

  it("does not retry timing fallback after the v2 materializer has already run", async () => {
    const repository = createRepositoryMock();
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    repository.findImportedActivityLinkByExternalId.mockResolvedValueOnce({
      activityId: "existing-activity",
      linkId: "link-1",
      profileId: "profile-1",
      activityFilePath: "activities/profile-1/providers/wahoo/123.fit",
      activityFileSize: fitBytes.byteLength,
      artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      artifactSha256: sha256(fitBytes),
      providerRevision: "2026-04-03T11:05:00.000Z",
      analysisReady: true,
      materializerVersion: MATERIALIZER_VERSION,
      segmentsRevision: 1,
      timingCoverage: "unavailable",
      hasSwimSegment: false,
    });
    const importer = createTestImporter({
      activityFileStorage: { uploadActivityFile: vi.fn().mockResolvedValue(undefined) },
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(activityFileResponse(fitBytes));

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toMatchObject({
      skipped: true,
    });
    expect(repository.submitActivity).not.toHaveBeenCalled();
  });

  it("fails closed when the required FIT artifact cannot be parsed", async () => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn().mockResolvedValue(undefined) };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
      activityFileParser: vi.fn(() => {
        throw new Error("corrupt FIT");
      }),
    });
    fetchMock.mockResolvedValueOnce(
      activityFileResponse(new TextEncoder().encode("corrupt-fit-data")),
    );

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: false,
      error: "Wahoo activity import failed",
    });
    expect(repository.submitActivity).not.toHaveBeenCalled();
  });

  it("does not download when disconnect wins the pre-download generation fence", async () => {
    const repository = createRepositoryMock();
    repository.findWahooIntegrationByExternalId
      .mockResolvedValueOnce({
        integrationGeneration: 1,
        integrationId: "integration-1",
        profileId: "profile-1",
      })
      .mockResolvedValueOnce(null);
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: false,
      error: "Wahoo activity import failed",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(activityFileStorage.uploadActivityFile).not.toHaveBeenCalled();
    expect(repository.submitActivity).not.toHaveBeenCalled();
  });

  it("removes its staged object when disconnect wins after upload", async () => {
    const repository = createRepositoryMock();
    repository.findWahooIntegrationByExternalId
      .mockResolvedValueOnce({
        integrationGeneration: 1,
        integrationId: "integration-1",
        profileId: "profile-1",
      })
      .mockResolvedValueOnce({
        integrationGeneration: 1,
        integrationId: "integration-1",
        profileId: "profile-1",
      })
      .mockResolvedValueOnce({
        integrationGeneration: 1,
        integrationId: "integration-1",
        profileId: "profile-1",
      })
      .mockResolvedValueOnce({
        integrationGeneration: 1,
        integrationId: "integration-1",
        profileId: "profile-1",
      })
      .mockResolvedValueOnce(null);
    const activityFileStorage = {
      removeOwnedActivityFile: vi.fn().mockResolvedValue({ cleanupPending: false, removed: true }),
      uploadActivityFile: vi.fn().mockResolvedValue(undefined),
    };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(activityFileResponse(new Uint8Array([1, 2, 3])));

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: false,
      error: "Wahoo activity import failed",
    });
    expect(repository.submitActivity).not.toHaveBeenCalled();
    expect(activityFileStorage.removeOwnedActivityFile).toHaveBeenCalledWith(
      expect.stringMatching(
        /^activities\/profile-1\/providers\/wahoo\/staging\/integration-1\/1\/123\/.+\.fit$/,
      ),
    );
  });

  it("fails a cross-profile provider identity collision without disclosing its activity ID", async () => {
    const repository = createRepositoryMock();
    repository.findImportedActivityByProviderExternalId.mockResolvedValueOnce({
      activityId: "existing-activity",
      profileId: "other-profile",
      activityFilePath: "activities/other-profile/providers/wahoo/123.fit",
      activityFileSize: 15,
      analysisReady: true,
    });
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });

    const result = await importer.importWorkoutSummary(77, createSummary());
    expect(result).toEqual({
      success: false,
      error: "Provider activity identity is owned by another profile",
    });
    expect(result).not.toHaveProperty("activityId");

    expect(repository.createImportedActivityResourceLink).not.toHaveBeenCalled();
    expect(repository.submitActivity).not.toHaveBeenCalled();
    expect(activityFileStorage.uploadActivityFile).not.toHaveBeenCalled();
  });

  it("imports a linked planned activity and stores the provider activity file when available", async () => {
    const repository = createRepositoryMock();
    repository.findLinkedPlannedEventId.mockResolvedValueOnce("event-1");
    repository.getEventActivityPlanId.mockResolvedValueOnce("plan-1");
    repository.submitActivity.mockResolvedValueOnce({ id: "activity-99" });
    const activityFileStorage = { uploadActivityFile: vi.fn().mockResolvedValue(undefined) };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValueOnce(activityFileResponse(fitBytes));

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
      path: expect.stringMatching(
        /^activities\/profile-1\/providers\/wahoo\/staging\/integration-1\/1\/123\/.+\.fit$/,
      ),
    });
    expect(repository.submitActivity).toHaveBeenCalledWith(
      {
        integrationGeneration: 1,
        integrationId: "integration-1",
        contentVisibility: "private",
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
        providerActiveDurationSeconds: 3501.2,
        elevationGainMeters: 789,
        calories: 654,
        avgPower: 212.3,
        normalizedPower: 228.4,
        avgHeartRate: 149,
        avgCadence: 92,
        avgSpeedMps: 8.9,
        activityFilePath: expect.stringMatching(
          /^activities\/profile-1\/providers\/wahoo\/staging\/integration-1\/1\/123\/.+\.fit$/,
        ),
        activityFileSize: fitBytes.byteLength,
        polyline: null,
      },
      expect.any(Object),
      expect.objectContaining({ artifactSha256: sha256(fitBytes) }),
    );
  });

  it("reserves durable cleanup authority before uploading a unique staging object", async () => {
    const repository = createRepositoryMock();
    const sequence: string[] = [];
    const recordOutcome = vi.fn().mockResolvedValue(true);
    const stagingCleanup = {
      reserve: vi.fn().mockImplementation(async () => {
        sequence.push("reserve");
        return {
          path: "activities/profile-1/providers/wahoo/staging/integration-1/1/123/11111111-1111-4111-8111-111111111111.fit",
          recordOutcome,
        };
      }),
    };
    const activityFileStorage = {
      uploadActivityFile: vi.fn().mockImplementation(async () => {
        sequence.push("upload");
      }),
    };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      stagingCleanup,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(activityFileResponse(new Uint8Array([1, 2, 3])));

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toMatchObject({
      success: true,
    });

    expect(sequence).toEqual(["reserve", "upload"]);
    expect(recordOutcome).toHaveBeenCalledWith("committed");
    expect(stagingCleanup.reserve).toHaveBeenCalledWith({
      integrationGeneration: 1,
      integrationId: "integration-1",
      profileId: "profile-1",
      summaryId: 123,
    });
  });

  it.each([
    "http://cdn.wahooligan.com/workout.fit",
    "https://cdn.wahooligan.com.evil.test/workout.fit",
    "https://user:secret@cdn.wahooligan.com/workout.fit",
    "https://cdn.wahooligan.com:444/workout.fit",
  ])("rejects unsafe activity file URL %s before fetching or submitting", async (url) => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });

    await expect(
      importer.importWorkoutSummary(77, createSummary({ file: { url } })),
    ).resolves.toEqual({
      success: false,
      error: "Wahoo activity file could not be imported",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(activityFileStorage.uploadActivityFile).not.toHaveBeenCalled();
    expect(repository.submitActivity).not.toHaveBeenCalled();
  });

  it("rejects redirects without following their target", async () => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        headers: { location: "https://evil.test/workout.fit" },
        status: 302,
      }),
    );

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toMatchObject({
      success: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), {
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
    expect(activityFileStorage.uploadActivityFile).not.toHaveBeenCalled();
    expect(repository.submitActivity).not.toHaveBeenCalled();
  });

  it("accepts an explicitly allowlisted partner activity-file host", async () => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn().mockResolvedValue(undefined) };
    const importer = createTestImporter({
      activityFileStorage,
      allowedActivityFileHosts: ["files.partner.example"],
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(activityFileResponse(new Uint8Array([1, 2, 3])));

    await expect(
      importer.importWorkoutSummary(
        77,
        createSummary({ file: { url: "https://files.partner.example/workout.fit" } }),
      ),
    ).resolves.toMatchObject({ success: true });

    expect(activityFileStorage.uploadActivityFile).toHaveBeenCalledOnce();
    expect(repository.submitActivity).toHaveBeenCalledOnce();
  });

  it.each([
    "invalid",
    String(50 * 1024 * 1024 + 1),
  ])("rejects invalid or oversized Content-Length %s before storage and submission", async (contentLength) => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(
      activityFileResponse(new Uint8Array([1]), { "content-length": contentLength }),
    );

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toMatchObject({
      success: false,
    });

    expect(activityFileStorage.uploadActivityFile).not.toHaveBeenCalled();
    expect(repository.submitActivity).not.toHaveBeenCalled();
  });

  it("rejects a chunked body as soon as it exceeds 50 MiB", async () => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    const chunk = new Uint8Array(1024 * 1024);
    let chunksSent = 0;
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (chunksSent >= 51) {
              controller.close();
              return;
            }
            chunksSent += 1;
            controller.enqueue(chunk);
          },
        }),
      ),
    );

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toMatchObject({
      success: false,
    });

    expect(chunksSent).toBe(51);
    expect(activityFileStorage.uploadActivityFile).not.toHaveBeenCalled();
    expect(repository.submitActivity).not.toHaveBeenCalled();
  });

  it("aborts an activity-file download after the fixed timeout", async () => {
    vi.useFakeTimers();
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockImplementationOnce(
      (_url: URL, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        }),
    );

    const result = importer.importWorkoutSummary(77, createSummary());
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(result).resolves.toMatchObject({ success: false });
    expect(activityFileStorage.uploadActivityFile).not.toHaveBeenCalled();
    expect(repository.submitActivity).not.toHaveBeenCalled();
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
    const importer = createTestImporter({
      activityFileStorage,
      activityFileParser,
      repository,
      submitActivity: repository.submitActivity,
    });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValueOnce(activityFileResponse(fitBytes));

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toMatchObject({
      success: true,
    });

    expect(activityFileParser).toHaveBeenCalledWith({
      bytes: fitBytes,
      fileName: expect.stringMatching(
        /^activities\/profile-1\/providers\/wahoo\/staging\/integration-1\/1\/123\/.+\.fit$/,
      ),
    });
    expect(repository.submitActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAt: "2026-04-03T09:30:00.000Z",
        finishedAt: "2026-04-03T10:25:00.000Z",
        type: "bike",
        name: "bike Activity",
        distanceMeters: 38999,
        durationSeconds: 3300,
        providerActiveDurationSeconds: 3501.2,
        elevationGainMeters: 456,
        calories: 600,
        avgPower: 199.6,
        avgHeartRate: 141,
        avgCadence: 89,
        avgSpeedMps: 11.8,
        polyline: expect.any(String),
      }),
      expect.any(Object),
      expect.objectContaining({ artifactSha256: sha256(fitBytes) }),
    );
    const submittedActivity = repository.submitActivity.mock.calls[0]?.[0];
    expect(submittedActivity).not.toHaveProperty("tss");
    expect(submittedActivity).not.toHaveProperty("intensityFactor");
    expect(repository.submitActivity.mock.calls[0]?.[1]).toMatchObject({
      summary: { totalDistance: 38999.4, totalTime: 3300 },
    });
  });

  it("replaces invalid file duration and distance before the analysis submission pipeline", async () => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn().mockResolvedValue(undefined) };
    const activityFileParser = vi.fn().mockReturnValue({
      metadata: {
        startTime: new Date("2026-04-03T09:30:00.000Z"),
        type: "cycling",
      },
      summary: {
        totalTime: Number.POSITIVE_INFINITY,
        totalDistance: Number.NaN,
      },
      records: [],
      laps: [],
      lengths: [],
    });
    const importer = createTestImporter({
      activityFileStorage,
      activityFileParser,
      repository,
      submitActivity: repository.submitActivity,
    });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValueOnce(activityFileResponse(fitBytes));

    await expect(
      importer.importWorkoutSummary(
        77,
        createSummary({ distance_accum: 12_000, duration_total_accum: 900 }),
      ),
    ).resolves.toMatchObject({ success: true });

    expect(repository.submitActivity).toHaveBeenCalledWith(
      expect.objectContaining({ distanceMeters: 12_000, durationSeconds: 900 }),
      expect.objectContaining({
        summary: expect.objectContaining({ totalDistance: 12_000, totalTime: 900 }),
      }),
      expect.objectContaining({ artifactSha256: sha256(fitBytes) }),
    );
  });

  it("preserves a genuine zero-distance file measurement through analysis submission", async () => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn().mockResolvedValue(undefined) };
    const activityFileParser = vi.fn().mockReturnValue({
      metadata: {
        startTime: new Date("2026-04-03T09:30:00.000Z"),
        type: "training",
      },
      summary: { totalTime: 600, totalDistance: 0 },
      records: [],
      laps: [],
      lengths: [],
    });
    const importer = createTestImporter({
      activityFileStorage,
      activityFileParser,
      repository,
      submitActivity: repository.submitActivity,
    });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValueOnce(activityFileResponse(fitBytes));

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toMatchObject({
      success: true,
    });

    expect(repository.submitActivity).toHaveBeenCalledWith(
      expect.objectContaining({ distanceMeters: 0, durationSeconds: 600 }),
      expect.objectContaining({
        summary: expect.objectContaining({ totalDistance: 0, totalTime: 600 }),
      }),
      expect.objectContaining({ artifactSha256: sha256(fitBytes) }),
    );
  });

  it("rejects the import before analysis submission when neither required metric source is valid", async () => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn().mockResolvedValue(undefined) };
    const activityFileParser = vi.fn().mockReturnValue({
      metadata: {
        startTime: new Date("2026-04-03T09:30:00.000Z"),
        type: "cycling",
      },
      summary: {
        totalTime: Number.POSITIVE_INFINITY,
        totalDistance: Number.NaN,
      },
      records: [],
      laps: [],
      lengths: [],
    });
    const importer = createTestImporter({
      activityFileStorage,
      activityFileParser,
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(
      activityFileResponse(new TextEncoder().encode("fit-binary-data")),
    );

    await expect(
      importer.importWorkoutSummary(
        77,
        createSummary({ distance_accum: Number.NaN, duration_total_accum: "invalid" }),
      ),
    ).resolves.toEqual({ success: false, error: "Wahoo activity import failed" });

    expect(repository.submitActivity).not.toHaveBeenCalled();
  });

  it("fails safely when FIT upload fails", async () => {
    const repository = createRepositoryMock();
    const activityFileStorage = {
      uploadActivityFile: vi.fn().mockRejectedValue(new Error("storage offline")),
    };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValueOnce(activityFileResponse(fitBytes));

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: false,
      error: "Wahoo activity file could not be imported",
    });

    expect(repository.submitActivity).not.toHaveBeenCalled();
  });

  it("attempts immediate removal when a staging upload has an uncertain failure", async () => {
    const repository = createRepositoryMock();
    const activityFileStorage = {
      removeOwnedActivityFile: vi.fn().mockResolvedValue({ cleanupPending: false, removed: true }),
      uploadActivityFile: vi.fn().mockRejectedValue(new Error("connection lost after upload")),
    };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(activityFileResponse(new Uint8Array([1, 2, 3])));

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: false,
      error: "Wahoo activity file could not be imported",
    });
    expect(activityFileStorage.removeOwnedActivityFile).toHaveBeenCalledWith(
      expect.stringMatching(
        /^activities\/profile-1\/providers\/wahoo\/staging\/integration-1\/1\/123\/.+\.fit$/,
      ),
    );
  });

  it("resolves a provider uniqueness race to the existing activity and repairs its link", async () => {
    const repository = createRepositoryMock();
    repository.submitActivity.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint: "idx_activities_provider_external_unique",
      }),
    );
    repository.findImportedActivityByProviderExternalId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        activityId: "concurrent-activity",
        profileId: "profile-1",
        activityFilePath: "activities/profile-1/providers/wahoo/123.fit",
        activityFileSize: 15,
        artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        artifactSha256: sha256(new TextEncoder().encode("fit-binary-data")),
        providerRevision: "2026-04-03T11:05:00.000Z",
        analysisReady: true,
        materializerVersion: MATERIALIZER_VERSION,
        segmentsRevision: 1,
        timingCoverage: "complete",
        hasSwimSegment: false,
      });
    const activityFileStorage = { uploadActivityFile: vi.fn().mockResolvedValue(undefined) };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValueOnce(activityFileResponse(fitBytes));

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: true,
      skipped: true,
      reason: "Activity already imported",
      activityId: "concurrent-activity",
    });
    expect(repository.submitActivity).toHaveBeenCalledOnce();
    expect(repository.createImportedActivityResourceLink).toHaveBeenCalledWith({
      activityId: "concurrent-activity",
      externalId: "123",
      integrationGeneration: 1,
      integrationId: "integration-1",
      profileId: "profile-1",
      provider: "wahoo",
      providerUpdatedAt: "2026-04-03T11:05:00.000Z",
    });
  });

  it("retries later when a concurrent winning activity still requires analysis", async () => {
    const repository = createRepositoryMock();
    repository.submitActivity.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint: "idx_activities_provider_external_unique",
      }),
    );
    repository.findImportedActivityByProviderExternalId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        activityId: "concurrent-activity",
        profileId: "profile-1",
        activityFilePath: "activities/profile-1/providers/wahoo/123.fit",
        activityFileSize: 15,
        artifactId: null,
        artifactSha256: null,
        providerRevision: null,
        analysisReady: false,
        materializerVersion: MATERIALIZER_VERSION,
        segmentsRevision: 0,
        timingCoverage: "unavailable",
        hasSwimSegment: false,
      });
    const importer = createTestImporter({
      activityFileStorage: { uploadActivityFile: vi.fn().mockResolvedValue(undefined) },
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(
      activityFileResponse(new TextEncoder().encode("fit-binary-data")),
    );

    await expect(importer.importWorkoutSummary(77, createSummary())).resolves.toEqual({
      success: false,
      error: "Wahoo activity persistence failed",
    });
    expect(repository.submitActivity).toHaveBeenCalledOnce();
  });

  it("does not treat an unrelated submission failure as a recoverable race", async () => {
    const repository = createRepositoryMock();
    repository.submitActivity.mockRejectedValueOnce(
      Object.assign(new Error("connection lost"), {
        code: "08006",
      }),
    );
    repository.findImportedActivityByProviderExternalId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ activityId: "existing-activity", profileId: "profile-1" });
    const activityFileStorage = { uploadActivityFile: vi.fn().mockResolvedValue(undefined) };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    fetchMock.mockResolvedValueOnce(
      activityFileResponse(new TextEncoder().encode("fit-binary-data")),
    );

    const result = await importer.importWorkoutSummary(77, createSummary());
    expect(result).toEqual({ success: false, error: "Wahoo activity persistence failed" });
    expect(repository.findImportedActivityByProviderExternalId).toHaveBeenCalledOnce();
    expect(repository.createImportedActivityResourceLink).not.toHaveBeenCalled();
  });

  it.each([
    { label: "unknown Wahoo workout type", workout: { id: 456, workout_type_id: 999 } },
    { label: "missing Wahoo workout type", workout: { id: 456 } },
  ])("prefers the parsed artifact type for $label", async ({ workout }) => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });
    const fitBytes = new TextEncoder().encode("fit-binary-data");
    fetchMock.mockResolvedValue(activityFileResponse(fitBytes));

    await expect(
      importer.importWorkoutSummary(
        77,
        createSummary({
          workout,
        }),
      ),
    ).resolves.toMatchObject({ success: true });

    expect(repository.submitActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "bike",
        name: "bike Activity",
      }),
      expect.any(Object),
      expect.objectContaining({ artifactSha256: sha256(fitBytes) }),
    );
  });

  it.each([
    undefined,
    "not-a-timestamp",
  ])("rejects a missing or invalid started_at before any I/O (%s)", async (started_at) => {
    const repository = createRepositoryMock();
    const activityFileStorage = { uploadActivityFile: vi.fn() };
    const importer = createTestImporter({
      activityFileStorage,
      repository,
      submitActivity: repository.submitActivity,
    });

    await expect(
      importer.importWorkoutSummary(
        77,
        createSummary({
          started_at,
        }),
      ),
    ).resolves.toEqual({
      success: false,
      error: "Wahoo activity started_at is missing or invalid",
    });

    expect(repository.findWahooIntegrationByExternalId).not.toHaveBeenCalled();
    expect(repository.findImportedActivityLinkByExternalId).not.toHaveBeenCalled();
    expect(repository.findImportedActivityByProviderExternalId).not.toHaveBeenCalled();
    expect(repository.findLinkedPlannedEventId).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(activityFileStorage.uploadActivityFile).not.toHaveBeenCalled();
    expect(defaultActivityFileParser).not.toHaveBeenCalled();
    expect(repository.submitActivity).not.toHaveBeenCalled();
    expect(repository.createImportedActivityResourceLink).not.toHaveBeenCalled();
  });
});

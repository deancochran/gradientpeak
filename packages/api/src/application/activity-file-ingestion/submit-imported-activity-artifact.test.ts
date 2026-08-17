import { beforeEach, describe, expect, it, vi } from "vitest";
import type { getRequiredDb } from "../../db";

const mocks = vi.hoisted(() => ({
  activityArtifactId: vi.fn(() => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
  providerActivityId: vi.fn(() => "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
  analyzeParsedActivityFile: vi.fn(),
  submitActivity: vi.fn(),
  cleanupActivityArtifactStaging: vi.fn(),
  cleanupOwnedPromotedActivityArtifact: vi.fn(),
  promoteActivityArtifact: vi.fn(),
  readObjectBounded: vi.fn(),
  beginIntake: vi.fn(),
  claimIntake: vi.fn(),
  acceptIntake: vi.fn(),
  failIntake: vi.fn(),
  completeCleanup: vi.fn(),
  deferCleanup: vi.fn(),
  getOperation: vi.fn(),
}));

vi.mock("./analyze-parsed-activity-file", () => ({
  analyzeParsedActivityFile: mocks.analyzeParsedActivityFile,
}));
vi.mock("../activities/submit-activity", () => ({
  activityArtifactId: mocks.activityArtifactId,
  providerActivityId: mocks.providerActivityId,
  submitActivity: mocks.submitActivity,
}));
vi.mock("./artifact-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./artifact-storage")>()),
  cleanupActivityArtifactStaging: mocks.cleanupActivityArtifactStaging,
  cleanupOwnedPromotedActivityArtifact: mocks.cleanupOwnedPromotedActivityArtifact,
  promoteActivityArtifact: mocks.promoteActivityArtifact,
}));
vi.mock("../../storage-service", () => ({
  getActivityArtifactStorageService: () => ({
    storage: { from: () => ({}) },
    readObjectBounded: mocks.readObjectBounded,
  }),
}));
vi.mock("./direct-activity-ingestion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./direct-activity-ingestion")>()),
  acceptActivityIngestion: mocks.acceptIntake,
  beginActivityIngestionOperation: mocks.beginIntake,
  claimActivityIngestionProcessing: mocks.claimIntake,
  failActivityIngestion: mocks.failIntake,
  completeActivityIngestionCleanup: mocks.completeCleanup,
  deferActivityIngestionCleanup: mocks.deferCleanup,
}));
vi.mock("../../infrastructure/repositories", () => ({
  createDrizzleActivityIngestionRepository: () => ({
    getOwned: mocks.getOperation,
    getOwnedByOperation: mocks.getOperation,
  }),
}));

import { submitImportedActivityArtifact } from "./submit-imported-activity-artifact";

type DbClient = ReturnType<typeof getRequiredDb>;

describe("submitImportedActivityArtifact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readObjectBounded.mockResolvedValue({ data: new Uint8Array([1, 2, 3]), contentType: "" });
    const operation = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      profileId: "11111111-1111-4111-8111-111111111111",
      operationId: "a".repeat(64),
      source: "provider_sync",
      status: "awaiting_upload",
      activityId: null,
      stagingCleanupPending: false,
    };
    mocks.beginIntake.mockResolvedValue(operation);
    mocks.claimIntake.mockResolvedValue({
      status: "claimed",
      operation: { ...operation, status: "processing" },
    });
    mocks.completeCleanup.mockResolvedValue(true);
    mocks.deferCleanup.mockResolvedValue(true);
    mocks.getOperation.mockResolvedValue(null);
    mocks.promoteActivityArtifact.mockResolvedValue({
      sha256: "a".repeat(64),
      byteSize: 123,
      bucket: "activity-files",
      path: `artifacts/sha256/profile-1/${"a".repeat(64)}`,
      mediaType: "application/octet-stream",
      format: "fit",
      stagingPath: "activities/profile-1/providers/wahoo/123.fit",
      createdDestination: false,
    });
  });

  it("removes a newly uploaded staging file when a completed provider operation replays", async () => {
    mocks.getOperation.mockResolvedValue({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      profileId: "11111111-1111-4111-8111-111111111111",
      status: "succeeded",
      activityId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      stagingCleanupPending: false,
      expectedSha256: "a".repeat(64),
    });
    await expect(
      submitImportedActivityArtifact({ select: vi.fn() } as never, {
        activity: {
          activityFilePath:
            "activities/11111111-1111-4111-8111-111111111111/providers/wahoo/123.fit",
          profileId: "11111111-1111-4111-8111-111111111111",
          provider: "wahoo",
          externalId: "123",
          providerUpdatedAt: null,
        } as never,
        parsedActivity: {} as never,
      }),
    ).resolves.toMatchObject({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      noOp: true,
    });
    expect(mocks.cleanupActivityArtifactStaging).toHaveBeenCalledWith(expect.anything(), {
      bucket: "activity-files",
      stagingPath: "activities/11111111-1111-4111-8111-111111111111/providers/wahoo/123.fit",
      path: `artifacts/sha256/11111111-1111-4111-8111-111111111111/${"a".repeat(64)}`,
    });
    expect(mocks.readObjectBounded).not.toHaveBeenCalled();
    expect(mocks.submitActivity).not.toHaveBeenCalled();
  });

  it("returns an in-progress provider replay without processing and cleans only its fresh staging file", async () => {
    const operation = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      profileId: "11111111-1111-4111-8111-111111111111",
      operationId: "a".repeat(64),
      source: "provider_sync" as const,
      status: "processing" as const,
      activityId: null,
      stagingPath: "activities/owner/providers/wahoo/original.fit",
      expectedSha256: "a".repeat(64),
      stagingCleanupPending: false,
    };
    mocks.beginIntake.mockResolvedValue(operation);
    mocks.claimIntake.mockResolvedValue({ status: "existing", operation });
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })),
      })),
    } as unknown as DbClient;

    const result = await submitImportedActivityArtifact(db, {
      activity: {
        activityFilePath: "activities/owner/providers/wahoo/replay.fit",
        profileId: operation.profileId,
        provider: "wahoo",
        externalId: "123",
        integrationId: "22222222-2222-4222-8222-222222222222",
        providerUpdatedAt: null,
      } as never,
      parsedActivity: {} as never,
      artifactSha256: "a".repeat(64),
    });

    expect(result).toMatchObject({ noOp: true, inProgress: true });
    expect(mocks.cleanupActivityArtifactStaging).toHaveBeenCalledWith(expect.anything(), {
      bucket: "activity-files",
      stagingPath: "activities/owner/providers/wahoo/replay.fit",
      path: `artifacts/sha256/${operation.profileId}/${"a".repeat(64)}`,
    });
    expect(mocks.promoteActivityArtifact).not.toHaveBeenCalled();
    expect(mocks.submitActivity).not.toHaveBeenCalled();
  });

  it("uses only canonical source identity before artifact submission", async () => {
    const completedAt = new Date("2026-01-01T11:00:00Z");
    const segmentSet = {
      version: 1 as const,
      elapsedMs: 3_600_000,
      segments: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          ordinal: 0,
          role: "activity" as const,
          activity_category: "bike" as const,
          startOffsetMs: 0,
          endOffsetMs: 3_600_000,
          summary: {
            version: 1 as const,
            timing: {
              timingCoverage: "complete" as const,
              activeMs: 3_550_000,
              movingMs: 3_500_000,
            },
          },
        },
      ],
    };
    const effort = {
      id: "effort-1",
      created_at: completedAt,
      profile_id: "profile-1",
      activity_id: "activity-generated",
      activity_category: "bike" as const,
      effort_type: "power" as const,
      duration_seconds: 300,
      recorded_at: completedAt,
      unit: "watts",
      value: 250,
    };
    mocks.analyzeParsedActivityFile.mockResolvedValue({
      activityCompletedAt: completedAt,
      startedAt: new Date("2026-01-01T10:00:00Z"),
      detectedLTHR: null,
      effortsToInsert: [effort],
      geometry: { mapBounds: null, polyline: null },
      summaryValues: {
        elapsed_ms: 3_600_000,
        active_ms: 3_550_000,
        moving_ms: 3_500_000,
        timing_coverage: "complete",
        distance_meters: 20_000,
        calories: 500,
        elevation_gain_meters: 200,
        avg_heart_rate: 140,
        max_heart_rate: 170,
        avg_power: 200,
        max_power: 500,
        avg_cadence: 88,
        max_cadence: 110,
        avg_speed_mps: 6,
        max_speed_mps: 12,
        normalized_speed_mps: null,
        normalized_graded_speed_mps: null,
        efficiency_factor: null,
        aerobic_decoupling: null,
        avg_temperature: null,
      },
      segmentSet,
    });
    mocks.submitActivity.mockResolvedValue({ id: "activity-generated" });
    const rows = [[]];
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => rows.shift() ?? []) })),
        })),
      })),
    } as unknown as DbClient;
    const parsedActivity = {
      metadata: { startTime: new Date("2026-01-01T10:00:00Z"), type: "cycling" },
      summary: { totalTime: 3600, totalDistance: 20_000 },
      records: [],
      laps: [],
    };

    await submitImportedActivityArtifact(db, {
      activity: {
        activityFilePath: "activities/11111111-1111-4111-8111-111111111111/providers/wahoo/123.fit",
        activityFileSize: 123,
        activityPlanId: null,
        avgCadence: null,
        avgHeartRate: null,
        avgPower: null,
        avgSpeedMps: null,
        calories: null,
        distanceMeters: 20_000,
        durationSeconds: 3600,
        elevationGainMeters: null,
        externalId: "123",
        finishedAt: completedAt.toISOString(),
        integrationId: "22222222-2222-4222-8222-222222222222",
        integrationGeneration: 1,
        contentVisibility: "private",
        providerActiveDurationSeconds: 3500,
        name: "bike Activity",
        normalizedPower: null,
        polyline: null,
        profileId: "11111111-1111-4111-8111-111111111111",
        provider: "wahoo",
        providerUpdatedAt: null,
        startedAt: "2026-01-01T10:00:00Z",
        type: "bike",
      },
      parsedActivity,
      artifactSha256: "a".repeat(64),
    });

    expect(mocks.analyzeParsedActivityFile).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        providerActiveDurationSeconds: 3500,
      }),
    );

    expect(mocks.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        profileId: "11111111-1111-4111-8111-111111111111",
        requestedActivityId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        providerProvenance: expect.objectContaining({ externalId: "123", provider: "wahoo" }),
        elapsedMs: 3_600_000,
        activeMs: 3_550_000,
        movingMs: 3_500_000,
        timingCoverage: "complete",
        segmentSet,
        analysis: {
          efforts: [effort],
          detectedLTHR: null,
          ingestion: expect.objectContaining({
            source: "provider_sync",
            operationId: expect.stringMatching(/^[0-9a-f]{64}$/),
            ingestionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            artifact: {
              sha256: "a".repeat(64),
              byteSize: 123,
              bucket: "activity-files",
              path: `artifacts/sha256/profile-1/${"a".repeat(64)}`,
              mediaType: "application/octet-stream",
              format: "fit",
              originalName: "123.fit",
            },
          }),
        },
      }),
      {},
    );
    expect(mocks.providerActivityId).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "wahoo",
      "123",
    );
  });
});

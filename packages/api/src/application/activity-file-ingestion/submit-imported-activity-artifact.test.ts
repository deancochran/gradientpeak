import { beforeEach, describe, expect, it, vi } from "vitest";
import type { getRequiredDb } from "../../db";

const mocks = vi.hoisted(() => ({
  activityArtifactId: vi.fn(() => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
  providerActivityId: vi.fn(() => "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
  analyzeParsedActivityFile: vi.fn(),
  submitActivity: vi.fn(),
  cleanupActivityArtifactStaging: vi.fn(),
  promoteActivityArtifact: vi.fn(),
  download: vi.fn(),
}));

vi.mock("./analyze-parsed-activity-file", () => ({
  analyzeParsedActivityFile: mocks.analyzeParsedActivityFile,
}));
vi.mock("../activities/submit-activity", () => ({
  activityArtifactId: mocks.activityArtifactId,
  providerActivityId: mocks.providerActivityId,
  submitActivity: mocks.submitActivity,
}));
vi.mock("./artifact-storage", () => ({
  cleanupActivityArtifactStaging: mocks.cleanupActivityArtifactStaging,
  promoteActivityArtifact: mocks.promoteActivityArtifact,
}));
vi.mock("../../storage-service", () => ({
  getApiStorageService: () => ({ storage: { from: () => ({ download: mocks.download }) } }),
}));

import { submitImportedActivityArtifact } from "./submit-imported-activity-artifact";

type DbClient = ReturnType<typeof getRequiredDb>;

describe("submitImportedActivityArtifact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.download.mockResolvedValue({
      data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
      error: null,
    });
    mocks.promoteActivityArtifact.mockResolvedValue({
      sha256: "a".repeat(64),
      byteSize: 123,
      bucket: "activity-files",
      path: `artifacts/sha256/profile-1/${"a".repeat(64)}`,
      mediaType: "application/octet-stream",
      format: "fit",
      stagingPath: "activities/profile-1/providers/wahoo/123.fit",
    });
  });

  it("persists provider analysis, efforts, and a ready ingestion as one canonical submission", async () => {
    const completedAt = new Date("2026-01-01T11:00:00Z");
    const segmentSet = {
      version: 1 as const,
      elapsedMs: 3_600_000,
      segments: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          ordinal: 0,
          role: "activity" as const,
          category: "bike" as const,
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
        normalized_power: 220,
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
    const rows = [[], []];
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
        activityFilePath: "activities/profile-1/providers/wahoo/123.fit",
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
        integrationId: "integration-1",
        isPrivate: true,
        movingSeconds: 3500,
        name: "bike Activity",
        normalizedPower: null,
        polyline: null,
        profileId: "profile-1",
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
      expect.objectContaining({ artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    );

    expect(mocks.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        profileId: "profile-1",
        providerProvenance: expect.objectContaining({ externalId: "123", provider: "wahoo" }),
        elapsedMs: 3_600_000,
        activeMs: 3_550_000,
        movingMs: 3_500_000,
        timingCoverage: "complete",
        segmentSet,
        analysis: {
          efforts: [effort],
          detectedLTHR: null,
          activityCompletedAt: completedAt,
          ingestion: {
            source: "provider_sync",
            provider: "wahoo",
            externalId: "123",
            operationKey: `provider_sync:wahoo:123:${"a".repeat(64)}`,
            artifact: {
              sha256: "a".repeat(64),
              byteSize: 123,
              bucket: "activity-files",
              path: `artifacts/sha256/profile-1/${"a".repeat(64)}`,
              mediaType: "application/octet-stream",
              format: "fit",
              originalName: "123.fit",
            },
          },
        },
      }),
    );
  });
});

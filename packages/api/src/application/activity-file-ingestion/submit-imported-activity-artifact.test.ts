import { beforeEach, describe, expect, it, vi } from "vitest";
import type { getRequiredDb } from "../../db";

const mocks = vi.hoisted(() => ({
  analyzeParsedActivityFile: vi.fn(),
  submitActivity: vi.fn(),
}));

vi.mock("./analyze-parsed-activity-file", () => ({
  analyzeParsedActivityFile: mocks.analyzeParsedActivityFile,
}));
vi.mock("../activities/submit-activity", () => ({ submitActivity: mocks.submitActivity }));

import { submitImportedActivityArtifact } from "./submit-imported-activity-artifact";

type DbClient = ReturnType<typeof getRequiredDb>;

describe("submitImportedActivityArtifact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists provider analysis, efforts, and a ready ingestion as one canonical submission", async () => {
    const completedAt = new Date("2026-01-01T11:00:00Z");
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
        duration_seconds: 3600,
        moving_seconds: 3500,
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
    });
    mocks.submitActivity.mockResolvedValue({ id: "activity-generated" });
    const db = {} as DbClient;
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
    });

    expect(mocks.submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        profileId: "profile-1",
        providerProvenance: expect.objectContaining({ externalId: "123", provider: "wahoo" }),
        analysis: {
          efforts: [effort],
          detectedLTHR: null,
          activityCompletedAt: completedAt,
          ingestion: {
            source: "provider_sync",
            provider: "wahoo",
            externalId: "123",
            fileType: "fit",
          },
        },
      }),
    );
  });
});

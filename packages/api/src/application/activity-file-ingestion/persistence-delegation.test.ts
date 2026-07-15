import { beforeEach, describe, expect, it, vi } from "vitest";
import type { getRequiredDb } from "../../db";

type DbClient = ReturnType<typeof getRequiredDb>;

const { submitActivity } = vi.hoisted(() => ({
  submitActivity: vi.fn(),
}));
vi.mock("../activities/submit-activity", () => ({ submitActivity }));

import { persistExistingActivityFileEnrichment } from "./persist-existing-activity-file-enrichment";
import { persistNewActivityFileImport } from "./persist-new-activity-file-import";

beforeEach(() => {
  vi.clearAllMocks();
  submitActivity.mockResolvedValue({ id: "activity-1" });
});

describe("activity file persistence adapters", () => {
  it("delegates a manual file import to the canonical submission service", async () => {
    const db = {
      query: { activities: { findFirst: vi.fn().mockResolvedValue({ id: "activity-1" }) } },
    };
    const input = {
      profileId: "profile-1",
      name: "Upload",
      notes: null,
      activityType: "run",
      isPrivate: true,
      startedAt: new Date(),
      finishedAt: new Date(),
      durationSeconds: 60,
      movingSeconds: 60,
      distanceMeters: 100,
      activityFilePath: "upload.fit",
      activityFileSize: 20,
      importSource: "manual",
      importFileType: "fit",
      importOriginalFileName: "upload.fit",
      calories: null,
      elevationGainMeters: null,
      avgHeartRate: null,
      maxHeartRate: null,
      avgPower: null,
      maxPower: null,
      normalizedPower: null,
      avgCadence: null,
      maxCadence: null,
      avgSpeedMps: null,
      maxSpeedMps: null,
      normalizedSpeedMps: null,
      normalizedGradedSpeedMps: null,
      efficiencyFactor: null,
      aerobicDecoupling: null,
      avgTemperature: null,
      deviceManufacturer: null,
      deviceProduct: null,
      laps: null,
      mapBounds: null,
      polyline: null,
    };
    await persistNewActivityFileImport(db as unknown as DbClient, input);
    expect(submitActivity).toHaveBeenCalledOnce();
    expect(submitActivity).toHaveBeenCalledWith(db, input);
  });

  it("delegates recorded enrichment to the canonical submission service", async () => {
    const db = {};
    const completedAt = new Date("2026-01-01T11:00:00Z");
    await persistExistingActivityFileEnrichment(db as unknown as DbClient, {
      activityId: "activity-1",
      profileId: "profile-1",
      activityFilePath: "recorded.fit",
      activityFileSize: 30,
      activityFileType: "fit",
      activityType: "bike",
      parsedData: {
        metadata: { type: "cycling", startTime: new Date(), manufacturer: "Wahoo" },
        laps: [],
      },
      enrichment: {
        activityCompletedAt: completedAt,
        activityCompletedAtIso: completedAt.toISOString(),
        detectedLTHR: null,
        effortsToInsert: [],
        geometry: { mapBounds: null, polyline: null },
        summaryValues: {
          activity_id: "activity-1",
          profile_id: "profile-1",
          duration_seconds: 60,
          moving_seconds: 60,
          distance_meters: 100,
        },
      },
    });
    expect(submitActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        kind: "enrich",
        activityId: "activity-1",
        activityFilePath: "recorded.fit",
        activityType: "bike",
        mapBounds: undefined,
        polyline: undefined,
      }),
    );
  });

  it("delegates an intentional geometry clear explicitly", async () => {
    const completedAt = new Date("2026-01-01T11:00:00Z");
    await persistExistingActivityFileEnrichment({} as DbClient, {
      activityId: "activity-1",
      profileId: "profile-1",
      activityFilePath: "recorded.fit",
      activityFileSize: 30,
      activityFileType: "fit",
      activityType: "bike",
      parsedData: { metadata: { type: "bike", startTime: completedAt } },
      enrichment: {
        activityCompletedAt: completedAt,
        activityCompletedAtIso: completedAt.toISOString(),
        detectedLTHR: null,
        effortsToInsert: [],
        replaceGeometry: true,
        geometry: { mapBounds: null, polyline: null },
        summaryValues: {},
      },
    });
    expect(submitActivity).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ mapBounds: null, polyline: null, laps: undefined }),
    );
  });
});

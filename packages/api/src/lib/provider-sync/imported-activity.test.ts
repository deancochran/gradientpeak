import { describe, expect, it } from "vitest";
import { buildImportedActivityCreateInput } from "./imported-activity";

describe("buildImportedActivityCreateInput", () => {
  it("prefers parsed activity values and builds a storage-ready polyline", () => {
    const result = buildImportedActivityCreateInput({
      activityFile: { path: "activities/profile-1/provider/source.fit", size: 42 },
      activityPlanId: "plan-1",
      externalId: "external-1",
      fallback: {
        avgHeartRate: 140,
        avgPower: 190,
        avgSpeedMps: 8,
        calories: 500,
        distanceMeters: 20_000,
        durationSeconds: 3600,
        elevationGainMeters: 100,
        movingSeconds: 3500,
        normalizedPower: 210,
        providerUpdatedAt: "2026-04-03T11:00:00.000Z",
        startedAt: "2026-04-03T10:00:00.000Z",
      },
      integrationId: "integration-1",
      parsedActivity: {
        metadata: {
          startTime: new Date("2026-04-03T09:30:00.000Z"),
          type: "cycling",
        },
        summary: {
          avgHeartRate: 150.4,
          avgPower: 201.2,
          avgSpeed: 9.4,
          calories: 650.1,
          totalAscent: 222.2,
          totalDistance: 24_123.8,
          totalTime: 3300,
        },
        records: [
          { timestamp: new Date("2026-04-03T09:30:00.000Z"), positionLat: 40, positionLong: -75 },
          {
            timestamp: new Date("2026-04-03T09:31:00.000Z"),
            positionLat: 40.001,
            positionLong: -75.001,
          },
        ],
      },
      profileId: "profile-1",
      provider: "wahoo",
      title: "Ride",
      type: "bike",
    });

    expect(result).toMatchObject({
      activityFilePath: "activities/profile-1/provider/source.fit",
      activityFileSize: 42,
      activityPlanId: "plan-1",
      avgHeartRate: 150,
      avgPower: 201.2,
      avgSpeedMps: 9.4,
      calories: 650,
      distanceMeters: 24124,
      durationSeconds: 3300,
      elevationGainMeters: 222,
      externalId: "external-1",
      finishedAt: "2026-04-03T10:25:00.000Z",
      integrationId: "integration-1",
      movingSeconds: 3300,
      name: "Ride",
      normalizedPower: 210,
      profileId: "profile-1",
      provider: "wahoo",
      providerUpdatedAt: "2026-04-03T11:00:00.000Z",
      startedAt: "2026-04-03T09:30:00.000Z",
      type: "bike",
    });
    expect(result.polyline).toEqual(expect.any(String));
  });

  it("falls back to provider summary values when parsed activity is unavailable", () => {
    const result = buildImportedActivityCreateInput({
      activityFile: { path: "activities/profile-1/provider/source.fit", size: 42 },
      activityPlanId: null,
      externalId: "external-1",
      fallback: {
        avgCadence: 90.8,
        avgHeartRate: 140.2,
        avgPower: 190.6,
        avgSpeedMps: 8.2,
        calories: 500.8,
        distanceMeters: 20_000.6,
        durationSeconds: 3600,
        elevationGainMeters: 100.4,
        movingSeconds: 3500.4,
        normalizedPower: 210.5,
        startedAt: "2026-04-03T10:00:00.000Z",
      },
      integrationId: "integration-1",
      parsedActivity: null,
      profileId: "profile-1",
      provider: "wahoo",
      title: "Ride",
      type: "bike",
    });

    expect(result).toMatchObject({
      avgCadence: 91,
      avgHeartRate: 140,
      avgPower: 190.6,
      avgSpeedMps: 8.2,
      calories: 501,
      distanceMeters: 20001,
      durationSeconds: 3600,
      elevationGainMeters: 100,
      finishedAt: "2026-04-03T11:00:00.000Z",
      movingSeconds: 3500,
      normalizedPower: 210.5,
      polyline: null,
    });
  });
});

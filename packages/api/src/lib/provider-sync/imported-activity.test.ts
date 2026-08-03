import { describe, expect, it } from "vitest";
import {
  buildImportedActivityCreateInput,
  ImportedActivityMetricResolutionError,
} from "./imported-activity";

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
        providerActiveDurationSeconds: "3500.4",
        normalizedPower: 210,
        providerUpdatedAt: "2026-04-03T11:00:00.000Z",
        startedAt: "2026-04-03T10:00:00.000Z",
      },
      integrationGeneration: 1,
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
      integrationGeneration: 1,
      integrationId: "integration-1",
      contentVisibility: "private",
      providerActiveDurationSeconds: 3500.4,
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
        providerActiveDurationSeconds: 3500.4,
        normalizedPower: 210.5,
        startedAt: "2026-04-03T10:00:00.000Z",
      },
      integrationGeneration: 1,
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
      contentVisibility: "private",
      providerActiveDurationSeconds: 3500.4,
      normalizedPower: 210.5,
      polyline: null,
    });
  });

  it("does not replace a measured zero-distance file fact with provider summary distance", () => {
    const result = buildImportedActivityCreateInput({
      activityFile: { path: "activities/profile-1/provider/source.fit", size: 42 },
      activityPlanId: null,
      externalId: "external-1",
      fallback: {
        distanceMeters: 20_000,
        durationSeconds: 3_600,
        startedAt: "2026-04-03T10:00:00.000Z",
      },
      integrationGeneration: 1,
      integrationId: "integration-1",
      parsedActivity: {
        metadata: {
          startTime: new Date("2026-04-03T09:30:00.000Z"),
          type: "training",
        },
        summary: { totalDistance: 0, totalTime: 600 },
        records: [],
      },
      profileId: "profile-1",
      provider: "wahoo",
      title: "Indoor strength",
      type: "strength",
    });

    expect(result).toMatchObject({
      distanceMeters: 0,
      durationSeconds: 600,
      startedAt: "2026-04-03T09:30:00.000Z",
    });
  });

  it.each([
    ["durationSeconds", { distanceMeters: 0 }],
    ["distanceMeters", { durationSeconds: 600 }],
  ] as const)("rejects omitted %s instead of fabricating measured zero", (metric, fallbackMetrics) => {
    expect(() =>
      buildImportedActivityCreateInput({
        activityFile: { path: "activities/profile-1/provider/source.fit", size: 42 },
        activityPlanId: null,
        externalId: "external-1",
        fallback: {
          ...fallbackMetrics,
          startedAt: "2026-04-03T10:00:00.000Z",
        },
        integrationGeneration: 1,
        integrationId: "integration-1",
        parsedActivity: null,
        profileId: "profile-1",
        provider: "wahoo",
        title: "Activity",
        type: "other",
      }),
    ).toThrow(
      expect.objectContaining({
        metric,
        reason: "missing_source",
      }),
    );
  });

  it.each([
    ["durationSeconds", { distanceMeters: 0, durationSeconds: "invalid" }],
    ["distanceMeters", { distanceMeters: "invalid", durationSeconds: 600 }],
  ] as const)("rejects invalid %s instead of fabricating measured zero", (metric, fallbackMetrics) => {
    expect(() =>
      buildImportedActivityCreateInput({
        activityFile: { path: "activities/profile-1/provider/source.fit", size: 42 },
        activityPlanId: null,
        externalId: "external-1",
        fallback: {
          ...fallbackMetrics,
          startedAt: "2026-04-03T10:00:00.000Z",
        },
        integrationGeneration: 1,
        integrationId: "integration-1",
        parsedActivity: null,
        profileId: "profile-1",
        provider: "wahoo",
        title: "Activity",
        type: "other",
      }),
    ).toThrow(
      expect.objectContaining({
        metric,
        reason: "invalid_source",
      }),
    );
  });

  it("preserves actual provider zero values as known measurements", () => {
    const result = buildImportedActivityCreateInput({
      activityFile: { path: "activities/profile-1/provider/source.fit", size: 42 },
      activityPlanId: null,
      externalId: "external-1",
      fallback: {
        distanceMeters: 0,
        durationSeconds: 0,
        startedAt: "2026-04-03T10:00:00.000Z",
      },
      integrationGeneration: 1,
      integrationId: "integration-1",
      parsedActivity: null,
      profileId: "profile-1",
      provider: "wahoo",
      title: "Activity",
      type: "other",
    });

    expect(result).toMatchObject({
      distanceMeters: 0,
      durationSeconds: 0,
      finishedAt: "2026-04-03T10:00:00.000Z",
    });
  });

  it("falls back to valid provider facts when file metrics are invalid", () => {
    const result = buildImportedActivityCreateInput({
      activityFile: { path: "activities/profile-1/provider/source.fit", size: 42 },
      activityPlanId: null,
      externalId: "external-1",
      fallback: {
        distanceMeters: 12_000,
        durationSeconds: 900,
        startedAt: "2026-04-03T10:00:00.000Z",
      },
      integrationGeneration: 1,
      integrationId: "integration-1",
      parsedActivity: {
        metadata: { startTime: new Date("2026-04-03T09:30:00.000Z"), type: "cycling" },
        summary: { totalDistance: Number.NaN, totalTime: Number.POSITIVE_INFINITY },
        records: [],
      },
      profileId: "profile-1",
      provider: "wahoo",
      title: "Ride",
      type: "bike",
    });

    expect(result).toMatchObject({ distanceMeters: 12_000, durationSeconds: 900 });
  });

  it("preserves valid provider active duration separately and rejects invalid values", () => {
    const build = (providerActiveDurationSeconds: number | string | null) =>
      buildImportedActivityCreateInput({
        activityFile: { path: "activities/profile-1/provider/source.fit", size: 42 },
        activityPlanId: null,
        externalId: "external-1",
        fallback: {
          distanceMeters: 0,
          durationSeconds: 3600,
          providerActiveDurationSeconds,
          startedAt: "2026-04-03T10:00:00.000Z",
        },
        integrationGeneration: 1,
        integrationId: "integration-1",
        parsedActivity: null,
        profileId: "profile-1",
        provider: "wahoo",
        title: "Ride",
        type: "bike",
      });

    expect(build("3500.25").providerActiveDurationSeconds).toBe(3500.25);
    expect(build("not-a-duration").providerActiveDurationSeconds).toBeNull();
  });

  it("exposes typed rejection state to the provider import boundary", () => {
    expect(() =>
      buildImportedActivityCreateInput({
        activityFile: { path: "activities/profile-1/provider/source.fit", size: 42 },
        activityPlanId: null,
        externalId: "external-1",
        fallback: { distanceMeters: 0, startedAt: "2026-04-03T10:00:00.000Z" },
        integrationGeneration: 1,
        integrationId: "integration-1",
        parsedActivity: null,
        profileId: "profile-1",
        provider: "wahoo",
        title: "Activity",
        type: "other",
      }),
    ).toThrow(ImportedActivityMetricResolutionError);
  });
});

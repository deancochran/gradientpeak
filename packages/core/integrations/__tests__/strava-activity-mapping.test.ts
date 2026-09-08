import { describe, expect, it } from "vitest";
import { mapStravaActivityToCanonical, mapStravaSportType } from "../strava-activity-mapping";

const segmentId = "00000000-0000-4000-8000-000000000001";
const activity = {
  id: "123",
  name: "Morning Ride",
  sportType: "Ride",
  startedAt: "2026-09-01T08:00:00Z",
  elapsedSeconds: 180,
  movingSeconds: 170,
  distanceMeters: 1_000,
  elevationGainMeters: 20,
  averageHeartRateBpm: 140,
  averagePowerWatts: 200,
  averageCadenceRpm: 80,
  averageSpeedMetersPerSecond: 5.5,
};

describe("Strava canonical activity mapping", () => {
  it.each([
    ["Run", "run"],
    ["VirtualRide", "bike"],
    ["Swim", "swim"],
    ["WeightTraining", "strength"],
    ["Kayaking", "other"],
  ] as const)("maps %s to %s", (sportType, expected) => {
    expect(mapStravaSportType(sportType)).toBe(expected);
  });

  it("maps provider summary evidence privately without fabricating an artifact", () => {
    const mapped = mapStravaActivityToCanonical({ activity, segmentId });
    expect(mapped).toMatchObject({
      contentVisibility: "private",
      evidenceTier: "provider_summary",
      elapsedMs: 180_000,
      movingMs: 170_000,
      name: "Morning Ride",
      activityCategory: "bike",
    });
    expect(mapped.segmentSet.segments[0]).toMatchObject({
      source: { kind: "raw", rawType: "Ride" },
      summary: { averagePowerWatts: 200, distanceMeters: 1_000 },
    });
    expect(mapped).not.toHaveProperty("artifact");
  });

  it("prefers bounded raw streams and marks their stronger evidence tier", () => {
    const mapped = mapStravaActivityToCanonical({
      activity,
      segmentId,
      streams: {
        time: [0, 60, 120, 180],
        watts: [100, 220, 240, 260],
        heartrate: [100, 130, 150, 170],
        cadence: [70, 80, 90, 100],
        velocity_smooth: [3, 5, 7, 9],
        altitude: [10, 15, 14, 22],
        distance: [0, 300, 650, 1_050],
        latlng: [
          [40, -75],
          [41, -74],
        ],
        moving: [true, true, true, true],
        temp: [18, 20],
      },
    });
    expect(mapped).toMatchObject({
      evidenceTier: "raw_samples",
      distanceMeters: 1_050,
      elevationGainMeters: 13,
      avgHeartRate: 137.5,
      avgPower: 205,
      maxPower: 260,
      avgTemperature: 19,
      mapBounds: { minLat: 40, maxLat: 41, minLng: -75, maxLng: -74 },
    });
  });
});

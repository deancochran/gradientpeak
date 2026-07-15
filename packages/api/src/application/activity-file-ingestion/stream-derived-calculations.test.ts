import {
  calculateDecouplingFromStreams,
  calculateGradedSpeedStream,
  calculateNGP,
  calculateNormalizedPower,
} from "@repo/core/calculations";
import { describe, expect, it } from "vitest";
import {
  buildActivityFileBestEffortRows,
  calculateActivityFileStreamDerivedMetrics,
} from "./stream-derived-calculations";
import { collectActivityFileStreamMetadata } from "./stream-metadata";

const timestamps = Array.from({ length: 61 }, (_, index) => index);
const base = {
  activityId: "11111111-1111-4111-8111-111111111111",
  profileId: "22222222-2222-4222-8222-222222222222",
  recordedAt: new Date("2026-07-13T12:00:00.000Z"),
  normalizedGradedSpeed: null,
};

function rowsFor(activityType: string) {
  return buildActivityFileBestEffortRows({
    ...base,
    activityType,
    streamMetadata: {
      timestamps,
      powerStream: timestamps.map(() => 250),
      speedStream: timestamps.map(() => 4),
      altitudeStream: timestamps.map(() => 0),
    },
  });
}

describe("buildActivityFileBestEffortRows", () => {
  it.each([
    ["bike", ["power"]],
    ["run", ["speed"]],
    ["swim", ["speed"]],
    ["strength", []],
  ])("enforces the %s stream-derived effort matrix", (activityType, effortTypes) => {
    const rows = rowsFor(activityType);
    expect([...new Set(rows.map((row) => row.effort_type))]).toEqual(effortTypes);
    expect(rows.every((row) => row.activity_category === activityType)).toBe(true);
  });

  it("persists canonical units and import provenance", () => {
    expect(rowsFor("bike")[0]).toMatchObject({
      effort_type: "power",
      unit: "watts",
      source: "imported",
      method: "activity_file_best_effort",
      provenance: { derived_from: "activity_file_stream", activity_id: base.activityId },
    });
    expect(rowsFor("swim")[0]).toMatchObject({
      effort_type: "speed",
      unit: "meters_per_second",
    });
  });

  it.each([
    ["bike", "power"],
    ["swim", "speed"],
  ] as const)("uses sparse %s stream timestamps for best-effort offsets", (activityType, metric) => {
    const records = Array.from({ length: 11 }, (_, second) => ({
      timestamp: new Date(second * 1000),
      power: second === 1 ? undefined : second < 5 ? 100 : 300,
      speed: second === 1 ? undefined : second < 5 ? 2 : 6,
      altitude: 0,
    }));
    const metadata = collectActivityFileStreamMetadata(records);
    const rows = buildActivityFileBestEffortRows({
      ...base,
      activityType,
      streamMetadata: {
        timestamps: metadata.timestamps,
        powerStream: metadata.powerStream,
        powerTimestamps: metadata.powerTimestamps,
        speedStream: metadata.speedStream,
        speedTimestamps: metadata.speedTimestamps,
        altitudeStream: metadata.altitudeStream,
        altitudeTimestamps: metadata.altitudeTimestamps,
      },
    });

    expect(
      rows.find((row) => row.effort_type === metric && row.duration_seconds === 5),
    ).toMatchObject({ start_offset: 5 });
  });
});

describe("sparse activity-file stream calculations", () => {
  it("omits untimestamped metric values without invalidating aligned samples", () => {
    const metadata = collectActivityFileStreamMetadata([
      { power: 999 },
      { timestamp: new Date(0), power: 100 },
      { timestamp: new Date(1000), power: 120 },
    ]);

    expect(metadata.powerStream).toEqual([100, 120]);
    expect(metadata.powerTimestamps).toEqual([0, 1]);
  });

  it("aligns power and heart rate by their shared record timestamps", () => {
    const metadata = collectActivityFileStreamMetadata([
      { timestamp: new Date(0), power: 100, heartRate: 100 },
      { timestamp: new Date(1000), power: 120 },
      { timestamp: new Date(2000), heartRate: 130 },
      { timestamp: new Date(3000), power: 180, heartRate: 150 },
      { timestamp: new Date(4000), power: 200, heartRate: 160 },
    ]);

    expect(metadata.powerTimestamps).toEqual([0, 1, 3, 4]);
    expect(metadata.hrTimestamps).toEqual([0, 2, 3, 4]);

    const metrics = calculateActivityFileStreamDerivedMetrics({
      activityType: "bike",
      distance: 0,
      duration: 4,
      streamMetadata: metadata,
    });
    const expected = calculateDecouplingFromStreams(
      [100, 180, 200],
      [100, 150, 160],
      [0, 3, 4],
      calculateNormalizedPower,
    );

    expect(metrics.aerobicDecoupling).toBeCloseTo(expected);
  });

  it("aligns speed, altitude, and heart rate before graded and decoupling calculations", () => {
    const metadata = collectActivityFileStreamMetadata([
      { timestamp: new Date(0), speed: 4, altitude: 0, heartRate: 100 },
      { timestamp: new Date(1000), speed: 4 },
      { timestamp: new Date(2000), speed: 5, altitude: 2, heartRate: 120 },
      { timestamp: new Date(3000), altitude: 3, heartRate: 130 },
      { timestamp: new Date(4000), speed: 6, altitude: 4 },
      { timestamp: new Date(5000), speed: 7, altitude: 5, heartRate: 150 },
    ]);
    const graded = calculateGradedSpeedStream([4, 5, 6, 7], [0, 2, 4, 5], [0, 2, 4, 5]);

    const metrics = calculateActivityFileStreamDerivedMetrics({
      activityType: "run",
      distance: 25,
      duration: 5,
      streamMetadata: metadata,
    });

    expect(metrics.normalizedGradedSpeed).toBeCloseTo(calculateNGP(graded));
    expect(metrics.aerobicDecoupling).toBeCloseTo(
      calculateDecouplingFromStreams(
        graded.filter((_, index) => index === 0 || index === 1 || index === 3),
        [100, 120, 150],
        [0, 2, 5],
        calculateNGP,
      ),
    );
  });
});

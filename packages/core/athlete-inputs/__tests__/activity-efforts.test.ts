import { describe, expect, it } from "vitest";
import {
  createActivityEffortInputSchema,
  formatActivityEffortValue,
  formatEffortDuration,
  getActivityEffortDefinition,
  getActivityEffortDefinitionsForCategory,
  paceSecondsFromSpeedMetersPerSecond,
  speedMetersPerSecondFromDistanceAndElapsedSeconds,
  speedMetersPerSecondFromPace,
} from "../activity-efforts";

describe("activity effort definitions", () => {
  it("filters supported efforts by activity category", () => {
    expect(getActivityEffortDefinitionsForCategory("bike")).toHaveLength(1);
    expect(
      getActivityEffortDefinition({ activityCategory: "run", effortType: "speed" }),
    ).toMatchObject({
      unit: "m/s",
    });
  });

  it("rejects unsupported category and effort combinations", () => {
    expect(() =>
      createActivityEffortInputSchema.parse({
        activity_category: "run",
        effort_type: "power",
        duration_seconds: 60,
        value: 300,
        recorded_at: "2026-07-09T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("normalizes unit and value on create", () => {
    const parsed = createActivityEffortInputSchema.parse({
      activity_category: "bike",
      effort_type: "power",
      duration_seconds: 1200,
      value: 301.4,
      recorded_at: "2026-07-09T12:00:00.000Z",
    });

    expect(parsed).toMatchObject({ unit: "W", value: 301 });
  });

  it("formats effort values and durations", () => {
    expect(
      formatActivityEffortValue({ activity_category: "bike", effort_type: "power", value: 300 }),
    ).toBe("300 W");
    expect(formatEffortDuration(125)).toBe("2m 05s");
  });
});

describe("activity effort speed conversions", () => {
  it("derives canonical m/s from distance and elapsed time", () => {
    expect(
      speedMetersPerSecondFromDistanceAndElapsedSeconds({
        distanceMeters: 1_000,
        elapsedSeconds: 300,
      }),
    ).toBeCloseTo(10 / 3);
    expect(
      speedMetersPerSecondFromDistanceAndElapsedSeconds({
        distanceMeters: 400,
        elapsedSeconds: 80,
      }),
    ).toBe(5);
  });

  it("converts pace in seconds per distance unit to canonical m/s", () => {
    expect(
      speedMetersPerSecondFromPace({
        paceSeconds: 300,
        distanceUnitMeters: 1_000,
      }),
    ).toBeCloseTo(10 / 3);
    expect(
      speedMetersPerSecondFromPace({
        paceSeconds: 90,
        distanceUnitMeters: 100,
      }),
    ).toBeCloseTo(10 / 9);
  });

  it("converts canonical m/s back to pace seconds for display", () => {
    expect(
      paceSecondsFromSpeedMetersPerSecond({
        speedMetersPerSecond: 4,
        distanceUnitMeters: 1_000,
      }),
    ).toBe(250);
  });

  it.each([
    { distanceMeters: 0, elapsedSeconds: 60 },
    { distanceMeters: -100, elapsedSeconds: 60 },
    { distanceMeters: 100, elapsedSeconds: 0 },
    { distanceMeters: 100, elapsedSeconds: -60 },
    { distanceMeters: Number.NaN, elapsedSeconds: 60 },
    { distanceMeters: 100, elapsedSeconds: Number.POSITIVE_INFINITY },
  ])("returns null for invalid distance and elapsed time: %o", (input) => {
    expect(speedMetersPerSecondFromDistanceAndElapsedSeconds(input)).toBeNull();
  });

  it.each([
    { paceSeconds: 0, distanceUnitMeters: 1_000 },
    { paceSeconds: -300, distanceUnitMeters: 1_000 },
    { paceSeconds: 300, distanceUnitMeters: 0 },
    { paceSeconds: 300, distanceUnitMeters: Number.NaN },
    { paceSeconds: Number.POSITIVE_INFINITY, distanceUnitMeters: 1_000 },
  ])("returns null for invalid pace input: %o", (input) => {
    expect(speedMetersPerSecondFromPace(input)).toBeNull();
  });

  it.each([
    { speedMetersPerSecond: 0, distanceUnitMeters: 1_000 },
    { speedMetersPerSecond: -4, distanceUnitMeters: 1_000 },
    { speedMetersPerSecond: 4, distanceUnitMeters: 0 },
    { speedMetersPerSecond: Number.NaN, distanceUnitMeters: 1_000 },
    { speedMetersPerSecond: 4, distanceUnitMeters: Number.POSITIVE_INFINITY },
  ])("returns null for invalid inverse pace input: %o", (input) => {
    expect(paceSecondsFromSpeedMetersPerSecond(input)).toBeNull();
  });
});

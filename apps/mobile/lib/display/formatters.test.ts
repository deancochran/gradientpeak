import { describe, expect, it } from "vitest";
import {
  formatDistanceMeters,
  formatElevationMeters,
  formatPaceSecondsPerKilometer,
  formatSpeedMetersPerSecond,
} from "./formatters";

describe("preference-aware unit formatters", () => {
  it("preserves existing metric formatter output when no preference is supplied", () => {
    expect(formatDistanceMeters(1609.344)).toBe("1.61 km");
    expect(formatElevationMeters(100)).toBe("100 m");
    expect(formatPaceSecondsPerKilometer(300)).toBe("5:00");
  });

  it.each([
    ["metric", "1.6 km"],
    ["imperial", "1.0 mi"],
  ] as const)("formats distance in %s units", (preferredUnitSystem, expected) => {
    expect(formatDistanceMeters(1609.344, { preferredUnitSystem })).toBe(expected);
  });

  it.each([
    ["metric", "100.0 m"],
    ["imperial", "328.1 ft"],
  ] as const)("formats elevation in %s units", (preferredUnitSystem, expected) => {
    expect(formatElevationMeters(100, { preferredUnitSystem })).toBe(expected);
  });

  it.each([
    ["metric", "36.0 km/h"],
    ["imperial", "22.4 mph"],
  ] as const)("formats speed in %s units", (preferredUnitSystem, expected) => {
    expect(formatSpeedMetersPerSecond(10, { preferredUnitSystem })).toBe(expected);
  });

  it.each([
    ["metric", "5:00/km"],
    ["imperial", "8:03/mi"],
  ] as const)("formats running pace in %s units", (preferredUnitSystem, expected) => {
    expect(formatPaceSecondsPerKilometer(300, { preferredUnitSystem })).toBe(expected);
  });
});

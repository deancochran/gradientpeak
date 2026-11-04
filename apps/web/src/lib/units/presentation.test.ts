import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatElevation,
  formatMass,
  formatRunningPace,
  formatSpeed,
  formatTemperature,
  resolveViewingUserPreferredUnitSystem,
} from "./presentation";

describe("unit presentation", () => {
  it("formats canonical values in metric", () => {
    expect(formatDistance(5_000, "metric")).toBe("5.0 km");
    expect(formatElevation(250, "metric")).toBe("250.0 m");
    expect(formatSpeed(5, "metric")).toBe("18.0 km/h");
    expect(formatMass(70, "metric")).toBe("70.0 kg");
    expect(formatTemperature(20, "metric")).toBe("20.0 °C");
    expect(formatRunningPace(300, "metric")).toBe("5:00/km");
  });

  it("formats canonical values in imperial", () => {
    expect(formatDistance(5_000, "imperial")).toBe("3.1 mi");
    expect(formatElevation(250, "imperial")).toBe("820.2 ft");
    expect(formatSpeed(5, "imperial")).toBe("11.2 mph");
    expect(formatMass(70, "imperial")).toBe("154.3 lb");
    expect(formatTemperature(20, "imperial")).toBe("68.0 °F");
    expect(formatRunningPace(300, "imperial")).toBe("8:03/mi");
  });

  it("defaults absent or invalid profile preferences to metric", () => {
    expect(resolveViewingUserPreferredUnitSystem(undefined)).toBe("metric");
    expect(resolveViewingUserPreferredUnitSystem("customary")).toBe("metric");
    expect(resolveViewingUserPreferredUnitSystem("imperial")).toBe("imperial");
  });
});

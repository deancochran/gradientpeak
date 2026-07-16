import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatSpeed,
  summarizeActivityStreams,
} from "./activity-route-helpers";

describe("activity route unit presentation", () => {
  it("formats canonical activity values in metric", () => {
    expect(formatDistance(5_000, "metric")).toBe("5.0 km");
    expect(formatElevation(250, "metric")).toBe("250.0 m");
    expect(formatSpeed(5, "metric")).toBe("18.0 km/h");
    expect(formatPace(1000 / 300, "metric")).toBe("5:00/km");
  });

  it("formats canonical activity values in imperial, including stream summaries", () => {
    expect(formatDistance(5_000, "imperial")).toBe("3.1 mi");
    expect(formatElevation(250, "imperial")).toBe("820.2 ft");
    expect(formatSpeed(5, "imperial")).toBe("11.2 mph");
    expect(formatPace(1000 / 300, "imperial")).toBe("8:03/mi");
    expect(
      summarizeActivityStreams(
        [
          { altitude: 100, speed: 4 },
          { altitude: 200, speed: 5 },
        ],
        "imperial",
      ),
    ).toEqual([
      { label: "Speed peak", value: "11.2 mph" },
      { label: "Elevation range", value: "328.1 ft–656.2 ft" },
    ]);
  });
});

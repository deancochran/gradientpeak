import { describe, expect, it } from "vitest";
import {
  deriveActivityCategoryDisplay,
  deriveActivityTimingDisplay,
  deriveCurrentArtifactLabel,
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

  it("derives single and repeated multisport labels from ordered activity segments", () => {
    expect(
      deriveActivityCategoryDisplay([{ category: "run", ordinal: 0, role: "activity" }]),
    ).toEqual({ categories: ["run"], label: "Run", singleCategory: "run" });

    expect(
      deriveActivityCategoryDisplay([
        { category: "run", ordinal: 4, role: "activity" },
        { category: null, ordinal: 1, role: "transition" },
        { category: "run", ordinal: 0, role: "activity" },
        { category: "bike", ordinal: 2, role: "activity" },
      ]),
    ).toEqual({
      categories: ["run", "bike", "run"],
      label: "Run → Ride → Run",
      singleCategory: null,
    });
  });

  it("keeps unknown composition explicit", () => {
    expect(
      deriveActivityCategoryDisplay([
        { category: null, ordinal: 0, role: "unknown" },
        { category: null, ordinal: 1, role: "rest" },
      ]),
    ).toEqual({ categories: [], label: "Unknown activity", singleCategory: null });
  });

  it("uses elapsed time while respecting partial and unavailable timing coverage", () => {
    expect(
      deriveActivityTimingDisplay({
        active_ms: 3_300_000,
        elapsed_ms: 3_600_000,
        moving_ms: 3_000_000,
        timing_coverage: "partial",
      }),
    ).toEqual({
      activeSeconds: 3_300,
      coverage: "partial",
      elapsedSeconds: 3_600,
      movingSeconds: 3_000,
    });
    expect(
      deriveActivityTimingDisplay({
        active_ms: null,
        elapsed_ms: 3_600_000,
        moving_ms: null,
        timing_coverage: "unavailable",
      }),
    ).toEqual({
      activeSeconds: null,
      coverage: "unavailable",
      elapsedSeconds: 3_600,
      movingSeconds: null,
    });
  });

  it("describes current artifact presence without storage paths", () => {
    expect(deriveCurrentArtifactLabel(null)).toBeNull();
    expect(deriveCurrentArtifactLabel({ format: "fit", original_name: null })).toBe(
      "FIT activity file",
    );
    expect(deriveCurrentArtifactLabel({ format: "fit", original_name: "race.fit" })).toBe(
      "race.fit",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  formatCalibrationQuality,
  getActivityLoadLabels,
  getThresholdNextAction,
} from "./activity-load-presentation";

describe("activity load presentation", () => {
  it("distinguishes estimated summary HR Load from Stream HR Load", () => {
    expect(getActivityLoadLabels("heart_rate_threshold").load).toBe("Estimated HR Load");
    expect(getActivityLoadLabels("critical_power_threshold")).toEqual({
      load: "Estimated CP Load",
      intensity: "CP IF",
    });
  });

  it("describes guarded Critical Power calibration distinctly", () => {
    expect(
      formatCalibrationQuality(
        {
          source: "observed_effort",
          observed_at: "2026-07-12T12:00:00.000Z",
          stale: false,
          estimate: true,
          calculation_version: "critical-power-curve-fit-v1",
        },
        "2026-07-13T12:00:00.000Z",
      ),
    ).toContain("Multi-ride Critical Power estimate");
  });

  it("labels a stale 20-minute calibration as an estimate with age and source", () => {
    expect(
      formatCalibrationQuality(
        {
          source: "observed_effort",
          observed_at: "2026-01-01T00:00:00.000Z",
          stale: true,
          estimate: true,
        },
        "2026-04-11T00:00:00.000Z",
      ),
    ).toBe("20-minute effort estimate · 100d old · stale");
  });

  it("provides concise sport-specific threshold actions", () => {
    expect(getThresholdNextAction("bike")).toContain("Record qualifying bike activities");
    expect(getThresholdNextAction("run")).toContain("Record a qualifying 20-minute run effort");
    expect(getThresholdNextAction("swim")).toContain("Record a qualifying 20-minute swim effort");
    expect(getThresholdNextAction("strength")).toContain("sport-specific LTHR");
  });
});

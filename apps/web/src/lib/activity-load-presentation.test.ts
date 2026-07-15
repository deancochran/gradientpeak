import { describe, expect, it } from "vitest";
import {
  formatCalibrationQuality,
  getActivityLoadLabels,
  getThresholdNextAction,
} from "./activity-load-presentation";

describe("activity load presentation", () => {
  it("distinguishes estimated summary HR Load from Stream HR Load", () => {
    expect(getActivityLoadLabels("heart_rate_threshold").load).toBe("Estimated HR Load");
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
    expect(getThresholdNextAction("bike")).toContain("Set FTP");
    expect(getThresholdNextAction("run")).toContain("Set threshold pace");
    expect(getThresholdNextAction("swim")).toContain("Set CSS");
    expect(getThresholdNextAction("strength")).toContain("sport-specific LTHR");
  });
});

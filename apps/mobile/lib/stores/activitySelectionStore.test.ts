import { describe, expect, it } from "vitest";
import { defaultRecordLaunchPayload } from "./activitySelectionStore";

describe("defaultRecordLaunchPayload", () => {
  it("starts an indoor bike session without GPS", () => {
    expect(defaultRecordLaunchPayload()).toEqual({
      launchSource: "record_tab",
      activity_category: "bike",
      gpsRecordingEnabled: false,
    });
  });

  it("keeps GPS off when another activity is explicitly selected", () => {
    expect(defaultRecordLaunchPayload("run")).toMatchObject({
      activity_category: "run",
      gpsRecordingEnabled: false,
    });
  });
});

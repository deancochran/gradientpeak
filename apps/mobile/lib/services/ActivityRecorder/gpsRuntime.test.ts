import { describe, expect, it } from "vitest";

import {
  getNextGpsRecordingEnabled,
  shouldStartGpsTracking,
} from "./gpsRuntime";

describe("gpsRuntime", () => {
  it("toggles GPS recording state", () => {
    expect(getNextGpsRecordingEnabled(true)).toBe(false);
    expect(getNextGpsRecordingEnabled(false)).toBe(true);
  });

  it("starts GPS tracking only when GPS recording is enabled and state is active", () => {
    expect(shouldStartGpsTracking("recording", true)).toBe(true);
    expect(shouldStartGpsTracking("paused", true)).toBe(true);
    expect(shouldStartGpsTracking("ready", true)).toBe(false);
    expect(shouldStartGpsTracking("recording", false)).toBe(false);
  });
});

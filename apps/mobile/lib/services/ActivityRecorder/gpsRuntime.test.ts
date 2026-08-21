import { describe, expect, it } from "vitest";

import { getNextGpsRecordingEnabled, shouldStartGpsTracking } from "./gpsRuntime";

describe("gpsRuntime", () => {
  it("keeps GPS recording disabled for new live recordings", () => {
    expect(getNextGpsRecordingEnabled(true)).toBe(false);
    expect(getNextGpsRecordingEnabled(false)).toBe(false);
  });

  it("never starts GPS tracking", () => {
    expect(shouldStartGpsTracking("recording", true)).toBe(false);
    expect(shouldStartGpsTracking("paused", true)).toBe(false);
    expect(shouldStartGpsTracking("ready", true)).toBe(false);
    expect(shouldStartGpsTracking("recording", false)).toBe(false);
  });
});

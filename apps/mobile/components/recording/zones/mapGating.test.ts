import { describe, expect, it } from "vitest";

import { shouldShowZoneA } from "./mapGating";

describe("mapGating", () => {
  it("shows map zone when GPS recording is enabled", () => {
    expect(shouldShowZoneA(true, false)).toBe(true);
  });

  it("shows map zone when route is present even with GPS OFF", () => {
    expect(shouldShowZoneA(false, true)).toBe(true);
  });

  it("hides map zone when GPS is OFF and no route is attached", () => {
    expect(shouldShowZoneA(false, false)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { projectRoutePreview, validateRecordingSearch } from "./recording-web";

describe("validateRecordingSearch", () => {
  it("defaults to a run launcher state", () => {
    expect(validateRecordingSearch({})).toEqual({
      category: "run",
      gps: "on",
      eventId: undefined,
      routeId: undefined,
    });
  });

  it("keeps an explicit indoor gps override", () => {
    expect(validateRecordingSearch({ category: "bike", gps: "off", routeId: "route-1" })).toEqual({
      category: "bike",
      gps: "off",
      eventId: undefined,
      routeId: "route-1",
    });
  });
});

describe("projectRoutePreview", () => {
  it("returns svg-safe points for a route line", () => {
    const projection = projectRoutePreview([
      { latitude: 40, longitude: -105 },
      { latitude: 40.01, longitude: -105.02 },
      { latitude: 40.02, longitude: -105.01 },
    ]);

    expect(projection).not.toBeNull();
    expect(projection?.points).toContain(",");
    expect(projection?.start.x).toBeGreaterThan(0);
    expect(projection?.finish.y).toBeGreaterThan(0);
  });
});

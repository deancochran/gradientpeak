import { describe, expect, it } from "vitest";
import { projectRoutePreview, validateRecordingSearch } from "./recording-web";

describe("validateRecordingSearch", () => {
  it("defaults to an indoor run launcher", () => {
    expect(validateRecordingSearch({})).toEqual({
      activity_category: "run",
      gps: "off",
      eventId: undefined,
      activityPlanId: undefined,
      plannedSessionId: undefined,
      plannedSessionDate: undefined,
    });
  });

  it("forces indoor authored mode while retaining a valid selected route", () => {
    expect(
      validateRecordingSearch({
        activity_category: "bike",
        gps: "on",
        routeId: "11111111-1111-4111-8111-111111111111",
        personalize: true,
      }),
    ).toEqual({
      activity_category: "bike",
      gps: "off",
      routeId: "11111111-1111-4111-8111-111111111111",
      eventId: undefined,
      activityPlanId: undefined,
      plannedSessionId: undefined,
      plannedSessionDate: undefined,
    });
  });
});

describe("projectRoutePreview", () => {
  it("centers a narrow portrait route while retaining its relative start and finish positions", () => {
    const projection = projectRoutePreview([
      { latitude: 0, longitude: 0 },
      { latitude: 10, longitude: 1 },
    ]);

    expect(projection).not.toBeNull();
    if (!projection) return;

    expect((projection.start.x + projection.finish.x) / 2).toBeCloseTo(projection.width / 2);
    expect(projection.start.x).toBeCloseTo(projection.width - projection.finish.x);
    expect(projection.start.y).toBeGreaterThan(projection.finish.y);
    expect(projection.finish.y).toBeCloseTo(16);
    expect(projection.height - projection.start.y).toBeCloseTo(16);
  });

  it("centers a wide route while retaining its relative start and finish positions", () => {
    const projection = projectRoutePreview([
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 10 },
    ]);

    expect(projection).not.toBeNull();
    if (!projection) return;

    expect((projection.start.y + projection.finish.y) / 2).toBeCloseTo(projection.height / 2);
    expect(projection.finish.y).toBeCloseTo(projection.height - projection.start.y);
    expect(projection.start.x).toBeLessThan(projection.finish.x);
    expect(projection.start.x).toBeCloseTo(16);
    expect(projection.width - projection.finish.x).toBeCloseTo(16);
  });

  it("keeps its existing unavailable outcome when fewer than two points are present", () => {
    expect(projectRoutePreview([{ latitude: 40, longitude: -74 }])).toBeNull();
  });
});

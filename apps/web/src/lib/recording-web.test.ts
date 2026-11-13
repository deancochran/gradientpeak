import { describe, expect, it } from "vitest";
import { validateRecordingSearch } from "./recording-web";

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

import { describe, expect, it } from "vitest";
import { validateRecordingSearch } from "./recording-web";

describe("validateRecordingSearch", () => {
  it("defaults to an indoor run launcher", () => {
    expect(validateRecordingSearch({})).toEqual({
      activity_category: "run",
      gps: "off",
      eventId: undefined,
      activityPlanId: undefined,
    });
  });

  it("forces indoor authored mode and disregards legacy route and personalization values", () => {
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
      eventId: undefined,
      activityPlanId: undefined,
    });
  });
});

import { describe, expect, it } from "vitest";

import { isGroupEventGoing } from "../display-state";

describe("group event membership", () => {
  it("treats an absent RSVP as going", () => {
    expect(isGroupEventGoing({})).toBe(true);
  });

  it("lets an occurrence decline override the default or series, and clearing restores going", () => {
    expect(isGroupEventGoing({ occurrenceStatus: "declined" })).toBe(false);
    expect(isGroupEventGoing({ occurrenceStatus: "declined", seriesStatus: "accepted" })).toBe(
      false,
    );
    expect(isGroupEventGoing({ occurrenceStatus: null, seriesStatus: "declined" })).toBe(false);
    expect(isGroupEventGoing({ occurrenceStatus: "accepted", seriesStatus: "declined" })).toBe(
      true,
    );
    expect(isGroupEventGoing({ occurrenceStatus: null, seriesStatus: null })).toBe(true);
  });
});

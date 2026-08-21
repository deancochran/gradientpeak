import { describe, expect, it } from "vitest";

import { isGroupEventGoing, resolveGroupEventRsvpStatus } from "../display-state";

describe("group event membership", () => {
  it("keeps an absent RSVP distinct from an explicit going response", () => {
    expect(resolveGroupEventRsvpStatus({})).toBeNull();
    expect(isGroupEventGoing({})).toBe(true);
  });

  it("uses an occurrence response before the series response", () => {
    expect(
      resolveGroupEventRsvpStatus({ occurrenceStatus: "going", seriesStatus: "declined" }),
    ).toBe("going");
    expect(
      resolveGroupEventRsvpStatus({ occurrenceStatus: "declined", seriesStatus: "going" }),
    ).toBe("declined");
    expect(resolveGroupEventRsvpStatus({ seriesStatus: "declined" })).toBe("declined");
    expect(resolveGroupEventRsvpStatus({ seriesStatus: "going" })).toBe("going");

    expect(isGroupEventGoing({ occurrenceStatus: "declined" })).toBe(false);
    expect(isGroupEventGoing({ occurrenceStatus: "declined", seriesStatus: "going" })).toBe(false);
    expect(isGroupEventGoing({ occurrenceStatus: null, seriesStatus: "declined" })).toBe(false);
    expect(isGroupEventGoing({ occurrenceStatus: "going", seriesStatus: "declined" })).toBe(true);
    expect(isGroupEventGoing({ occurrenceStatus: null, seriesStatus: null })).toBe(true);
  });
});

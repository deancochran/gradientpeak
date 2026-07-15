import { describe, expect, it } from "vitest";
import { materializeRecurrenceOccurrences } from "../recurrence";

describe("materializeRecurrenceOccurrences", () => {
  it("keeps weekly local wall-clock times across a spring DST transition", () => {
    expect(
      materializeRecurrenceOccurrences({
        startsAt: "2026-03-01T14:30:00.000Z",
        endsAt: "2026-03-01T15:30:00.000Z",
        frequency: "WEEKLY",
        interval: 1,
        count: 3,
        recurrenceTimeZone: "America/New_York",
        eventTimeZone: "UTC",
      }),
    ).toEqual([
      {
        startsAt: "2026-03-01T14:30:00.000Z",
        endsAt: "2026-03-01T15:30:00.000Z",
        occurrenceKey: "2026-03-01",
      },
      {
        startsAt: "2026-03-08T13:30:00.000Z",
        endsAt: "2026-03-08T14:30:00.000Z",
        occurrenceKey: "2026-03-08",
      },
      {
        startsAt: "2026-03-15T13:30:00.000Z",
        endsAt: "2026-03-15T14:30:00.000Z",
        occurrenceKey: "2026-03-15",
      },
    ]);
  });

  it("falls back to the event timezone and preserves local dates across fall DST", () => {
    expect(
      materializeRecurrenceOccurrences({
        startsAt: "2026-10-25T16:00:00.000Z",
        endsAt: null,
        frequency: "WEEKLY",
        interval: 1,
        count: 3,
        eventTimeZone: "America/New_York",
      }),
    ).toEqual([
      {
        startsAt: "2026-10-25T16:00:00.000Z",
        endsAt: null,
        occurrenceKey: "2026-10-25",
      },
      {
        startsAt: "2026-11-01T17:00:00.000Z",
        endsAt: null,
        occurrenceKey: "2026-11-01",
      },
      {
        startsAt: "2026-11-08T17:00:00.000Z",
        endsAt: null,
        occurrenceKey: "2026-11-08",
      },
    ]);
  });
});

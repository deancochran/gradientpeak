import { describe, expect, it } from "vitest";
import { planZeroCorrectnessFixture } from "../../testing/plan-zero";
import { materializeRecurrenceOccurrences } from "../recurrence";

describe("materializeRecurrenceOccurrences", () => {
  it("keeps weekly local wall-clock times across a spring DST transition", () => {
    expect(materializeRecurrenceOccurrences(planZeroCorrectnessFixture.recurrence.input)).toEqual(
      planZeroCorrectnessFixture.recurrence.expectedOccurrences,
    );
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

import { describe, expect, it } from "vitest";

import {
  buildCalendarEventUpdatePatch,
  buildWeeklyRecurrence,
  formatEventTimeRange,
  getWeekWindow,
  shiftDateKey,
} from "./planning";

describe("calendar event scheduling", () => {
  it("formats a timed event in its event timezone rather than the browser timezone", () => {
    const event = {
      id: "event-1",
      starts_at: "2026-03-10T16:30:00.000Z",
      ends_at: "2026-03-10T17:45:00.000Z",
      timezone: "America/Los_Angeles",
    };

    expect(formatEventTimeRange(event)).toBe("9:30 AM - 10:45 AM");
  });

  it("preserves an all-day scheduled date in its compatibility instant and edit payload", () => {
    const patch = buildCalendarEventUpdatePatch({
      allDay: true,
      event: {
        id: "event-1",
        scheduled_date: "2026-03-10",
        starts_at: "2026-03-10T00:00:00.000Z",
        timezone: "Pacific/Auckland",
      },
      scheduledDate: "2026-03-10",
      title: "Rest day",
    });

    expect(patch).toMatchObject({
      all_day: true,
      scheduled_date: "2026-03-10",
      starts_at: "2026-03-10T00:00:00.000Z",
      timezone: "Pacific/Auckland",
    });
  });

  it("sends the canonical date while retaining timezone and wall time on timed edits", () => {
    const patch = buildCalendarEventUpdatePatch({
      allDay: false,
      event: {
        id: "event-1",
        starts_at: "2026-03-10T16:30:00.000Z",
        ends_at: "2026-03-10T17:30:00.000Z",
        timezone: "America/Los_Angeles",
      },
      notes: "  Bring water  ",
      scheduledDate: "2026-03-11",
      time: "09:30",
      title: "Tempo run",
    });

    expect(patch).toMatchObject({
      ends_at: "2026-03-11T17:30:00.000Z",
      notes: "Bring water",
      scheduled_date: "2026-03-11",
      starts_at: "2026-03-11T16:30:00.000Z",
      timezone: "America/Los_Angeles",
    });
  });
});

describe("planning navigation and recurrence", () => {
  it("builds stable Sunday-to-Saturday week windows and shifts canonical dates", () => {
    expect(getWeekWindow("2026-07-20")).toEqual({
      startKey: "2026-07-19",
      endKey: "2026-07-25",
      days: [
        "2026-07-19",
        "2026-07-20",
        "2026-07-21",
        "2026-07-22",
        "2026-07-23",
        "2026-07-24",
        "2026-07-25",
      ],
    });
    expect(shiftDateKey("2026-07-20", 7)).toBe("2026-07-27");
  });

  it("creates bounded weekly recurrence truth for the selected start day", () => {
    expect(
      buildWeeklyRecurrence({ count: 4, scheduledDate: "2026-07-20", timezone: "UTC" }),
    ).toEqual({
      rule: "FREQ=WEEKLY;INTERVAL=1;COUNT=4;BYDAY=MO",
      timezone: "UTC",
    });
    expect(
      buildWeeklyRecurrence({ count: 1, scheduledDate: "2026-07-20", timezone: "UTC" }),
    ).toBeNull();
  });
});

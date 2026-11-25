import { describe, expect, it } from "vitest";

import { eventDateForEditor, formatEventTime, getEventScheduledDate } from "../eventSchedule";

describe("event schedule presentation", () => {
  it("uses the event timezone for calendar and detail wall-time labels", () => {
    const event = {
      starts_at: "2026-06-02T16:30:00.000Z",
      scheduled_date: "2026-06-02",
      timezone: "America/Los_Angeles",
    };

    expect(formatEventTime(event.starts_at, event.timezone)).toBe("9:30 AM");
    expect(getEventScheduledDate(event)).toBe("2026-06-02");
  });

  it("projects a timed event into its timezone before handing it to the editor", () => {
    const editorDate = eventDateForEditor({
      starts_at: "2026-06-02T16:30:00.000Z",
      scheduled_date: "2026-06-02",
      timezone: "America/Los_Angeles",
    });

    expect(editorDate.getFullYear()).toBe(2026);
    expect(editorDate.getMonth()).toBe(5);
    expect(editorDate.getDate()).toBe(2);
    expect(editorDate.getHours()).toBe(9);
    expect(editorDate.getMinutes()).toBe(30);
  });

  it.each([
    ["UTC midnight", "2026-01-15T00:15:45.987Z", "UTC", [2026, 0, 15, 0, 15]],
    [
      "New York spring-forward",
      "2026-03-08T07:30:45.987Z",
      "America/New_York",
      [2026, 2, 8, 3, 30],
    ],
    ["New York fall-back", "2026-11-01T05:30:45.987Z", "America/New_York", [2026, 10, 1, 1, 30]],
    ["Kolkata", "2026-06-02T16:30:45.987Z", "Asia/Kolkata", [2026, 5, 2, 22, 0]],
  ])("keeps %s as event wall time and drops seconds for native inputs", (_, startsAt, timezone, expected) => {
    const editorDate = eventDateForEditor({ starts_at: startsAt, timezone });

    expect([
      editorDate.getFullYear(),
      editorDate.getMonth(),
      editorDate.getDate(),
      editorDate.getHours(),
      editorDate.getMinutes(),
      editorDate.getSeconds(),
      editorDate.getMilliseconds(),
    ]).toEqual([...expected, 0, 0]);
  });

  it("preserves the host-parsed instant for offsetless values before projecting it into the event zone", () => {
    const startsAt = "2026-06-02T16:30:45.987";
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(startsAt))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<"year" | "month" | "day" | "hour" | "minute", number>;
    const editorDate = eventDateForEditor({ starts_at: startsAt, timezone: "Asia/Kolkata" });

    expect([
      editorDate.getFullYear(),
      editorDate.getMonth(),
      editorDate.getDate(),
      editorDate.getHours(),
      editorDate.getMinutes(),
      editorDate.getSeconds(),
      editorDate.getMilliseconds(),
    ]).toEqual([values.year, values.month - 1, values.day, values.hour, values.minute, 0, 0]);
  });

  it("retains editor fallbacks for all-day, missing/invalid zones, and invalid instants", () => {
    const allDay = eventDateForEditor({
      all_day: true,
      scheduled_date: "2026-06-02",
      starts_at: "not-an-instant",
    });
    const rawInstant = new Date("2026-06-02T16:30:45.987Z");
    const invalidZone = eventDateForEditor({
      starts_at: rawInstant.toISOString(),
      timezone: "Not/AZone",
    });
    const invalidInstant = eventDateForEditor({ starts_at: "not-an-instant", timezone: "UTC" });

    expect([allDay.getFullYear(), allDay.getMonth(), allDay.getDate(), allDay.getHours()]).toEqual([
      2026, 5, 2, 12,
    ]);
    expect(eventDateForEditor({ starts_at: rawInstant.toISOString() }).getTime()).toBe(
      rawInstant.getTime(),
    );
    expect([
      invalidZone.getFullYear(),
      invalidZone.getMonth(),
      invalidZone.getDate(),
      invalidZone.getHours(),
      invalidZone.getMinutes(),
      invalidZone.getSeconds(),
      invalidZone.getMilliseconds(),
    ]).toEqual([
      rawInstant.getFullYear(),
      rawInstant.getMonth(),
      rawInstant.getDate(),
      rawInstant.getHours(),
      rawInstant.getMinutes(),
      0,
      0,
    ]);
    expect(Number.isNaN(invalidInstant.getTime())).toBe(false);
  });
});

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
});

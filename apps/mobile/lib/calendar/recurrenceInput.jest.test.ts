import { formatRecurrenceUntil, recurrenceEndDate } from "./recurrenceInput";

describe("recurrence date entry", () => {
  it.each([
    ["America/Los_Angeles", "20260309T065959Z"],
    ["Asia/Tokyo", "20260308T145959Z"],
    ["UTC", "20260308T235959Z"],
  ])("round trips the selected local end date in %s", (timezone, until) => {
    expect(formatRecurrenceUntil("2026-03-08", timezone)).toBe(until);
    expect(recurrenceEndDate(`FREQ=WEEKLY;UNTIL=${until}`, timezone)).toBe("2026-03-08");
  });

  it("preserves date-only rules and supports open-ended series", () => {
    expect(recurrenceEndDate("FREQ=DAILY;UNTIL=20260308", "Asia/Tokyo")).toBe("2026-03-08");
    expect(recurrenceEndDate("FREQ=DAILY")).toBeNull();
  });
});

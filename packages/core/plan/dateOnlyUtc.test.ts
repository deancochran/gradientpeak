import { describe, expect, it } from "vitest";

import { formatDateOnlyInTimeZone } from "./dateOnlyUtc";

describe("formatDateOnlyInTimeZone", () => {
  it.each([
    ["opposite UTC date west", "2026-01-01T00:30:00.000Z", "America/Los_Angeles", "2025-12-31"],
    ["opposite UTC date east", "2025-12-31T23:30:00.000Z", "Pacific/Kiritimati", "2026-01-01"],
    ["negative-offset date", "2026-07-01T03:30:00.000Z", "America/Adak", "2026-06-30"],
    ["DST spring transition", "2026-03-08T07:00:00.000Z", "America/New_York", "2026-03-08"],
    ["DST fall transition", "2026-11-01T06:00:00.000Z", "America/New_York", "2026-11-01"],
  ])("formats %s", (_caseName, instant, timeZone, expected) => {
    expect(formatDateOnlyInTimeZone(new Date(instant), timeZone)).toBe(expected);
  });
});

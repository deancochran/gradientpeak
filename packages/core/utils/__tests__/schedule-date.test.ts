import { describe, expect, it } from "vitest";
import {
  getScheduledDateKey,
  isValidIanaTimeZone,
  scheduledDateTimeToIsoInstant,
} from "../schedule-date";

describe("schedule-date helpers", () => {
  it("validates IANA zones", () => {
    expect(isValidIanaTimeZone("Pacific/Auckland")).toBe(true);
    expect(isValidIanaTimeZone("America/Los_Angeles")).toBe(true);
    expect(isValidIanaTimeZone("Mars/Olympus_Mons")).toBe(false);
  });

  it("derives date anchors in the requested zone and falls back to UTC", () => {
    expect(getScheduledDateKey("2026-03-01T12:00:00.000Z", "Pacific/Auckland")).toBe("2026-03-02");
    expect(getScheduledDateKey("2026-03-01T01:00:00.000Z", "America/Los_Angeles")).toBe(
      "2026-02-28",
    );
    expect(getScheduledDateKey("2026-03-01T01:00:00.000Z", "Invalid/Zone")).toBe("2026-03-01");
  });

  it("converts an unambiguous wall time to its ISO instant", () => {
    expect(
      scheduledDateTimeToIsoInstant({
        scheduledDate: "2026-01-15",
        time: "09:30",
        timeZone: "America/Los_Angeles",
      }),
    ).toBe("2026-01-15T17:30:00.000Z");
  });

  it("rejects invalid inputs and DST gaps or folds", () => {
    expect(() =>
      scheduledDateTimeToIsoInstant({
        scheduledDate: "2026-02-29",
        time: "09:30",
        timeZone: "America/Los_Angeles",
      }),
    ).toThrow(RangeError);
    expect(() =>
      scheduledDateTimeToIsoInstant({
        scheduledDate: "2026-03-08",
        time: "24:00",
        timeZone: "America/Los_Angeles",
      }),
    ).toThrow(RangeError);
    expect(() =>
      scheduledDateTimeToIsoInstant({
        scheduledDate: "2026-03-08",
        time: "02:30",
        timeZone: "America/Los_Angeles",
      }),
    ).toThrow("does not exist");
    expect(() =>
      scheduledDateTimeToIsoInstant({
        scheduledDate: "2026-11-01",
        time: "01:30",
        timeZone: "America/Los_Angeles",
      }),
    ).toThrow("ambiguous");
    expect(() =>
      scheduledDateTimeToIsoInstant({
        scheduledDate: "2026-03-08",
        time: "03:30",
        timeZone: "Invalid/Zone",
      }),
    ).toThrow("IANA");
  });
});

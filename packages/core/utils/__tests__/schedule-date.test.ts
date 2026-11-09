import { describe, expect, it } from "vitest";
import {
  endOfScheduledDateToIsoInstant,
  formatIsoInstantInIanaZone,
  getCalendarDateInIanaZone,
  isValidIanaTimeZone,
  scheduledDateTimeToIsoInstant,
} from "../schedule-date";

describe("schedule-date helpers", () => {
  it("validates IANA zones", () => {
    expect(isValidIanaTimeZone("Pacific/Auckland")).toBe(true);
    expect(isValidIanaTimeZone("America/Los_Angeles")).toBe(true);
    expect(isValidIanaTimeZone("Mars/Olympus_Mons")).toBe(false);
  });

  it("derives date anchors only in a valid requested zone", () => {
    expect(getCalendarDateInIanaZone("2026-03-01T12:00:00.000Z", "Pacific/Auckland")).toBe(
      "2026-03-02",
    );
    expect(getCalendarDateInIanaZone("2026-03-01T01:00:00.000Z", "America/Los_Angeles")).toBe(
      "2026-02-28",
    );
    expect(() => getCalendarDateInIanaZone("2026-03-01T01:00:00.000Z", "Invalid/Zone")).toThrow(
      RangeError,
    );
  });

  it("round-trips wall time across the extreme supported UTC offsets", () => {
    for (const fixture of [
      {
        instant: "2026-06-01T10:30:00.000Z",
        timeZone: "Pacific/Kiritimati",
        wallTime: "2026-06-02T00:30",
      },
      {
        instant: "2026-06-02T11:30:00.000Z",
        timeZone: "Pacific/Pago_Pago",
        wallTime: "2026-06-02T00:30",
      },
    ]) {
      expect(formatIsoInstantInIanaZone(fixture.instant, fixture.timeZone)).toBe(fixture.wallTime);
      const [scheduledDate, time] = fixture.wallTime.split("T");
      expect(
        scheduledDateTimeToIsoInstant({
          scheduledDate: scheduledDate ?? "",
          time: time ?? "",
          timeZone: fixture.timeZone,
        }),
      ).toBe(fixture.instant);
    }
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

  it("resolves east-of-UTC and DST date ends to their numerical instants", () => {
    expect(
      endOfScheduledDateToIsoInstant({
        scheduledDate: "2026-09-01",
        timeZone: "Asia/Tokyo",
      }),
    ).toBe("2026-09-01T14:59:59.999Z");
    expect(
      endOfScheduledDateToIsoInstant({
        scheduledDate: "2026-03-08",
        timeZone: "America/Los_Angeles",
      }),
    ).toBe("2026-03-09T06:59:59.999Z");
    expect(
      endOfScheduledDateToIsoInstant({
        scheduledDate: "2026-11-01",
        timeZone: "America/Los_Angeles",
      }),
    ).toBe("2026-11-02T07:59:59.999Z");
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

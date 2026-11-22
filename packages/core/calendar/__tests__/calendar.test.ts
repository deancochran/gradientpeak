import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDeviceCalendarDays,
  addDeviceCalendarMonths,
  endOfDeviceCalendarDateToIsoInstant,
  formatDeviceCalendarDate,
  getCalendarDateInIanaZone,
  getDeviceCalendarMonthEnd,
  getDeviceCalendarMonthStart,
  isValidDateOnlyUtc,
  parseDeviceCalendarDate,
  scheduledDateTimeToIsoInstant,
  startOfDeviceCalendarDateToIsoInstant,
} from "..";

const originalTimezone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});

afterAll(() => {
  if (originalTimezone) process.env.TZ = originalTimezone;
  else delete process.env.TZ;
});

describe("calendar API", () => {
  it("keeps host-device date arithmetic stable across DST transitions", () => {
    expect(addDeviceCalendarDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDeviceCalendarDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(startOfDeviceCalendarDateToIsoInstant("2026-03-08")).toBe("2026-03-08T08:00:00.000Z");
    expect(endOfDeviceCalendarDateToIsoInstant("2026-03-08")).toBe("2026-03-09T06:59:59.999Z");
    expect(startOfDeviceCalendarDateToIsoInstant("2026-11-01")).toBe("2026-11-01T07:00:00.000Z");
    expect(endOfDeviceCalendarDateToIsoInstant("2026-11-01")).toBe("2026-11-02T07:59:59.999Z");
  });

  it("round-trips device-local dates at noon and clamps month arithmetic", () => {
    const date = parseDeviceCalendarDate("2026-01-31");
    expect(formatDeviceCalendarDate(date)).toBe("2026-01-31");
    expect(date.getHours()).toBe(12);
    expect(addDeviceCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(getDeviceCalendarMonthStart("2026-02-17")).toBe("2026-02-01");
    expect(getDeviceCalendarMonthEnd("2026-02-17")).toBe("2026-02-28");
  });

  it("requires an explicit valid IANA zone", () => {
    const instant = "2026-03-08T07:30:00.000Z";
    expect(getCalendarDateInIanaZone(instant, "America/Los_Angeles")).toBe("2026-03-07");
    expect(() => getCalendarDateInIanaZone(instant, "Invalid/Zone")).toThrow("IANA");
  });

  it("rejects normalized dates and DST wall-clock gaps or folds", () => {
    expect(isValidDateOnlyUtc("2026-02-30")).toBe(false);
    expect(() => parseDeviceCalendarDate("2026-02-30")).toThrow(RangeError);
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
  });
});

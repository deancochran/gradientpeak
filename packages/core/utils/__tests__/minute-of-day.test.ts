import { describe, expect, it } from "vitest";
import {
  formatMinuteOfDaySummary,
  minuteOfDayToTimeInput,
  timeInputToMinuteOfDay,
} from "../minute-of-day";

describe("minute-of-day converters", () => {
  it("formats start and end boundaries for platform time inputs", () => {
    expect(minuteOfDayToTimeInput(0, "start")).toBe("00:00");
    expect(minuteOfDayToTimeInput(1439, "start")).toBe("23:59");
    expect(minuteOfDayToTimeInput(0, "end")).toBe("00:00");
    expect(minuteOfDayToTimeInput(1439, "end")).toBe("23:59");
  });

  it("preserves the end-of-day sentinel while remaining picker-compatible", () => {
    expect(minuteOfDayToTimeInput(1440, "end")).toBe("00:00");
    expect(formatMinuteOfDaySummary(1440, "end")).toBe("24:00");
    expect(timeInputToMinuteOfDay("00:00", "end")).toBe(1440);
    expect(timeInputToMinuteOfDay("00:00", "start")).toBe(0);
  });

  it.each([
    "0:00",
    "00:0",
    " 00:00",
    "00:00 ",
    "24:00",
    "23:60",
    "ab:cd",
  ])("rejects malformed or out-of-range platform input %s", (value) => {
    expect(() => timeInputToMinuteOfDay(value, "start")).toThrow(RangeError);
  });

  it("rejects invalid persisted boundaries", () => {
    expect(() => minuteOfDayToTimeInput(-1, "start")).toThrow(RangeError);
    expect(() => minuteOfDayToTimeInput(1440, "start")).toThrow(RangeError);
    expect(() => minuteOfDayToTimeInput(1441, "end")).toThrow(RangeError);
    expect(() => minuteOfDayToTimeInput(1.5, "end")).toThrow(RangeError);
  });
});

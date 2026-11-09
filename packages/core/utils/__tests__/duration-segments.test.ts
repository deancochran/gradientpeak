import { describe, expect, it } from "vitest";
import {
  durationMinutesToSeconds,
  durationSecondsToWholeMinutes,
  durationSegmentsApiText,
  durationSegmentsText,
  durationTextSegments,
  durationWheelValues,
  paceTextSegments,
  parseDurationSegmentInput,
  parseDurationSegments,
  splitDurationSeconds,
} from "../fitness-inputs";

describe("duration segment policies", () => {
  it("rejects unsupported runtime pace HM configuration rather than reinterpreting MS output", () => {
    expect(() => Reflect.apply(paceTextSegments, undefined, ["91:00", "hm"])).toThrow(
      /pace layout/i,
    );
  });
  it("retains the original source and seconds when HM cannot represent it", () => {
    const parts = durationTextSegments("1:30:45", "hm");
    expect(parts).toMatchObject({
      hours: "1",
      minutes: "30",
      seconds: "45",
      invalidText: "1:30:45",
    });
    expect(parseDurationSegmentInput(parts, { layout: "hm" })).toEqual({
      status: "invalid",
      reason: "precision",
    });
    expect(durationSegmentsApiText(parts, { layout: "hm" })).toBe("1:30:45");
    expect(splitDurationSeconds(5445, "hm")).toMatchObject({
      hours: "1",
      minutes: "30",
      seconds: "45",
      invalidText: "1:30:45",
    });
    expect(durationTextSegments("01:30:45", "hm").invalidText).toBe("01:30:45");
    expect(splitDurationSeconds(5445.5, "hm")).toMatchObject({
      minutes: "0",
      seconds: "5445.5",
      invalidText: "5445.5",
    });
    expect(durationTextSegments(parts.invalidText ?? "", "hms")).toEqual({
      hours: "1",
      minutes: "30",
      seconds: "45",
    });
  });
  it("reprojects valid configured units without changing canonical seconds or string APIs", () => {
    const ms = durationTextSegments("1:30:00", "ms");
    expect(ms).toEqual({ hours: "0", minutes: "90", seconds: "0" });
    expect(parseDurationSegments(ms, { layout: "ms" })).toBe(5400);
    expect(durationSegmentsApiText(ms, { layout: "ms" }, "hms")).toBe("1:30:00");
    expect(durationSegmentsApiText(ms, { layout: "ms" }, "ms")).toBe("90:00");
  });
  it("bounds wheel allocation while retaining a large current value and zero repair choices", () => {
    const parts = { hours: "0", minutes: "360000", seconds: "30" };
    const values = durationWheelValues("minutes", parts, { layout: "ms" });
    expect(values).toContain(360000);
    expect(values.length).toBeLessThan(260);
    expect(durationWheelValues("seconds", parts, { layout: "ms" })).toHaveLength(60);
    expect(
      durationSegmentsApiText(
        { hours: "", minutes: "", seconds: "0" },
        { allowOmittedSegments: true },
      ),
    ).toBe("0:00:00");
    expect(parseDurationSegments({ hours: "0", minutes: "0", seconds: "0" })).toBeNull();
  });
  it.each([
    195, 1542, 86400, 90001, 604800,
  ])("round-trips %s seconds without a global day cap", (seconds) => {
    const parts = splitDurationSeconds(seconds);
    expect(parseDurationSegments(parts)).toBe(seconds);
    expect(parseDurationSegments(durationTextSegments(durationSegmentsText(parts)))).toBe(seconds);
  });
  it("keeps step limits explicit and preserves over-limit text", () => {
    const parts = splitDurationSeconds(90000);
    expect(parts).toEqual({ hours: "25", minutes: "0", seconds: "0" });
    expect(parseDurationSegmentInput(parts, { maxSeconds: 86400 })).toEqual({
      status: "invalid",
      reason: "range",
    });
  });
  it("represents 150 canonical minutes as 2h30 without seconds or rounding", () => {
    const seconds = durationMinutesToSeconds(150);
    expect(seconds).toBe(9000);
    expect(splitDurationSeconds(seconds, "hm")).toEqual({
      hours: "2",
      minutes: "30",
      seconds: "0",
    });
    expect(durationSecondsToWholeMinutes(9000)).toBe(150);
    expect(durationSecondsToWholeMinutes(9001)).toBeUndefined();
    expect(
      parseDurationSegmentInput({ hours: "2", minutes: "30", seconds: "1" }, { layout: "hm" })
        .status,
    ).toBe("invalid");
    expect(
      parseDurationSegmentInput(splitDurationSeconds(9001, "hm"), { layout: "hm" }).status,
    ).toBe("invalid");
  });
  it("distinguishes empty and invalid without defaulting to zero or accepting locale punctuation", () => {
    expect(parseDurationSegmentInput(splitDurationSeconds(null))).toEqual({ status: "empty" });
    for (const value of ["1,5", "1.5", "1e2", "bad", "-1"])
      expect(parseDurationSegmentInput({ hours: "0", minutes: value, seconds: "0" }).status).toBe(
        "invalid",
      );
    expect(
      parseDurationSegmentInput(
        { hours: "", minutes: "25", seconds: "42" },
        { allowOmittedSegments: true },
      ),
    ).toEqual({ status: "valid", value: 1542 });
    expect(parseDurationSegmentInput({ hours: "0", minutes: "", seconds: "42" }).status).toBe(
      "invalid",
    );
    expect(
      parseDurationSegmentInput(durationTextSegments("4:3", "ms"), { layout: "ms" }).status,
    ).toBe("invalid");
  });
  it("keeps minutes unbounded for pace but bounded within hours", () => {
    expect(
      parseDurationSegments({ hours: "0", minutes: "65", seconds: "0" }, { layout: "ms" }),
    ).toBe(3900);
    expect(parseDurationSegments({ hours: "0", minutes: "65", seconds: "0" })).toBeNull();
  });
});

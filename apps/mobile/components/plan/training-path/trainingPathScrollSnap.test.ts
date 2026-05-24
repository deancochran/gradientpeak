import { describe, expect, it } from "vitest";
import {
  clampWeekIndex,
  getCenteredWeekIndex,
  getChartSideInset,
  getWeekScrollOffset,
} from "./trainingPathScrollSnap";

describe("trainingPathScrollSnap", () => {
  it("clamps week indexes to the available range", () => {
    expect(clampWeekIndex(-2, 4)).toBe(0);
    expect(clampWeekIndex(2, 4)).toBe(2);
    expect(clampWeekIndex(8, 4)).toBe(3);
    expect(clampWeekIndex(8, 0)).toBe(0);
  });

  it("resolves the centered week from snapped offsets", () => {
    expect(getCenteredWeekIndex(0, 46, 5)).toBe(0);
    expect(getCenteredWeekIndex(46, 46, 5)).toBe(1);
    expect(getCenteredWeekIndex(69, 46, 5)).toBe(2);
    expect(getCenteredWeekIndex(-20, 46, 5)).toBe(0);
    expect(getCenteredWeekIndex(999, 46, 5)).toBe(4);
  });

  it("derives stable scroll offsets and chart side insets", () => {
    expect(getWeekScrollOffset(3, 46)).toBe(138);
    expect(getWeekScrollOffset(-1, 46)).toBe(0);
    expect(getChartSideInset(320, 8)).toBe(152);
    expect(getChartSideInset(12, 8)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  calculateATL,
  calculateCTL,
  calculateTrainingLoadSeries,
} from "../../calculations";

describe("training load age adjustments", () => {
  it("falls back to baseline constants when age is undefined", () => {
    expect(calculateCTL(50, 80)).toBe(calculateCTL(50, 80, undefined));
    expect(calculateATL(50, 80)).toBe(calculateATL(50, 80, undefined));
  });

  it("uses slower ATL decay for older athletes", () => {
    const youngerAtl = calculateATL(100, 0, 25);
    const olderAtl = calculateATL(100, 0, 55);

    expect(olderAtl).toBeGreaterThan(youngerAtl);
  });

  it("uses slower CTL decay for older athletes", () => {
    const youngerCtl = calculateCTL(100, 0, 25);
    const olderCtl = calculateCTL(100, 0, 55);

    expect(olderCtl).toBeGreaterThan(youngerCtl);
  });

  it("threads age through training load series", () => {
    const dailyTss = [0, 0, 0, 0, 0, 0, 0];

    const younger = calculateTrainingLoadSeries(dailyTss, 50, 50, 25);
    const older = calculateTrainingLoadSeries(dailyTss, 50, 50, 55);

    const youngerLast = younger[younger.length - 1];
    const olderLast = older[older.length - 1];

    expect(youngerLast).toBeDefined();
    expect(olderLast).toBeDefined();
    expect(olderLast!.atl).toBeGreaterThan(youngerLast!.atl);
  });
});

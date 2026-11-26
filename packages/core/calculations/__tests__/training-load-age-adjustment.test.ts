import { describe, expect, it } from "vitest";
import {
  calculateCommonLoadFitnessSeries,
  calculateLongTermLoad,
  calculateRecentLoad,
} from "../../load/progression";
import { requireFixtureValue } from "../../testing/requireFixtureValue";

describe("training load age adjustments", () => {
  it("falls back to baseline constants when age is undefined", () => {
    expect(calculateLongTermLoad(50, 80)).toBe(calculateLongTermLoad(50, 80, undefined));
    expect(calculateRecentLoad(50, 80)).toBe(calculateRecentLoad(50, 80, undefined));
  });

  it("uses slower RecentLoad decay for older athletes", () => {
    const youngerRecentLoad = calculateRecentLoad(100, 0, 25);
    const olderRecentLoad = calculateRecentLoad(100, 0, 55);

    expect(olderRecentLoad).toBeGreaterThan(youngerRecentLoad);
  });

  it("uses slower LongTermLoad decay for older athletes", () => {
    const youngerLongTermLoad = calculateLongTermLoad(100, 0, 25);
    const olderLongTermLoad = calculateLongTermLoad(100, 0, 55);

    expect(olderLongTermLoad).toBeGreaterThan(youngerLongTermLoad);
  });

  it("threads age through training load series", () => {
    const dailyLoad = [0, 0, 0, 0, 0, 0, 0];

    const younger = calculateCommonLoadFitnessSeries(dailyLoad, 50, 50, 25);
    const older = calculateCommonLoadFitnessSeries(dailyLoad, 50, 50, 55);

    const youngerLast = younger[younger.length - 1];
    const olderLast = older[older.length - 1];

    expect(youngerLast).toBeDefined();
    expect(olderLast).toBeDefined();
    expect(
      requireFixtureValue(olderLast, "expected older series result").recentLoad,
    ).toBeGreaterThan(
      requireFixtureValue(youngerLast, "expected younger series result").recentLoad,
    );
  });
});

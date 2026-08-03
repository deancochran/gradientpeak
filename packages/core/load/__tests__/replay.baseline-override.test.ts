import { describe, expect, it } from "vitest";
import { buildDailyLoadByDateSeries, replayCommonLoadFitnessByDate } from "../replay";
import { homeTrendsBaselineOverrideFixture } from "./fixtures/home-trends-baseline-override";

describe("replay baseline override fixture", () => {
  it("matches the home/trends pre-window decay and replay path", () => {
    const fixture = homeTrendsBaselineOverrideFixture;

    const decaySeries = buildDailyLoadByDateSeries({
      startDate: fixture.overrideDate,
      endDate: "2026-01-04",
      loadByDate: {},
    });
    const decayReplay = replayCommonLoadFitnessByDate({
      dailyLoad: decaySeries,
      initialLongTermLoad: fixture.overrideLongTermLoad,
      initialRecentLoad: fixture.overrideRecentLoad,
    });
    const decayedStart = decayReplay.at(-1);

    expect(decayedStart?.longTermLoad ?? 0).toBeLessThan(fixture.overrideLongTermLoad);
    expect(decayedStart?.recentLoad ?? 0).toBeLessThan(fixture.overrideRecentLoad);

    const historyReplay = replayCommonLoadFitnessByDate({
      dailyLoad: buildDailyLoadByDateSeries({
        startDate: fixture.historyStart,
        endDate: fixture.historyEnd,
        loadByDate: fixture.loadByDate,
      }),
      initialLongTermLoad: decayedStart?.longTermLoad,
      initialRecentLoad: decayedStart?.recentLoad,
    });

    expect(historyReplay.map((point) => point.date)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
    ]);
    expect(historyReplay[1]?.load).toBe(55);
    expect(historyReplay[1]?.longTermLoad ?? 0).toBeGreaterThan(
      historyReplay[0]?.longTermLoad ?? 0,
    );
  });
});

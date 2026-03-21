import { describe, expect, it } from "vitest";
import { buildDailyTssByDateSeries, replayTrainingLoadByDate } from "../replay";
import { homeTrendsBaselineOverrideFixture } from "./fixtures/home-trends-baseline-override";

describe("replay baseline override fixture", () => {
  it("matches the home/trends pre-window decay and replay path", () => {
    const fixture = homeTrendsBaselineOverrideFixture;

    const decaySeries = buildDailyTssByDateSeries({
      startDate: fixture.overrideDate,
      endDate: "2026-01-04",
      tssByDate: {},
    });
    const decayReplay = replayTrainingLoadByDate({
      dailyTss: decaySeries,
      initialCTL: fixture.overrideCtl,
      initialATL: fixture.overrideAtl,
    });
    const decayedStart = decayReplay.at(-1);

    expect(decayedStart?.ctl ?? 0).toBeLessThan(fixture.overrideCtl);
    expect(decayedStart?.atl ?? 0).toBeLessThan(fixture.overrideAtl);

    const historyReplay = replayTrainingLoadByDate({
      dailyTss: buildDailyTssByDateSeries({
        startDate: fixture.historyStart,
        endDate: fixture.historyEnd,
        tssByDate: fixture.tssByDate,
      }),
      initialCTL: decayedStart?.ctl,
      initialATL: decayedStart?.atl,
    });

    expect(historyReplay.map((point) => point.date)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
    ]);
    expect(historyReplay[1]?.tss).toBe(55);
    expect(historyReplay[1]?.ctl ?? 0).toBeGreaterThan(historyReplay[0]?.ctl ?? 0);
  });
});

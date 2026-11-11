import { describe, expect, it } from "vitest";
import { buildDailyLoadByDateSeries, replayCommonLoadFitnessByDate } from "../replay";

describe("load replay baseline overrides", () => {
  it("supports decaying an override before replaying in-window history", () => {
    const decaySeries = buildDailyLoadByDateSeries({
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      loadByDate: {},
    });
    const decayed = replayCommonLoadFitnessByDate({
      dailyLoad: decaySeries,
      initialLongTermLoad: 80,
      initialRecentLoad: 95,
    });
    const seed = decayed.at(-1);

    const historySeries = buildDailyLoadByDateSeries({
      startDate: "2026-01-11",
      endDate: "2026-01-14",
      loadByDate: {
        "2026-01-12": 60,
        "2026-01-14": 40,
      },
    });
    const replayed = replayCommonLoadFitnessByDate({
      dailyLoad: historySeries,
      initialLongTermLoad: seed?.longTermLoad ?? 0,
      initialRecentLoad: seed?.recentLoad ?? 0,
    });

    expect(seed?.longTermLoad).toBeLessThan(80);
    expect(seed?.recentLoad).toBeLessThan(95);
    // A 60 Common Load day remains below the decayed LongTermLoad seed under the version 2
    // 1-exp(-1/N) response, so the longer-term load history still decreases.
    expect(replayed[1]?.longTermLoad).toBeLessThan(replayed[0]?.longTermLoad ?? 0);
    expect(replayed[3]?.load).toBe(40);
  });

  it("supports override cutover by replaying only post-override history", () => {
    const replayed = replayCommonLoadFitnessByDate({
      dailyLoad: buildDailyLoadByDateSeries({
        startDate: "2026-03-05",
        endDate: "2026-03-07",
        loadByDate: {
          "2026-03-05": 100,
          "2026-03-06": 0,
          "2026-03-07": 50,
        },
      }),
      initialLongTermLoad: 45,
      initialRecentLoad: 55,
    });

    expect(replayed[0]?.date).toBe("2026-03-05");
    expect(replayed).toHaveLength(3);
    expect(replayed[2]?.longTermLoad).toBeGreaterThan(45);
  });
});

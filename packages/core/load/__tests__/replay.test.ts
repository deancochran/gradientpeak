import { describe, expect, it } from "vitest";
import { buildDailyTssByDateSeries, replayTrainingLoadByDate } from "../replay";

describe("load replay baseline overrides", () => {
  it("supports decaying an override before replaying in-window history", () => {
    const decaySeries = buildDailyTssByDateSeries({
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      tssByDate: {},
    });
    const decayed = replayTrainingLoadByDate({
      dailyTss: decaySeries,
      initialCTL: 80,
      initialATL: 95,
    });
    const seed = decayed.at(-1);

    const historySeries = buildDailyTssByDateSeries({
      startDate: "2026-01-11",
      endDate: "2026-01-14",
      tssByDate: {
        "2026-01-12": 60,
        "2026-01-14": 40,
      },
    });
    const replayed = replayTrainingLoadByDate({
      dailyTss: historySeries,
      initialCTL: seed?.ctl ?? 0,
      initialATL: seed?.atl ?? 0,
    });

    expect(seed?.ctl).toBeLessThan(80);
    expect(seed?.atl).toBeLessThan(95);
    expect(replayed[1]?.ctl).toBeGreaterThan(replayed[0]?.ctl ?? 0);
    expect(replayed[3]?.tss).toBe(40);
  });

  it("supports override cutover by replaying only post-override history", () => {
    const replayed = replayTrainingLoadByDate({
      dailyTss: buildDailyTssByDateSeries({
        startDate: "2026-03-05",
        endDate: "2026-03-07",
        tssByDate: {
          "2026-03-05": 100,
          "2026-03-06": 0,
          "2026-03-07": 50,
        },
      }),
      initialCTL: 45,
      initialATL: 55,
    });

    expect(replayed[0]?.date).toBe("2026-03-05");
    expect(replayed).toHaveLength(3);
    expect(replayed[2]?.ctl).toBeGreaterThan(45);
  });
});

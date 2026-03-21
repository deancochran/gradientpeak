import { describe, expect, it } from "vitest";
import { getFormStatus, getFormStatusColor } from "../form";
import {
  calculateATL,
  calculateCTL,
  calculateTrainingLoadSeries,
  calculateTSB,
} from "../progression";
import { calculateRampRate, isRampRateSafe } from "../ramp";
import { buildDailyTssByDateSeries, replayTrainingLoadByDate } from "../replay";

describe("load progression", () => {
  it("matches expected TSB from CTL and ATL", () => {
    expect(calculateTSB(60, 48)).toBe(12);
  });

  it("threads age through training load series", () => {
    const dailyTss = [0, 0, 0, 0, 0, 0, 0];
    const younger = calculateTrainingLoadSeries(dailyTss, 50, 50, 25);
    const older = calculateTrainingLoadSeries(dailyTss, 50, 50, 55);

    expect(older.at(-1)?.atl).toBeGreaterThan(younger.at(-1)?.atl ?? 0);
    expect(older.at(-1)?.ctl).toBeGreaterThan(younger.at(-1)?.ctl ?? 0);
  });

  it("replays date keyed history with zero-filled series", () => {
    const dailyTss = buildDailyTssByDateSeries({
      startDate: "2026-03-01",
      endDate: "2026-03-03",
      tssByDate: { "2026-03-02": 75 },
    });

    expect(dailyTss).toEqual([
      { date: "2026-03-01", tss: 0 },
      { date: "2026-03-02", tss: 75 },
      { date: "2026-03-03", tss: 0 },
    ]);

    const replayed = replayTrainingLoadByDate({ dailyTss, initialCTL: 10, initialATL: 10 });
    expect(replayed).toHaveLength(3);
    expect(replayed[1]?.ctl).toBeGreaterThan(replayed[0]?.ctl ?? 0);
  });

  it("provides form and ramp helpers from canonical modules", () => {
    expect(getFormStatus(8)).toBe("optimal");
    expect(getFormStatusColor(-40)).toBe("#ef4444");
    expect(calculateRampRate(60, 54)).toBe(6);
    expect(isRampRateSafe(6, 8)).toBe(true);
    expect(isRampRateSafe(9, 8)).toBe(false);
  });

  it("keeps baseline constants when age is undefined", () => {
    expect(calculateCTL(50, 80)).toBe(calculateCTL(50, 80, undefined));
    expect(calculateATL(50, 80)).toBe(calculateATL(50, 80, undefined));
  });
});

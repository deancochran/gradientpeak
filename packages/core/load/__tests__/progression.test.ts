import { describe, expect, it } from "vitest";
import { TSS_CONSTANTS as LOAD_TSS_CONSTANTS } from "../../constants/load";
import { TSS_CONSTANTS as TRAINING_TSS_CONSTANTS } from "../../constants/training";
import { getFormStatus, getFormStatusColor, getLoadBalanceStatus } from "../form";
import {
  calculateATL,
  calculateCTL,
  calculateTrainingLoadSeries,
  calculateTSB,
} from "../progression";
import { calculateRampRate, isRampRateSafe } from "../ramp";
import { buildDailyTssByDateSeries, replayTrainingLoadByDate } from "../replay";

describe("load progression", () => {
  it("uses the documented one-day response for exact 42-day and 7-day constants", () => {
    expect(calculateCTL(0, 100)).toBe(100 * (1 - Math.exp(-1 / 42)));
    expect(calculateATL(0, 100)).toBe(100 * (1 - Math.exp(-1 / 7)));
  });

  it("starts an empty history deterministically and treats missing personalization as baseline", () => {
    expect(calculateTrainingLoadSeries([])).toEqual([]);
    expect(calculateTrainingLoadSeries([100])).toEqual([
      {
        date: 0,
        tss: 100,
        ctl: 100 * (1 - Math.exp(-1 / 42)),
        atl: 100 * (1 - Math.exp(-1 / 7)),
        tsb: 100 * (1 - Math.exp(-1 / 42)) - 100 * (1 - Math.exp(-1 / 7)),
      },
    ]);
    expect(calculateATL(0, 100, undefined, null, undefined)).toBe(calculateATL(0, 100));
  });

  it("publishes exact versioned exponential constants consistently", () => {
    for (const constants of [LOAD_TSS_CONSTANTS, TRAINING_TSS_CONSTANTS]) {
      expect(constants.LOAD_MODEL_VERSION).toBe(2);
      expect(constants.EXPONENTIAL_CONVENTION).toBe("one_minus_exp_negative_inverse_time_constant");
      expect(constants.CTL_TIME_CONSTANT).toBe(42);
      expect(constants.ATL_TIME_CONSTANT).toBe(7);
      expect(constants.CTL_ALPHA).toBe(1 - Math.exp(-1 / constants.CTL_TIME_CONSTANT));
      expect(constants.ATL_ALPHA).toBe(1 - Math.exp(-1 / constants.ATL_TIME_CONSTANT));
    }
  });

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
    expect(getLoadBalanceStatus(30)).toBe("high_positive_balance");
    expect(getLoadBalanceStatus(8)).toBe("positive_balance");
    expect(getLoadBalanceStatus(0)).toBe("near_balance");
    expect(getLoadBalanceStatus(-20)).toBe("negative_balance");
    expect(getLoadBalanceStatus(-40)).toBe("high_negative_balance");
    // Deprecated compatibility mapping remains stable for existing callers.
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

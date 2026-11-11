import { describe, expect, it } from "vitest";
import { COMMON_LOAD_CONSTANTS as LOAD_COMMON_LOAD_CONSTANTS } from "../../constants/load";
import { COMMON_LOAD_CONSTANTS as TRAINING_COMMON_LOAD_CONSTANTS } from "../../constants/training";
import { getLoadBalanceStatus } from "../form";
import {
  calculateCommonLoadFitnessSeries,
  calculateLoadBalance,
  calculateLongTermLoad,
  calculateRecentLoad,
} from "../progression";
import { calculateRampRate, isRampRateSafe } from "../ramp";
import { buildDailyLoadByDateSeries, replayCommonLoadFitnessByDate } from "../replay";

describe("load progression", () => {
  it("uses the documented one-day response for exact 42-day and 7-day constants", () => {
    expect(calculateLongTermLoad(0, 100)).toBe(100 * (1 - Math.exp(-1 / 42)));
    expect(calculateRecentLoad(0, 100)).toBe(100 * (1 - Math.exp(-1 / 7)));
  });

  it("starts an empty history deterministically and treats missing personalization as baseline", () => {
    expect(calculateCommonLoadFitnessSeries([])).toEqual([]);
    expect(calculateCommonLoadFitnessSeries([100])).toEqual([
      {
        date: 0,
        load: 100,
        longTermLoad: 100 * (1 - Math.exp(-1 / 42)),
        recentLoad: 100 * (1 - Math.exp(-1 / 7)),
        loadBalance: 100 * (1 - Math.exp(-1 / 42)) - 100 * (1 - Math.exp(-1 / 7)),
      },
    ]);
    expect(calculateRecentLoad(0, 100, undefined, null, undefined)).toBe(
      calculateRecentLoad(0, 100),
    );
  });

  it("publishes exact versioned exponential constants consistently", () => {
    for (const constants of [LOAD_COMMON_LOAD_CONSTANTS, TRAINING_COMMON_LOAD_CONSTANTS]) {
      expect(constants.LOAD_MODEL_VERSION).toBe(2);
      expect(constants.EXPONENTIAL_CONVENTION).toBe("one_minus_exp_negative_inverse_time_constant");
      expect(constants.LongTermLoad_TIME_CONSTANT).toBe(42);
      expect(constants.RecentLoad_TIME_CONSTANT).toBe(7);
      expect(constants.LongTermLoad_ALPHA).toBe(
        1 - Math.exp(-1 / constants.LongTermLoad_TIME_CONSTANT),
      );
      expect(constants.RecentLoad_ALPHA).toBe(
        1 - Math.exp(-1 / constants.RecentLoad_TIME_CONSTANT),
      );
    }
  });

  it("matches expected LoadBalance from LongTermLoad and RecentLoad", () => {
    expect(calculateLoadBalance(60, 48)).toBe(12);
  });

  it("threads age through training load series", () => {
    const dailyLoad = [0, 0, 0, 0, 0, 0, 0];
    const younger = calculateCommonLoadFitnessSeries(dailyLoad, 50, 50, 25);
    const older = calculateCommonLoadFitnessSeries(dailyLoad, 50, 50, 55);

    expect(older.at(-1)?.recentLoad).toBeGreaterThan(younger.at(-1)?.recentLoad ?? 0);
    expect(older.at(-1)?.longTermLoad).toBeGreaterThan(younger.at(-1)?.longTermLoad ?? 0);
  });

  it("replays date keyed history with zero-filled series", () => {
    const dailyLoad = buildDailyLoadByDateSeries({
      startDate: "2026-03-01",
      endDate: "2026-03-03",
      loadByDate: { "2026-03-02": 75 },
    });

    expect(dailyLoad).toEqual([
      { date: "2026-03-01", load: 0 },
      { date: "2026-03-02", load: 75 },
      { date: "2026-03-03", load: 0 },
    ]);

    const replayed = replayCommonLoadFitnessByDate({
      dailyLoad,
      initialLongTermLoad: 10,
      initialRecentLoad: 10,
    });
    expect(replayed).toHaveLength(3);
    expect(replayed[1]?.longTermLoad).toBeGreaterThan(replayed[0]?.longTermLoad ?? 0);
  });

  it("provides load balance and ramp helpers from canonical modules", () => {
    expect(getLoadBalanceStatus(30)).toBe("high_positive_balance");
    expect(getLoadBalanceStatus(8)).toBe("positive_balance");
    expect(getLoadBalanceStatus(0)).toBe("near_balance");
    expect(getLoadBalanceStatus(-20)).toBe("negative_balance");
    expect(getLoadBalanceStatus(-40)).toBe("high_negative_balance");
    expect(calculateRampRate(60, 54)).toBe(6);
    expect(isRampRateSafe(6, 8)).toBe(true);
    expect(isRampRateSafe(9, 8)).toBe(false);
  });

  it("keeps baseline constants when age is undefined", () => {
    expect(calculateLongTermLoad(50, 80)).toBe(calculateLongTermLoad(50, 80, undefined));
    expect(calculateRecentLoad(50, 80)).toBe(calculateRecentLoad(50, 80, undefined));
  });
});

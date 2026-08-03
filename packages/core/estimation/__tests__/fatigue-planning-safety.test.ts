import { describe, expect, it } from "vitest";

import { estimateWeeklyLoadComplete, predictFatigue } from "../index";

const scheduledDate = new Date("2026-07-13T09:00:00.000Z");

describe("fatigue planning language", () => {
  it("returns descriptive states and no physiological clearance language", () => {
    const prediction = predictFatigue(500, scheduledDate, {
      recentLoad: 40,
      longTermLoad: 40,
      loadBalance: 0,
    });
    const userFacingText = [
      ...prediction.warnings,
      prediction.weeklyProjection.recommendation,
    ].join(" ");

    expect(prediction.weeklyProjection.loadChangeState).toBe("increasing");
    expect(prediction.weeklyProjection.reasons).toContain("LOAD_CHANGE_INCREASING");
    expect(userFacingText).not.toMatch(
      /safe|dangerous|overtraining|overreaching|clear(?:ed|ance)/i,
    );
  });

  it("abstains when the fitness state is incomplete", () => {
    const prediction = predictFatigue(60, scheduledDate, {
      recentLoad: Number.NaN,
      longTermLoad: Number.NaN,
      loadBalance: Number.NaN,
    });

    expect(prediction.weeklyProjection.loadChangeState).toBe("insufficient_data");
    expect(prediction.weeklyProjection.reasons).toEqual(["MISSING_FITNESS_STATE"]);
    expect(prediction.weeklyProjection.recommendation).toContain("unavailable");
  });

  it("propagates descriptive state and reasons through the complete weekly result", () => {
    const result = estimateWeeklyLoadComplete(scheduledDate, [], {
      recentLoad: Number.NaN,
      longTermLoad: Number.NaN,
      loadBalance: Number.NaN,
    });

    expect(result.loadChangeState).toBe("insufficient_data");
    expect(result.reasons).toEqual(["MISSING_FITNESS_STATE"]);
  });
});

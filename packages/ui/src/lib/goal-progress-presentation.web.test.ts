import type { ThresholdGoalProgressResult } from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  formatGoalGap,
  formatGoalThresholdValue,
  formatGoalTimeLeft,
} from "./goal-progress-presentation";

function progress(
  category: "bike" | "run" | "swim",
  unit: "watts" | "meters_per_second",
  remainingGap: number | null,
): Exclude<ThresholdGoalProgressResult, { status: "unsupported" }> {
  return {
    status: "on_track",
    reason: "observed_rate_meets_required_rate",
    goalId: "goal-1",
    assessedAt: "2026-02-01T00:00:00Z",
    deadlineAt: "2026-06-01T00:00:00Z",
    target: {
      activityCategory: category,
      metric: unit === "watts" ? "power" : "speed",
      unit,
      targetValue: unit === "watts" ? 250 : 5,
      achievementValue: unit === "watts" ? 250 : category === "swim" ? 1.2 : 4.5,
    },
    baseline: null,
    current: {
      activityCategory: category,
      metric: unit === "watts" ? "power" : "speed",
      unit,
      value: unit === "watts" ? 240 : category === "swim" ? 1 : 4,
      thresholdId: "threshold-1",
      confidence: 0.8,
      effectiveAt: "2026-02-01T00:00:00Z",
      sourceActivityIds: [],
      freshness: "fresh",
    },
    metrics: {
      targetGap: remainingGap,
      remainingGap,
      changeFromBaseline: null,
      progressRatio: null,
      progressPercent: null,
      observedRatePerDay: null,
      requiredRatePerDay: null,
    },
    evidence: { observationCount: 1, observedSpanDays: null },
  };
}

describe("goal progress presentation", () => {
  it.each([
    ["bike", 0, "0 W"],
    ["bike", 285.5, "286 W"],
    ["bike", 999.5, "1000 W"],
    ["run", 1000, "0:01 /km"],
    ["run", 1000 / 59.4, "0:59 /km"],
    ["run", 1000 / 59.5, "1:00 /km"],
    ["swim", 1, "1:40 /100m"],
    ["swim", 100 / 59.5, "1:00 /100m"],
    ["run", 0, "—"],
    ["swim", -1, "—"],
    ["bike", Number.NaN, "NaN W"],
    ["run", Number.POSITIVE_INFINITY, "0:00 /km"],
    ["swim", Number.NaN, "NaN:NaN /100m"],
  ] as const)("formats threshold values", (category, value, expected) => {
    expect(formatGoalThresholdValue(category, value)).toBe(expected);
  });

  it.each([
    [progress("bike", "watts", 10), "10 W"],
    [progress("run", "meters_per_second", 0.5), "28 s/km"],
    [progress("swim", "meters_per_second", 0.2), "17 s/100m"],
    [progress("run", "meters_per_second", 0), "0 s/km"],
    [progress("bike", "watts", null), "Unavailable"],
  ])("formats the remaining gap", (value, expected) => {
    expect(formatGoalGap(value)).toBe(expected);
  });

  it.each([
    ["2028-02-29", "2028-02-28", "1 day left"],
    ["2028-02-29", "2028-02-29", "Due today"],
    ["2028-02-28", "2028-02-29", "1 day overdue"],
    [null, "2028-02-29", "Unavailable"],
    ["2028-02-30", "2028-02-29", "Unavailable"],
  ])("formats date-only time left at boundaries", (deadline, today, expected) => {
    expect(formatGoalTimeLeft(deadline, today)).toBe(expected);
  });
});

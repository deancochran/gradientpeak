import type { ThresholdGoalProgressResult } from "@repo/core";
import { describe, expect, it } from "vitest";
import { formatGoalGap, formatGoalTimeLeft } from "./goal-progress-presentation";

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

import { describe, expect, it, vi } from "vitest";

vi.mock("lucide-react-native", () => ({
  Activity: () => null,
  BarChart3: () => null,
  Flame: () => null,
  Gauge: () => null,
  HeartPulse: () => null,
  Moon: () => null,
  Scale: () => null,
  Sparkles: () => null,
  TrendingUp: () => null,
  Zap: () => null,
}));

import { type ActivityInsightInputs, buildActivityInsights } from "./insights";

const unrelatedInputs = {
  volume: {
    dataPoints: [{ date: "2026-07-20", totalTime: 3600 }],
    totals: { totalActivities: 1, totalDistance: 10_000, totalTime: 3600 },
  },
  consistency: {
    activityDays: ["2026-07-20"],
    currentStreak: 1,
    longestStreak: 2,
    totalActivities: 3,
    weeklyAvg: 1.5,
  },
  performance: undefined,
  zones: undefined,
  peakPower: undefined,
} satisfies Omit<ActivityInsightInputs, "load">;

describe("buildActivityInsights common load history", () => {
  it("maps all available points and the final previous-day values to canonical labels", () => {
    const points = Array.from({ length: 84 }, (_, index) => ({
      date: `2026-${index < 62 ? "05" : "06"}-${String((index % 28) + 1).padStart(2, "0")}`,
      dailyLoad: index + 1,
      longTermLoad: index + 2,
      recentLoad: index + 3,
      loadBalance: index - 40,
    }));
    points[83] = {
      date: "2026-07-21",
      dailyLoad: 84,
      longTermLoad: 86,
      recentLoad: 88,
      loadBalance: -2,
    };

    const insight = buildActivityInsights({
      ...unrelatedInputs,
      load: { status: "available", data: { points } },
    }).find(({ id }) => id === "training-load");

    expect(insight).toMatchObject({
      value: "84.0",
      rows: [
        { label: "Daily Load", value: "84.0" },
        { label: "Long-term Load", value: "86.0" },
        { label: "Recent Load", value: "88.0" },
        { label: "Load Balance", value: "-2.0" },
      ],
    });
    expect(insight?.summary).toContain("Daily Load through");
    expect(insight?.detail).toContain("previous planning day");
    expect(insight?.points).toHaveLength(84);
    expect(insight?.series?.map(({ label }) => label)).toEqual([
      "Daily Load",
      "Long-term Load",
      "Recent Load",
      "Load Balance",
    ]);
    expect(insight?.series?.every(({ points: seriesPoints }) => seriesPoints.length === 84)).toBe(
      true,
    );
    expect(insight?.points.at(-1)?.date?.getFullYear()).toBe(2026);
    expect(insight?.points.at(-1)?.date?.getMonth()).toBe(6);
    expect(insight?.points.at(-1)?.date?.getDate()).toBe(21);

    const copy = JSON.stringify(insight);
    expect(copy).not.toMatch(/\b(?:TSS|IF|CTL|ATL|TSB|Fitness|Fatigue|Form|recovery)\b/i);
  });

  it("abstains explicitly for insufficient history without erasing unrelated insights", () => {
    const insights = buildActivityInsights({
      ...unrelatedInputs,
      load: { status: "unavailable", reason: "insufficient_history" },
    });
    const loadInsight = insights.find(({ id }) => id === "training-load");

    expect(loadInsight).toMatchObject({
      value: "--",
      direction: "empty",
      points: [],
    });
    expect(`${loadInsight?.summary} ${loadInsight?.detail}`).toMatch(
      /unavailable|not yet enough complete history/i,
    );
    expect(loadInsight?.detail).toContain("No zero value is assumed");
    expect(insights.find(({ id }) => id === "volume")?.value).toBe("1.0h");
    expect(insights.find(({ id }) => id === "consistency")?.value).toBe("1d");
  });
});

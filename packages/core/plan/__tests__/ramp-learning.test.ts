import { describe, expect, it } from "vitest";
import { learnIndividualRampRate } from "../ramp-learning";

function buildWeeklyActivities(params: {
  startMonday: string;
  weeklyLoad: number[];
}): Array<{ occurred_at: string; load: number }> {
  const start = new Date(params.startMonday);

  return params.weeklyLoad.map((load, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index * 7);
    return {
      occurred_at: date.toISOString(),
      load,
    };
  });
}

describe("learnIndividualRampRate", () => {
  it("falls back to cap 40 with low confidence for sparse history", () => {
    const activities = Array.from({ length: 6 }, (_, i) => ({
      occurred_at: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      load: 50,
    }));

    expect(learnIndividualRampRate(activities)).toEqual({
      maxSafeRampRate: 40,
      confidence: "low",
    });
  });

  it("groups by ISO week (Monday start) across year boundary", () => {
    const activities = [
      { occurred_at: "2025-12-29T09:00:00Z", load: 100 }, // Monday
      { occurred_at: "2025-12-31T09:00:00Z", load: 100 }, // Same ISO week
      { occurred_at: "2026-01-05T09:00:00Z", load: 200 }, // Next Monday
      { occurred_at: "2026-01-12T09:00:00Z", load: 260 },
      { occurred_at: "2026-01-19T09:00:00Z", load: 320 },
      { occurred_at: "2026-01-26T09:00:00Z", load: 390 },
      { occurred_at: "2026-02-02T09:00:00Z", load: 460 },
      { occurred_at: "2026-02-09T09:00:00Z", load: 530 },
      { occurred_at: "2026-02-16T09:00:00Z", load: 600 },
      { occurred_at: "2026-02-23T09:00:00Z", load: 670 },
      { occurred_at: "2026-03-02T09:00:00Z", load: 740 },
    ];

    const result = learnIndividualRampRate(activities);
    expect(result.maxSafeRampRate).toBeGreaterThanOrEqual(30);
    expect(result.maxSafeRampRate).toBeLessThanOrEqual(70);
  });

  it("is deterministic for identical input and percentile tie cases", () => {
    const weeklyActivities = buildWeeklyActivities({
      startMonday: "2026-01-05T00:00:00Z",
      weeklyLoad: [200, 240, 280, 320, 360, 400, 440, 480, 520, 560, 600, 640],
    });

    const first = learnIndividualRampRate(weeklyActivities);
    const second = learnIndividualRampRate(weeklyActivities);

    expect(first).toEqual(second);
  });

  it("returns medium/high confidence based on positive ramp count", () => {
    const mediumHistory = buildWeeklyActivities({
      startMonday: "2025-01-06T00:00:00Z",
      weeklyLoad: Array.from({ length: 20 }, (_, i) => 200 + i * 35),
    });

    const highHistory = buildWeeklyActivities({
      startMonday: "2025-01-06T00:00:00Z",
      weeklyLoad: Array.from({ length: 36 }, (_, i) => 180 + i * 30),
    });

    const medium = learnIndividualRampRate(mediumHistory);
    const high = learnIndividualRampRate(highHistory);

    expect(medium.confidence).toBe("medium");
    expect(high.confidence).toBe("high");
  });
});

import { describe, expect, it } from "vitest";
import {
  calculateStructureDurationSeconds,
  calculateTotalDurationFromIntervals,
  formatDuration,
  getDurationSeconds,
} from "../index";

describe("duration module", () => {
  it("uses canonical sport-aware duration estimation defaults", () => {
    expect(
      getDurationSeconds({ type: "distance", meters: 1000 }, { activityCategory: "swim" }),
    ).toBe(1000);
    expect(
      getDurationSeconds({ type: "repetitions", count: 10 }, { activityCategory: "strength" }),
    ).toBe(100);
    expect(getDurationSeconds({ type: "untilFinished" }, { activityCategory: "run" })).toBe(300);
  });

  it("formats display durations consistently", () => {
    expect(formatDuration({ type: "time", seconds: 90 })).toBe("1m 30s");
    expect(formatDuration({ type: "distance", meters: 1500 })).toBe("1.50km");
    expect(formatDuration({ type: "repetitions", count: 8 })).toBe("8 reps");
  });

  it("calculates interval and structure totals through one path", () => {
    const intervals = [
      {
        name: "Main Set",
        repetitions: 2,
        steps: [
          { name: "Run", duration: { type: "time", seconds: 300 }, targets: [] },
          { name: "Recover", duration: { type: "time", seconds: 60 }, targets: [] },
        ],
      },
    ];

    expect(calculateTotalDurationFromIntervals(intervals as never)).toBe(720);
    expect(calculateStructureDurationSeconds({ intervals } as never)).toBe(720);
  });
});

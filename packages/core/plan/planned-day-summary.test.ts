import { describe, expect, it } from "vitest";

import { summarizePlannedDay } from "./planned-day-summary";

describe("summarizePlannedDay", () => {
  it("preserves stable display composition and unknown estimates without inferring a combined activity", () => {
    expect(
      summarizePlannedDay([
        {
          activityCategory: "bike",
          estimatedDurationSeconds: 3600,
          estimatedTss: 80,
        },
        {
          activityCategory: "run",
          estimatedDurationSeconds: null,
          estimatedTss: null,
        },
        {
          activityCategory: "swim",
          estimatedDurationSeconds: 1200,
          estimatedTss: 20,
        },
      ]),
    ).toEqual({
      eventCount: 3,
      activity_categories: ["bike", "run", "swim"],
      totalDurationSeconds: null,
      totalTss: null,
    });
  });
});

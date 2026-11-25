import { describe, expect, it } from "vitest";
import { completedActivityTitle } from "./activity-title";

describe("completedActivityTitle", () => {
  it.each([
    ["2026-09-04T05:00:00Z", "UTC", "run", "morning run"],
    ["2026-09-04T12:00:00Z", "UTC", "bike", "afternoon bike"],
    ["2026-09-04T17:00:00Z", "UTC", "swim", "evening swim"],
    ["2026-09-04T04:59:00Z", "UTC", "other", "evening activity"],
    ["2026-09-04T12:30:00Z", "America/Los_Angeles", "other", "morning activity"],
  ] as const)("uses the athlete's local time for %s", (startedAt, timezone, activityCategory, expected) => {
    expect(
      completedActivityTitle({
        startedAt: new Date(startedAt),
        timezone,
        activityCategory,
      }),
    ).toBe(expected);
  });
});

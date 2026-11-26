import { describe, expect, it } from "vitest";
import { getCurrentPlanningWeek } from "./current-planning-week";

describe("getCurrentPlanningWeek", () => {
  it("uses Sunday-Saturday dates and profile-local exclusive instant bounds", () => {
    expect(
      getCurrentPlanningWeek(new Date("2026-07-20T01:00:00.000Z"), "America/Los_Angeles"),
    ).toMatchObject({
      startDate: "2026-07-19",
      endDate: "2026-07-25",
      startInstant: new Date("2026-07-19T07:00:00.000Z"),
      endExclusiveInstant: new Date("2026-07-26T07:00:00.000Z"),
    });
  });
});

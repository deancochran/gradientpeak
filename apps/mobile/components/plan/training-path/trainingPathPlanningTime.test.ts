import { describe, expect, it } from "vitest";
import {
  getTrainingPathDateKey,
  getTrainingPathPlanningDayRange,
  getTrainingPathTodayKey,
  millisecondsUntilNextTrainingPathDay,
} from "./trainingPathPlanningTime";

describe("Training Path planning time", () => {
  it("uses the persisted planning zone instead of the device zone for day keys and query bounds", () => {
    const planningTimezone = "America/Los_Angeles";
    const instant = new Date("2026-04-06T06:30:00.000Z");

    expect(getTrainingPathTodayKey(instant, planningTimezone)).toBe("2026-04-05");
    expect(getTrainingPathDateKey(instant, planningTimezone)).toBe("2026-04-05");
    expect(getTrainingPathPlanningDayRange("2026-04-05", planningTimezone)).toEqual({
      startsAfter: "2026-04-05T07:00:00.000Z",
      startsBefore: "2026-04-06T07:00:00.000Z",
    });
  });

  it("uses the DST-adjusted next planning midnight", () => {
    const planningTimezone = "America/Los_Angeles";
    const beforeSpringForward = new Date("2026-03-08T08:30:00.000Z");

    expect(getTrainingPathPlanningDayRange("2026-03-08", planningTimezone)).toEqual({
      startsAfter: "2026-03-08T08:00:00.000Z",
      startsBefore: "2026-03-09T07:00:00.000Z",
    });
    expect(millisecondsUntilNextTrainingPathDay(beforeSpringForward, planningTimezone)).toBe(
      22.5 * 60 * 60 * 1000,
    );
  });

  it("abstains when the persisted zone is missing, invalid, or has no midnight", () => {
    expect(getTrainingPathTodayKey(new Date("2026-04-06T06:30:00.000Z"), null)).toBeNull();
    expect(getTrainingPathDateKey("2026-04-06T06:30:00.000Z", "Not/AZone")).toBeNull();
    expect(getTrainingPathPlanningDayRange("2026-04-05", "Not/AZone")).toBeNull();
    expect(millisecondsUntilNextTrainingPathDay(new Date(), "Not/AZone")).toBeNull();

    // Samoa skipped this entire planning day, so its midnight has no instant.
    expect(getTrainingPathPlanningDayRange("2011-12-30", "Pacific/Apia")).toBeNull();
  });
});

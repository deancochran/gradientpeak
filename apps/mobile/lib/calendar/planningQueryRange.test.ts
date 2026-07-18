import { describe, expect, it } from "vitest";
import {
  resolveBoundedPlanningDateRange,
  resolvePlanningDayQueryRange,
} from "./planningQueryRange";

describe("planning query readiness", () => {
  it("returns an unavailable state instead of constructing empty date inputs", () => {
    expect(resolvePlanningDayQueryRange({ dateKey: null, timezone: "America/New_York" })).toEqual({
      status: "unavailable",
      reason: "date_unavailable",
    });
  });

  it("rejects timezone abbreviations that the API does not accept", () => {
    expect(resolvePlanningDayQueryRange({ dateKey: "2026-07-18", timezone: "EST" })).toEqual({
      status: "unavailable",
      reason: "timezone_unavailable",
    });
  });

  it("resolves planning-day instants in the persisted timezone", () => {
    expect(
      resolvePlanningDayQueryRange({
        dateKey: "2026-07-18",
        timezone: "America/New_York",
      }),
    ).toEqual({
      status: "ready",
      value: {
        dateKey: "2026-07-18",
        endsAtInclusive: "2026-07-19T03:59:59.999Z",
        startsAfter: "2026-07-18T04:00:00.000Z",
        startsBefore: "2026-07-19T04:00:00.000Z",
        timezone: "America/New_York",
      },
    });
  });

  it("caps backend date observations at the inclusive range limit", () => {
    expect(
      resolveBoundedPlanningDateRange({
        startDate: "2024-01-01",
        endDate: "2026-04-06",
        maxInclusiveDays: 365,
        timezone: "America/Los_Angeles",
      }),
    ).toEqual({
      status: "ready",
      value: {
        startDate: "2025-04-07",
        endDate: "2026-04-06",
        timezone: "America/Los_Angeles",
      },
    });
  });

  it("rejects reversed ranges", () => {
    expect(
      resolveBoundedPlanningDateRange({
        startDate: "2026-07-19",
        endDate: "2026-07-18",
        maxInclusiveDays: 365,
        timezone: "UTC",
      }),
    ).toEqual({ status: "unavailable", reason: "invalid_date_range" });
  });
});

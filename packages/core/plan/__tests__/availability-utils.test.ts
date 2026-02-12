import { countAvailableTrainingDays } from "../availabilityUtils";
import { describe, expect, it } from "vitest";

describe("countAvailableTrainingDays", () => {
  it("counts unique days with windows and excludes hard-rest days", () => {
    const result = countAvailableTrainingDays({
      availabilityDays: [
        { day: "monday", windows: [{ start: 360, end: 420 }] },
        { day: "monday", windows: [{ start: 540, end: 600 }] },
        { day: "tuesday", windows: [{ start: 360, end: 420 }] },
        { day: "wednesday", windows: [] },
      ],
      hardRestDays: ["tuesday"],
    });

    expect(result).toBe(1);
  });

  it("keeps existing default behavior when max_sessions is zero or missing", () => {
    const result = countAvailableTrainingDays({
      availabilityDays: [
        {
          day: "monday",
          windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }],
          max_sessions: 0,
        },
        {
          day: "tuesday",
          windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }],
        },
      ],
      hardRestDays: [],
    });

    expect(result).toBe(2);
  });

  it("can require positive max_sessions when consumers opt in", () => {
    const result = countAvailableTrainingDays({
      availabilityDays: [
        {
          day: "monday",
          windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }],
          max_sessions: 0,
        },
        {
          day: "tuesday",
          windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }],
          max_sessions: 2,
        },
        {
          day: "wednesday",
          windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }],
        },
      ],
      hardRestDays: [],
      requirePositiveMaxSessions: true,
    });

    expect(result).toBe(1);
  });
});

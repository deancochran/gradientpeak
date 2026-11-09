import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { millisecondsUntilNextLocalDay } from "../dateMath";
import { buildGroupEventsByDate, type CalendarGroupEvent } from "../groupEventPlans";
import { buildEventsByDate } from "../normalizeEvents";

const originalTimezone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});

afterAll(() => {
  if (originalTimezone) {
    process.env.TZ = originalTimezone;
  } else {
    delete process.env.TZ;
  }
});

describe("calendar date bucketing", () => {
  it("schedules local-midnight rollover across DST boundaries", () => {
    expect(millisecondsUntilNextLocalDay(new Date(2026, 2, 8, 0, 30))).toBe(22.5 * 60 * 60 * 1000);
    expect(millisecondsUntilNextLocalDay(new Date(2026, 10, 1, 0, 30))).toBe(24.5 * 60 * 60 * 1000);
  });

  it("buckets events by their materialized scheduled date", () => {
    const priorLocalDayInstant = "2026-05-01T01:30:00.000Z";
    const eventsByDate = buildEventsByDate([
      { id: "timed", scheduled_date: "2026-04-30", starts_at: priorLocalDayInstant },
      {
        id: "scheduled-date",
        scheduled_date: "2026-05-01",
        starts_at: priorLocalDayInstant,
      },
      {
        id: "all-day",
        all_day: true,
        scheduled_date: "2026-05-01",
        starts_at: "2026-05-01T00:00:00.000Z",
      },
      { id: "missing-date", starts_at: priorLocalDayInstant },
    ]);

    expect(eventsByDate.get("2026-04-30")?.map((event) => event.id)).toEqual(["timed"]);
    expect(eventsByDate.get("2026-05-01")?.map((event) => event.id)).toEqual([
      "all-day",
      "scheduled-date",
    ]);

    const groupEvent = {
      id: "group",
      starts_at: priorLocalDayInstant,
      scheduled_date: "2026-05-01",
      selectedActivityPlan: { id: "plan" },
    } as CalendarGroupEvent;
    const groupEventsByDate = buildGroupEventsByDate([groupEvent]);

    expect(groupEventsByDate.get("2026-05-01")?.map((event) => event.id)).toEqual(["group"]);
    expect(groupEventsByDate.has("2026-04-30")).toBe(false);
  });
});

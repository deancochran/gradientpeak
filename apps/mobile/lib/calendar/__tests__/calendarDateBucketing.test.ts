import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { millisecondsUntilNextLocalDay, toLocalDayEndIso, toLocalDayStartIso } from "../dateMath";
import {
  buildGroupEventsByDate,
  type CalendarGroupEvent,
  toGroupEventScheduledActivityPlanEvent,
} from "../groupEventPlans";
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
  it("converts date keys to local-midnight query boundaries", () => {
    expect(toLocalDayStartIso("2026-05-01")).toBe("2026-05-01T07:00:00.000Z");
    expect(toLocalDayStartIso("2026-11-01")).toBe("2026-11-01T07:00:00.000Z");
    expect(toLocalDayEndIso("2026-05-01")).toBe("2026-05-02T06:59:59.999Z");
    expect(toLocalDayEndIso("2026-11-01")).toBe("2026-11-02T07:59:59.999Z");
  });

  it("schedules local-midnight rollover across DST boundaries", () => {
    expect(millisecondsUntilNextLocalDay(new Date(2026, 2, 8, 0, 30))).toBe(22.5 * 60 * 60 * 1000);
    expect(millisecondsUntilNextLocalDay(new Date(2026, 10, 1, 0, 30))).toBe(24.5 * 60 * 60 * 1000);
  });

  it("buckets timed instants by device-local date while preserving date-only semantics", () => {
    const priorLocalDayInstant = "2026-05-01T01:30:00.000Z";
    const eventsByDate = buildEventsByDate([
      { id: "timed", starts_at: priorLocalDayInstant },
      {
        id: "scheduled-date",
        scheduled_date: "2026-05-01",
        starts_at: priorLocalDayInstant,
      },
      { id: "all-day", all_day: true, starts_at: "2026-05-01T00:00:00.000Z" },
    ]);

    expect(eventsByDate.get("2026-04-30")?.map((event) => event.id)).toEqual(["timed"]);
    expect(eventsByDate.get("2026-05-01")?.map((event) => event.id)).toEqual([
      "all-day",
      "scheduled-date",
    ]);

    const groupEvent = {
      id: "group",
      starts_at: priorLocalDayInstant,
      selectedActivityPlan: { id: "plan" },
    } as CalendarGroupEvent;
    const groupEventsByDate = buildGroupEventsByDate([groupEvent]);

    expect(groupEventsByDate.get("2026-04-30")?.map((event) => event.id)).toEqual(["group"]);
    expect(groupEventsByDate.has("2026-05-01")).toBe(false);
    expect(toGroupEventScheduledActivityPlanEvent(groupEvent)?.scheduled_date).toBe("2026-04-30");
  });
});

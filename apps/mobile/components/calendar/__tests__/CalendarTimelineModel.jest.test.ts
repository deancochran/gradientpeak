import type { ProfileGoal } from "@repo/core";
import type { CalendarGroupEvent } from "@/lib/calendar/groupEventPlans";
import { buildCalendarTimelineRows } from "../CalendarTimelineModel";

const dateKey = "2026-05-01";
const equalTime = "2026-05-01T09:00:00.000Z";

function objectRowKeys(sourceOrder: "forward" | "reverse") {
  const goals = [{ id: "goal-a" }, { id: "goal-b" }] as ProfileGoal[];
  const groupEvents = [
    { id: "group-a", starts_at: equalTime },
    { id: "group-b", starts_at: equalTime },
  ] as CalendarGroupEvent[];
  const events = [
    { id: "event-a", starts_at: equalTime },
    { id: "event-b", starts_at: equalTime },
  ];
  const activities = [
    { id: "activity-early", started_at: "2026-05-01T08:00:00.000Z" },
    { id: "activity-a", started_at: equalTime },
    { id: "activity-b", started_at: equalTime },
  ];
  const ordered = <T>(items: T[]) => (sourceOrder === "reverse" ? [...items].reverse() : items);

  return buildCalendarTimelineRows({
    rangeStart: dateKey,
    rangeEnd: dateKey,
    goalsByDate: new Map([[dateKey, ordered(goals)]]),
    groupEventsByDate: new Map([[dateKey, ordered(groupEvents)]]),
    eventsByDate: new Map([[dateKey, ordered(events)]]),
    activitiesByDate: new Map([[dateKey, ordered(activities)]]),
  })
    .rows.filter((row) => row.type === "object")
    .map((row) => row.key);
}

describe("buildCalendarTimelineRows", () => {
  it("orders goals first and mixed timed objects by instant, type, and id", () => {
    const expectedKeys = [
      "goal:goal-a",
      "goal:goal-b",
      "activity:activity-early",
      "group-event:group-a",
      "group-event:group-b",
      "event:event-a",
      "event:event-b",
      "activity:activity-a",
      "activity:activity-b",
    ];

    expect(objectRowKeys("forward")).toEqual(expectedKeys);
    expect(objectRowKeys("reverse")).toEqual(expectedKeys);
  });
});

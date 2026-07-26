import type { ProfileGoal } from "@repo/core";
import { getPlannedRecordingState } from "@/lib/calendar/eventPresentation";
import type { CalendarGroupEvent } from "@/lib/calendar/groupEventPlans";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";
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

describe("getPlannedRecordingState", () => {
  it("keeps expired planned sessions unverified unless an authoritative completion exists", () => {
    expect(
      getPlannedRecordingState({ event_type: "planned", status: "expired" } as CalendarEvent),
    ).toBe("unverified");
    expect(
      getPlannedRecordingState({ event_type: "planned", status: "scheduled" } as CalendarEvent),
    ).toBe("planned");
    expect(
      getPlannedRecordingState({
        event_type: "planned",
        status: "completed",
        linked_activity_id: "activity-1",
      } as CalendarEvent),
    ).toBe("completed");
    expect(
      getPlannedRecordingState({ event_type: "planned", status: "completed" } as CalendarEvent),
    ).toBe("unverified");
    expect(
      getPlannedRecordingState({
        event_type: "planned",
        status: "cancelled",
        linked_activity_id: "activity-cancelled",
      } as CalendarEvent),
    ).toBe("cancelled");
  });
});

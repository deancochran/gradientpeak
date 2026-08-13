import { getPlannedRecordingState } from "@/lib/calendar/eventPresentation";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";
import { createCalendarProjectionItem } from "../../../test/calendar-projection-fixture";
import { buildCalendarTimelineRows } from "../CalendarTimelineModel";

const dateKey = "2026-05-01";
const equalTime = "2026-05-01T09:00:00.000Z";

function objectRowKeys(sourceOrder: "forward" | "reverse") {
  const items = [
    createCalendarProjectionItem({ id: "goal-a", kind: "goal", title: "Goal A" }),
    createCalendarProjectionItem({ id: "goal-b", kind: "goal", title: "Goal B" }),
    createCalendarProjectionItem({
      id: "activity-early",
      kind: "completed_activity",
      title: "Early",
      timing: {
        startsAt: "2026-05-01T08:00:00.000Z",
        endsAt: null,
        allDay: false,
        timezone: "UTC",
      },
    }),
    createCalendarProjectionItem({
      id: "group-a",
      kind: "group_event",
      title: "Group A",
      timing: { startsAt: equalTime, endsAt: null, allDay: false, timezone: "UTC" },
    }),
    createCalendarProjectionItem({
      id: "group-b",
      kind: "group_event",
      title: "Group B",
      timing: { startsAt: equalTime, endsAt: null, allDay: false, timezone: "UTC" },
    }),
    createCalendarProjectionItem({
      id: "event-a",
      kind: "event",
      title: "Event A",
      timing: { startsAt: equalTime, endsAt: null, allDay: false, timezone: "UTC" },
    }),
    createCalendarProjectionItem({
      id: "event-b",
      kind: "event",
      title: "Event B",
      timing: { startsAt: equalTime, endsAt: null, allDay: false, timezone: "UTC" },
    }),
    createCalendarProjectionItem({
      id: "activity-a",
      kind: "completed_activity",
      title: "A",
      timing: { startsAt: equalTime, endsAt: null, allDay: false, timezone: "UTC" },
    }),
    createCalendarProjectionItem({
      id: "activity-b",
      kind: "completed_activity",
      title: "B",
      timing: { startsAt: equalTime, endsAt: null, allDay: false, timezone: "UTC" },
    }),
  ];
  const ordered = <T>(items: T[]) => (sourceOrder === "reverse" ? [...items].reverse() : items);

  return buildCalendarTimelineRows({
    rangeStart: dateKey,
    rangeEnd: dateKey,
    itemsByDate: new Map([[dateKey, ordered(items)]]),
  })
    .rows.filter((row) => row.type === "object")
    .map((row) => row.key);
}

describe("buildCalendarTimelineRows", () => {
  it("preserves the canonical projection order", () => {
    const expectedKeys = [
      "goal:goal-a",
      "goal:goal-b",
      "completed_activity:activity-early",
      "group_event:group-a",
      "group_event:group-b",
      "event:event-a",
      "event:event-b",
      "completed_activity:activity-a",
      "completed_activity:activity-b",
    ];

    expect(objectRowKeys("forward")).toEqual(expectedKeys);
    expect(objectRowKeys("reverse")).toEqual([...expectedKeys].reverse());
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

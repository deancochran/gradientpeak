import type { PlannedSessionDto } from "@repo/api/client";
import {
  type CalendarProjectionItem,
  calendarProjectionItemSchema,
  compareCalendarProjectionItems,
} from "@repo/core";

function toDirectCalendarItem(
  session: PlannedSessionDto,
  timezone: string,
): CalendarProjectionItem {
  return calendarProjectionItemSchema.parse({
    id: session.id,
    calendarDate: session.planningDate,
    timing: { startsAt: null, endsAt: null, allDay: true, timezone },
    kind: "planned_activity",
    title:
      session.prescription.variantName === "Base"
        ? "Scheduled activity"
        : session.prescription.variantName,
    subtitle: null,
    status: "scheduled",
    navigation: { target: "activity_plan", href: "/record" },
    metrics: [],
    estimated: false,
    partial: false,
    plan: null,
    plannedSession: {
      id: session.id,
      planningDate: session.planningDate,
      source: session.source,
      prescription: session.prescription,
      lifecycle: session.lifecycle,
    },
    activity: null,
    event: null,
    groupEvent: null,
    goal: null,
  });
}

export function mergeDirectPlannedSessionsIntoCalendar(input: {
  items: CalendarProjectionItem[];
  sessions: PlannedSessionDto[];
  timezone: string;
}): CalendarProjectionItem[] {
  const representedSessionIds = new Set(
    input.items.flatMap((item) => (item.plannedSession ? [item.plannedSession.id] : [])),
  );
  const representedGroupEventIds = new Set(
    input.items.flatMap((item) => (item.kind === "group_event" ? [item.id] : [])),
  );
  const directItems = input.sessions
    .filter(
      (session) =>
        session.source.kind === "direct" &&
        session.lifecycle.status === "scheduled" &&
        !representedSessionIds.has(session.id) &&
        !(session.groupEventId && representedGroupEventIds.has(session.groupEventId)),
    )
    .map((session) => toDirectCalendarItem(session, input.timezone));

  return [...input.items, ...directItems].sort(compareCalendarProjectionItems);
}

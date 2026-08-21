import type { CalendarProjectionItem } from "@repo/core";
import { buildOpenEventRoute } from "./eventRouting";

export function buildCalendarItemRoute(item: CalendarProjectionItem) {
  if (item.kind === "completed_activity") return `/activity-detail?id=${item.id}`;
  if (item.kind === "goal") return { pathname: "/goal-detail", params: { id: item.id } };
  if (item.kind === "group_event") {
    return { pathname: "/group-event-detail", params: { groupEventId: item.id } };
  }
  return buildOpenEventRoute({ id: item.id, event_type: item.event?.type });
}

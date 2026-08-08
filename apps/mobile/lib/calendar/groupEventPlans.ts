import type { CalendarEventActivityPlan } from "@/lib/calendar/normalizeEvents";
import type { GroupEventListItem } from "@/lib/groups";

export type CalendarGroupEvent = GroupEventListItem & {
  scheduled_date: string;
  selectedActivityPlan?: CalendarEventActivityPlan | null;
  selectedActivityPlanOptionLabel?: string | null;
  selectedActivityPlanTentative?: boolean;
};

export function buildGroupEventsByDate(events: CalendarGroupEvent[]) {
  const map = new Map<string, CalendarGroupEvent[]>();

  for (const event of events) {
    const dateKey = event.scheduled_date;
    const items = map.get(dateKey) ?? [];
    items.push(event);
    map.set(dateKey, items);
  }

  for (const [dateKey, dayEvents] of map.entries()) {
    map.set(
      dateKey,
      [...dayEvents].sort(
        (left, right) =>
          new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime() ||
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      ),
    );
  }

  return map;
}

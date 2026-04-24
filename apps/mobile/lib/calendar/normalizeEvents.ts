export interface CalendarEventActivityPlan {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  notes?: string | null;
  activity_category?: string | null;
  authoritative_metrics?: {
    estimated_duration?: number | null;
    estimated_tss?: number | null;
    intensity_factor?: number | null;
    estimated_distance?: number | null;
  } | null;
  route?: {
    distance?: number | null;
    ascent?: number | null;
    descent?: number | null;
  } | null;
  route_id?: string | null;
  structure?: unknown;
}

export interface CalendarEvent {
  id: string;
  event_type?: string | null;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
  scheduled_date?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  all_day?: boolean | null;
  series_id?: string | null;
  recurrence_rule?: string | null;
  recurrence?: { rule?: string | null } | null;
  linked_activity_id?: string | null;
  completed?: boolean | null;
  status?: string | null;
  activity_plan?: CalendarEventActivityPlan | null;
}

export type CalendarEventsByDate = Map<string, CalendarEvent[]>;

function compareEvents(left: CalendarEvent, right: CalendarEvent): number {
  if (left.all_day && !right.all_day) return -1;
  if (!left.all_day && right.all_day) return 1;

  const leftTime = left.starts_at ? new Date(left.starts_at).getTime() : 0;
  const rightTime = right.starts_at ? new Date(right.starts_at).getTime() : 0;
  return leftTime - rightTime;
}

export function buildEventsByDate(events: CalendarEvent[]): CalendarEventsByDate {
  const map = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const dateKey = event.scheduled_date;
    if (!dateKey) continue;
    const current = map.get(dateKey) ?? [];
    current.push(event);
    map.set(dateKey, current);
  }

  for (const [dateKey, dayEvents] of map.entries()) {
    map.set(dateKey, [...dayEvents].sort(compareEvents));
  }

  return map;
}

export function getMonthDensity(eventsByDate: CalendarEventsByDate, dateKey: string): number {
  return (eventsByDate.get(dateKey) ?? []).filter((event) => event.event_type !== "rest_day")
    .length;
}

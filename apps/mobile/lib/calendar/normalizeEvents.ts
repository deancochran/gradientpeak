import { toDateKey } from "@/lib/calendar/dateMath";

export interface CalendarEventActivityPlan {
  common_load?: unknown;
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
  estimated_duration?: number | null;
  estimated_tss?: number | null;
  intensity_factor?: number | null;
  estimated_distance?: number | null;
  route?: {
    distance?: number | null;
    ascent?: number | null;
    descent?: number | null;
  } | null;
  route_id?: string | null;
  structure?: unknown;
}

export interface CalendarEventOwner {
  id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
}

export interface CalendarEvent {
  common_load?: unknown;
  id: string;
  event_type?: string | null;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
  scheduled_date?: string | null;
  timezone?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  all_day?: boolean | null;
  series_id?: string | null;
  recurrence_rule?: string | null;
  recurrence?: { rule?: string | null } | null;
  linked_activity_id?: string | null;
  training_plan_id?: string | null;
  completed?: boolean | null;
  status?: string | null;
  owner?: CalendarEventOwner | null;
  activity_plan?: CalendarEventActivityPlan | null;
}

export type CalendarEventsByDate = Map<string, CalendarEvent[]>;

function getEventStartDateKey(event: CalendarEvent): string | null {
  if (event.scheduled_date) {
    return event.scheduled_date;
  }

  if (event.starts_at) {
    if (event.all_day) {
      return event.starts_at.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    }

    const startsAt = new Date(event.starts_at);
    if (!Number.isNaN(startsAt.getTime())) {
      return toDateKey(startsAt);
    }
  }

  return null;
}

function getScheduledDateKey(event: CalendarEvent): string | null {
  const startDateKey = getEventStartDateKey(event);
  if (!startDateKey) {
    return null;
  }

  return startDateKey;
}

function compareEvents(left: CalendarEvent, right: CalendarEvent): number {
  if (left.all_day && !right.all_day) return -1;
  if (!left.all_day && right.all_day) return 1;

  const getTime = (value?: string | null) => {
    const time = value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
  };
  const leftTime = getTime(left.starts_at);
  const rightTime = getTime(right.starts_at);
  if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1;

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function buildEventsByDate(events: CalendarEvent[]): CalendarEventsByDate {
  const map = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const dateKey = getScheduledDateKey(event);
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

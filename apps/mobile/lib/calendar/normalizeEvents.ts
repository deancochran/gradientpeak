import type {
  ActivityObservationQuantificationBundle,
  ActivityPrescriptionQuantificationBundle,
} from "@repo/core";

export interface CalendarEventActivityPlan {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  notes?: string | null;
  activity_category?: string | null;
  structure?: unknown;
  prescriptionQuantification?: ActivityPrescriptionQuantificationBundle | null;
}

export interface CalendarEventOwner {
  id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
}

export interface CalendarEvent {
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
  route_id?: string | null;
  prescriptionQuantification?: ActivityPrescriptionQuantificationBundle | null;
  observationQuantification?: ActivityObservationQuantificationBundle | null;
}

export type CalendarEventsByDate = Map<string, CalendarEvent[]>;

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

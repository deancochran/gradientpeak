import type { ProfileGoal } from "@repo/core";
import { toDateKey } from "@/lib/calendar/dateMath";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";

export type TimelineEventType =
  | "planned_activity"
  | "completed_activity"
  | "goal"
  | "race"
  | "custom"
  | "imported"
  | "rest_day";

export type TimelineEventStatus =
  | "planned"
  | "completed"
  | "missed"
  | "skipped"
  | "rescheduled"
  | "scheduled"
  | "read_only";

export type TimelineEventSourceType = "calendar_event" | "profile_goal";

export interface TimelineEvent<
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  type: TimelineEventType;
  title: string;
  date: string;
  startAt: string | null;
  endAt: string | null;
  status: TimelineEventStatus;
  sourceType: TimelineEventSourceType;
  sourceId: string;
  isMutable: boolean;
  isDraggable: boolean;
  color: string;
  metadata: TMetadata;
}

export type TimelineEventsByDate = Map<string, TimelineEvent[]>;

type TimelineGoalMetadata = {
  activityCategory: ProfileGoal["activity_category"];
  priority: number;
};

type TimelineCalendarEventMetadata = {
  calendarEvent: CalendarEvent;
};

function getCalendarEventDateKey(event: CalendarEvent): string | null {
  if (event.scheduled_date) {
    return event.scheduled_date;
  }

  if (!event.starts_at) {
    return null;
  }

  const startsAt = new Date(event.starts_at);
  return Number.isNaN(startsAt.getTime()) ? null : toDateKey(startsAt);
}

function isPastDate(dateKey: string, todayKey: string): boolean {
  return dateKey < todayKey;
}

function classifyCalendarEventType(event: CalendarEvent): TimelineEventType {
  if (event.event_type === "planned") {
    return isActivityCompleted(event) ? "completed_activity" : "planned_activity";
  }

  if (event.event_type === "race_target") {
    return "race";
  }

  if (event.event_type === "custom") {
    return "custom";
  }

  if (event.event_type === "rest_day") {
    return "rest_day";
  }

  return "imported";
}

function getTimelineColor(type: TimelineEventType): string {
  switch (type) {
    case "completed_activity":
      return "green";
    case "planned_activity":
      return "gray";
    case "goal":
    case "race":
      return "violet";
    case "rest_day":
      return "slate";
    default:
      return "blue";
  }
}

function getCalendarEventStatus({
  dateKey,
  event,
  todayKey,
  type,
}: {
  dateKey: string;
  event: CalendarEvent;
  todayKey: string;
  type: TimelineEventType;
}): TimelineEventStatus {
  if (type === "completed_activity") {
    return "completed";
  }

  if (event.status === "skipped") {
    return "skipped";
  }

  if (event.status === "rescheduled") {
    return "rescheduled";
  }

  if (type === "planned_activity" && isPastDate(dateKey, todayKey)) {
    return "missed";
  }

  if (type === "imported") {
    return "read_only";
  }

  return type === "planned_activity" ? "planned" : "scheduled";
}

function getCalendarEventTitle(event: CalendarEvent, type: TimelineEventType): string {
  if (type === "planned_activity" || type === "completed_activity") {
    return event.activity_plan?.name ?? event.title ?? "Activity";
  }

  if (type === "race") {
    return event.title ?? "Race target";
  }

  if (type === "rest_day") {
    return event.title ?? "Rest day";
  }

  return event.title ?? "Timeline event";
}

export function getTimelineEventAuthority(event: TimelineEvent): {
  isHistoricalTruth: boolean;
  canReschedule: boolean;
} {
  const isHistoricalTruth = event.type === "completed_activity";

  return {
    isHistoricalTruth,
    canReschedule: event.isMutable && event.isDraggable && !isHistoricalTruth,
  };
}

export function adaptCalendarEventToTimelineEvent({
  event,
  todayKey,
}: {
  event: CalendarEvent;
  todayKey: string;
}): TimelineEvent<TimelineCalendarEventMetadata> | null {
  const dateKey = getCalendarEventDateKey(event);
  if (!dateKey) {
    return null;
  }

  const type = classifyCalendarEventType(event);
  const status = getCalendarEventStatus({ dateKey, event, todayKey, type });
  const isFutureMutablePlannedActivity =
    type === "planned_activity" && !isPastDate(dateKey, todayKey) && status === "planned";

  return {
    id: `calendar-event:${event.id}`,
    type,
    title: getCalendarEventTitle(event, type),
    date: dateKey,
    startAt: event.starts_at ?? null,
    endAt: event.ends_at ?? null,
    status,
    sourceType: "calendar_event",
    sourceId: event.id,
    isMutable: isFutureMutablePlannedActivity || type === "custom" || type === "race",
    isDraggable: isFutureMutablePlannedActivity,
    color: getTimelineColor(type),
    metadata: { calendarEvent: event },
  };
}

export function adaptGoalToTimelineEvent(
  goal: ProfileGoal,
): TimelineEvent<TimelineGoalMetadata> | null {
  if (!goal.target_date) {
    return null;
  }

  return {
    id: `profile-goal:${goal.id}`,
    type: "goal",
    title: goal.title,
    date: goal.target_date,
    startAt: null,
    endAt: null,
    status: "scheduled",
    sourceType: "profile_goal",
    sourceId: goal.id,
    isMutable: false,
    isDraggable: false,
    color: getTimelineColor("goal"),
    metadata: {
      activityCategory: goal.activity_category,
      priority: goal.priority,
    },
  };
}

export function buildTimelineEvents({
  calendarEvents,
  goals,
  todayKey,
}: {
  calendarEvents: CalendarEvent[];
  goals: ProfileGoal[];
  todayKey: string;
}): TimelineEvent[] {
  return [
    ...calendarEvents.flatMap((event) => {
      const timelineEvent = adaptCalendarEventToTimelineEvent({ event, todayKey });
      return timelineEvent ? [timelineEvent] : [];
    }),
    ...goals.flatMap((goal) => {
      const timelineEvent = adaptGoalToTimelineEvent(goal);
      return timelineEvent ? [timelineEvent] : [];
    }),
  ].sort(compareTimelineEvents);
}

export function buildTimelineEventsByDate(events: TimelineEvent[]): TimelineEventsByDate {
  const map = new Map<string, TimelineEvent[]>();

  for (const event of events) {
    const current = map.get(event.date) ?? [];
    current.push(event);
    map.set(event.date, current);
  }

  for (const [dateKey, dayEvents] of map.entries()) {
    map.set(dateKey, [...dayEvents].sort(compareTimelineEvents));
  }

  return map;
}

function compareTimelineEvents(left: TimelineEvent, right: TimelineEvent): number {
  if (left.date !== right.date) {
    return left.date.localeCompare(right.date);
  }

  if (left.type === "goal" && right.type !== "goal") return -1;
  if (left.type !== "goal" && right.type === "goal") return 1;

  const leftTime = left.startAt ? new Date(left.startAt).getTime() : 0;
  const rightTime = right.startAt ? new Date(right.startAt).getTime() : 0;
  return leftTime - rightTime;
}

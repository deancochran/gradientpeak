import type { ProfileGoal } from "@repo/core";
import { addDaysToDateKey } from "@/lib/calendar/dateMath";
import type { CalendarGroupEvent } from "@/lib/calendar/groupEventPlans";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";

export type CalendarActivity = {
  id: string;
  name?: string | null;
  type?: string | null;
  started_at?: string | Date | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
  derived?: {
    common_load?: unknown;
    stress?: {
      common_load?: unknown;
    } | null;
  } | null;
};

export type DayRow = {
  key: string;
  type: "day";
  dateKey: string;
  itemCount: number;
  signals: CalendarDaySignals;
};

export type CalendarDaySignals = {
  plannedCount: number;
  activityPlanCount: number;
  completedCount: number;
  goalCount: number;
  restCount: number;
  eventCount: number;
};

export type CalendarScheduleObject =
  | {
      id: string;
      type: "activity";
      activity: CalendarActivity;
    }
  | {
      id: string;
      type: "goal";
      goal: ProfileGoal;
    }
  | {
      id: string;
      type: "event";
      event: CalendarEvent;
    }
  | {
      id: string;
      type: "groupEvent";
      groupEvent: CalendarGroupEvent;
    };

export type ObjectRow = {
  key: string;
  type: "object";
  dateKey: string;
  object: CalendarScheduleObject;
};

export type CalendarTimelineRow = DayRow | ObjectRow;

export type CalendarTimelineModel = {
  rows: CalendarTimelineRow[];
  stickyHeaderIndices: number[];
};

type BuildRowsInput = {
  rangeStart: string;
  rangeEnd: string;
  activitiesByDate: Map<string, CalendarActivity[]>;
  eventsByDate: Map<string, CalendarEvent[]>;
  groupEventsByDate: Map<string, CalendarGroupEvent[]>;
  goalsByDate: Map<string, ProfileGoal[]>;
};

function buildDayKeys(rangeStart: string, rangeEnd: string) {
  const dayKeys: string[] = [];
  let cursor = rangeStart;

  while (cursor <= rangeEnd) {
    dayKeys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }

  return dayKeys;
}

export function isAuthoritativeCompletedActivity(event: CalendarEvent) {
  return Boolean(
    event.completed ||
      event.status === "completed" ||
      event.linked_activity_id ||
      event.event_type === "imported",
  );
}

function getDaySignals(events: CalendarEvent[], goals: ProfileGoal[]): CalendarDaySignals {
  return events.reduce<CalendarDaySignals>(
    (signals, event) => {
      if (event.event_type === "planned") {
        signals.plannedCount += 1;
      }
      if (event.activity_plan) {
        signals.activityPlanCount += 1;
      }
      if (isAuthoritativeCompletedActivity(event)) {
        signals.completedCount += 1;
      }
      if (event.event_type === "rest_day") {
        signals.restCount += 1;
      }
      if (event.event_type !== "planned" && event.event_type !== "rest_day") {
        signals.eventCount += 1;
      }

      return signals;
    },
    {
      plannedCount: 0,
      activityPlanCount: 0,
      completedCount: 0,
      goalCount: goals.length,
      restCount: 0,
      eventCount: 0,
    },
  );
}

const scheduleObjectTypeOrder: Record<Exclude<CalendarScheduleObject["type"], "goal">, number> = {
  groupEvent: 0,
  event: 1,
  activity: 2,
};

function getScheduleObjectTime(object: Exclude<CalendarScheduleObject, { type: "goal" }>) {
  const value =
    object.type === "groupEvent"
      ? object.groupEvent.starts_at
      : object.type === "event"
        ? object.event.starts_at
        : object.activity.started_at;
  const time = value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function compareScheduleObjects(
  left: Exclude<CalendarScheduleObject, { type: "goal" }>,
  right: Exclude<CalendarScheduleObject, { type: "goal" }>,
) {
  const leftTime = getScheduleObjectTime(left);
  const rightTime = getScheduleObjectTime(right);
  if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1;

  const typeDifference = scheduleObjectTypeOrder[left.type] - scheduleObjectTypeOrder[right.type];
  if (typeDifference !== 0) return typeDifference;

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function getScheduleObjectRowKey(object: CalendarScheduleObject) {
  if (object.type === "groupEvent") return `group-event:${object.id}`;
  return `${object.type}:${object.id}`;
}

export function buildCalendarTimelineRows({
  activitiesByDate,
  rangeStart,
  rangeEnd,
  eventsByDate,
  groupEventsByDate,
  goalsByDate,
}: BuildRowsInput): CalendarTimelineModel {
  const rows: CalendarTimelineRow[] = [];
  const dayKeys = buildDayKeys(rangeStart, rangeEnd);

  for (const dateKey of dayKeys) {
    const dayGoals = goalsByDate.get(dateKey) ?? [];
    const dayEvents = eventsByDate.get(dateKey) ?? [];
    const dayGroupEvents = groupEventsByDate.get(dateKey) ?? [];
    const dayActivities = activitiesByDate.get(dateKey) ?? [];
    const daySignals = getDaySignals(dayEvents, dayGoals);

    rows.push({
      key: `day:${dateKey}`,
      type: "day",
      dateKey,
      itemCount: dayGoals.length + dayGroupEvents.length + dayEvents.length + dayActivities.length,
      signals: {
        ...daySignals,
        activityPlanCount:
          daySignals.activityPlanCount +
          dayGroupEvents.filter((event) => event.selectedActivityPlan).length,
        eventCount: daySignals.eventCount + dayGroupEvents.length,
        completedCount: daySignals.completedCount + dayActivities.length,
      },
    });

    for (const goal of [...dayGoals].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )) {
      rows.push({
        key: `goal:${goal.id}`,
        type: "object",
        dateKey,
        object: {
          id: goal.id,
          type: "goal",
          goal,
        },
      });
    }

    const timedObjects: Exclude<CalendarScheduleObject, { type: "goal" }>[] = [
      ...dayGroupEvents.map(
        (groupEvent): Exclude<CalendarScheduleObject, { type: "goal" }> => ({
          id: groupEvent.id,
          type: "groupEvent",
          groupEvent,
        }),
      ),
      ...dayEvents.map(
        (event): Exclude<CalendarScheduleObject, { type: "goal" }> => ({
          id: event.id,
          type: "event",
          event,
        }),
      ),
      ...dayActivities.map(
        (activity): Exclude<CalendarScheduleObject, { type: "goal" }> => ({
          id: activity.id,
          type: "activity",
          activity,
        }),
      ),
    ].sort(compareScheduleObjects);

    for (const object of timedObjects) {
      rows.push({
        key: getScheduleObjectRowKey(object),
        type: "object",
        dateKey,
        object,
      });
    }
  }

  return { rows, stickyHeaderIndices: [] };
}

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
    tss?: number | null;
    intensity_factor?: number | null;
    stress?: {
      tss?: number | null;
      intensity_factor?: number | null;
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

    for (const goal of dayGoals) {
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

    for (const groupEvent of dayGroupEvents) {
      rows.push({
        key: `group-event:${groupEvent.id}`,
        type: "object",
        dateKey,
        object: {
          id: groupEvent.id,
          type: "groupEvent",
          groupEvent,
        },
      });
    }

    for (const event of dayEvents) {
      rows.push({
        key: `event:${event.id}`,
        type: "object",
        dateKey,
        object: {
          id: event.id,
          type: "event",
          event,
        },
      });
    }

    for (const activity of dayActivities) {
      rows.push({
        key: `activity:${activity.id}`,
        type: "object",
        dateKey,
        object: {
          id: activity.id,
          type: "activity",
          activity,
        },
      });
    }
  }

  return { rows, stickyHeaderIndices: [] };
}

import type { CalendarProjectionItem } from "@repo/core";
import { addDaysToDateKey } from "@/lib/calendar/dateMath";

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
  eventCount: number;
};

export type ObjectRow = {
  key: string;
  type: "object";
  dateKey: string;
  object: CalendarProjectionItem;
};

export type CalendarTimelineRow = DayRow | ObjectRow;

export type CalendarTimelineModel = {
  rows: CalendarTimelineRow[];
  stickyHeaderIndices: number[];
};

type BuildRowsInput = {
  rangeStart: string;
  rangeEnd: string;
  itemsByDate: Map<string, CalendarProjectionItem[]>;
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

function getDaySignals(items: CalendarProjectionItem[]): CalendarDaySignals {
  const signals: CalendarDaySignals = {
    plannedCount: 0,
    activityPlanCount: 0,
    completedCount: 0,
    goalCount: 0,
    eventCount: 0,
  };
  for (const item of items) {
    if (item.kind === "planned_activity") signals.plannedCount += 1;
    if (item.plan) signals.activityPlanCount += 1;
    if (item.kind === "completed_activity") signals.completedCount += 1;
    if (item.kind === "goal") signals.goalCount += 1;
    if (item.kind === "event" || item.kind === "group_event") signals.eventCount += 1;
  }
  return signals;
}

export function buildCalendarTimelineRows({
  itemsByDate,
  rangeStart,
  rangeEnd,
}: BuildRowsInput): CalendarTimelineModel {
  const rows: CalendarTimelineRow[] = [];
  for (const dateKey of buildDayKeys(rangeStart, rangeEnd)) {
    const items = itemsByDate.get(dateKey) ?? [];
    rows.push({
      key: `day:${dateKey}`,
      type: "day",
      dateKey,
      itemCount: items.length,
      signals: getDaySignals(items),
    });
    for (const item of items) {
      rows.push({
        key: `${item.kind}:${item.id}`,
        type: "object",
        dateKey,
        object: item,
      });
    }
  }
  return { rows, stickyHeaderIndices: [] };
}

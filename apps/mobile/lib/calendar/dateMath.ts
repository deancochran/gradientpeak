import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";

export type CalendarMode = "day" | "month";

export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  return toDateKey(addDays(parseDateKey(dateKey), days));
}

export function addMonthsToDateKey(dateKey: string, months: number): string {
  return toDateKey(addMonths(parseDateKey(dateKey), months));
}

export function getStartOfMonthKey(dateKey: string): string {
  return toDateKey(startOfMonth(parseDateKey(dateKey)));
}

export function getEndOfMonthKey(dateKey: string): string {
  return toDateKey(endOfMonth(parseDateKey(dateKey)));
}

export function getNaturalAnchorForMode(dateKey: string, mode: CalendarMode): string {
  return mode === "month" ? getStartOfMonthKey(dateKey) : dateKey;
}

export function buildDayKeys(rangeStart: string, rangeEnd: string): string[] {
  const totalDays = Math.max(
    0,
    differenceInCalendarDays(parseDateKey(rangeEnd), parseDateKey(rangeStart)) + 1,
  );
  return Array.from({ length: totalDays }, (_, index) => addDaysToDateKey(rangeStart, index));
}

export function buildMonthStartKeys(rangeStart: string, rangeEnd: string): string[] {
  const keys: string[] = [];
  let cursor = getStartOfMonthKey(rangeStart);
  const lastKey = getStartOfMonthKey(rangeEnd);

  while (cursor <= lastKey) {
    keys.push(cursor);
    cursor = getStartOfMonthKey(addMonthsToDateKey(cursor, 1));
  }

  return keys;
}

export function getMonthGridStartKey(monthStartKey: string): string {
  const date = parseDateKey(monthStartKey);
  const weekday = date.getDay();
  const mondayOffset = (weekday + 6) % 7;
  return addDaysToDateKey(monthStartKey, -mondayOffset);
}

export function isSameMonth(dateKey: string, monthStartKey: string): boolean {
  return getStartOfMonthKey(dateKey) === getStartOfMonthKey(monthStartKey);
}

export function clampDateKeyToRange(dateKey: string, rangeStart: string, rangeEnd: string): string {
  if (dateKey < rangeStart) return rangeStart;
  if (dateKey > rangeEnd) return rangeEnd;
  return dateKey;
}

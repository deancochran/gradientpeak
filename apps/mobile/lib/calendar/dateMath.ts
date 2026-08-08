import {
  addDeviceCalendarDays,
  addDeviceCalendarMonths,
  endOfDeviceCalendarDateToIsoInstant,
  formatDateOnlyInTimeZone,
  formatDeviceCalendarDate,
  getDeviceCalendarMonthEnd,
  getDeviceCalendarMonthStart,
  isValidDateOnlyUtc,
  millisecondsUntilNextDeviceCalendarDate,
  parseDeviceCalendarDate,
  scheduledDateTimeToIsoInstant,
  startOfDeviceCalendarDateToIsoInstant,
} from "@repo/core/calendar";

export function toDateKey(date: Date): string {
  return formatDeviceCalendarDate(date);
}

export function toDateKeyInTimeZone(date: Date, timeZone: string): string {
  return formatDateOnlyInTimeZone(date, timeZone);
}

export function isCanonicalDateKey(value: string): boolean {
  return isValidDateOnlyUtc(value);
}

export function parseDateKey(dateKey: string): Date {
  return parseDeviceCalendarDate(dateKey);
}

export function toLocalDayStartIso(dateKey: string): string {
  return startOfDeviceCalendarDateToIsoInstant(dateKey);
}

export function toLocalDayEndIso(dateKey: string): string {
  return endOfDeviceCalendarDateToIsoInstant(dateKey);
}

/**
 * Converts a date-only calendar key to its planning-zone midnight instant.
 * Invalid zones and midnight DST gaps/folds intentionally remain unsupported.
 */
export function toPlanningDayStartIso(dateKey: string, timeZone: string): string {
  return scheduledDateTimeToIsoInstant({ scheduledDate: dateKey, time: "00:00", timeZone });
}

export function millisecondsUntilNextLocalDay(now: Date): number {
  return millisecondsUntilNextDeviceCalendarDate(now);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  return addDeviceCalendarDays(dateKey, days);
}

export function addMonthsToDateKey(dateKey: string, months: number): string {
  return addDeviceCalendarMonths(dateKey, months);
}

export function getStartOfMonthKey(dateKey: string): string {
  return getDeviceCalendarMonthStart(dateKey);
}

export function getEndOfMonthKey(dateKey: string): string {
  return getDeviceCalendarMonthEnd(dateKey);
}

export function getMonthAnchor(dateKey: string): string {
  return getStartOfMonthKey(dateKey);
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

export function getMonthGridDayCount(monthStartKey: string): number {
  const monthStart = parseDateKey(getStartOfMonthKey(monthStartKey));
  const monthEnd = parseDateKey(getEndOfMonthKey(monthStartKey));
  const startOffset = (monthStart.getDay() + 6) % 7;
  const endOffset = (6 - ((monthEnd.getDay() + 6) % 7) + 7) % 7;

  return startOffset + monthEnd.getDate() + endOffset;
}

export function isSameMonth(dateKey: string, monthStartKey: string): boolean {
  return getStartOfMonthKey(dateKey) === getStartOfMonthKey(monthStartKey);
}

export function clampDateKeyToRange(dateKey: string, rangeStart: string, rangeEnd: string): string {
  if (dateKey < rangeStart) return rangeStart;
  if (dateKey > rangeEnd) return rangeEnd;
  return dateKey;
}

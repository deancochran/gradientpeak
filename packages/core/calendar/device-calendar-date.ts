import { isValidDateOnlyUtc } from "../plan/dateOnlyUtc";

const MINUTE_MS = 60_000;

function assertValidCalendarDate(value: string): void {
  if (!isValidDateOnlyUtc(value)) {
    throw new RangeError("dateKey must be a valid YYYY-MM-DD date");
  }
}

function calendarDateParts(dateKey: string): [year: number, month: number, day: number] {
  assertValidCalendarDate(dateKey);
  const [year = 0, month = 0, day = 0] = dateKey.split("-").map(Number);
  return [year, month, day];
}

/** Formats a Date from the host device's local calendar fields. */
export function formatDeviceCalendarDate(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new RangeError("value must be a valid Date");
  return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(value.getDate()).padStart(2, "0")}`;
}

/** Parses a date-only value at local noon to avoid device-local midnight transition drift. */
export function parseDeviceCalendarDate(dateKey: string): Date {
  const [year, month, day] = calendarDateParts(dateKey);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** Adds device-local calendar days without treating a day as a fixed millisecond duration. */
export function addDeviceCalendarDays(dateKey: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError("days must be an integer");
  const date = parseDeviceCalendarDate(dateKey);
  date.setDate(date.getDate() + days);
  return formatDeviceCalendarDate(date);
}

/** Adds device-local calendar months, clamping to the target month's final day. */
export function addDeviceCalendarMonths(dateKey: string, months: number): string {
  if (!Number.isInteger(months)) throw new RangeError("months must be an integer");
  const date = parseDeviceCalendarDate(dateKey);
  const targetMonthStart = new Date(date.getFullYear(), date.getMonth() + months, 1, 12, 0, 0, 0);
  const targetMonthEnd = new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth() + 1,
    0,
    12,
    0,
    0,
    0,
  );
  targetMonthStart.setDate(Math.min(date.getDate(), targetMonthEnd.getDate()));
  return formatDeviceCalendarDate(targetMonthStart);
}

export function getDeviceCalendarMonthStart(dateKey: string): string {
  const [year, month] = calendarDateParts(dateKey);
  return formatDeviceCalendarDate(new Date(year, month - 1, 1, 12, 0, 0, 0));
}

export function getDeviceCalendarMonthEnd(dateKey: string): string {
  const [year, month] = calendarDateParts(dateKey);
  return formatDeviceCalendarDate(new Date(year, month, 0, 12, 0, 0, 0));
}

/** Resolves host-device local midnight for a date-only value. */
export function startOfDeviceCalendarDateToIsoInstant(dateKey: string): string {
  const [year, month, day] = calendarDateParts(dateKey);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

/** Resolves the final millisecond of a host-device local calendar date. */
export function endOfDeviceCalendarDateToIsoInstant(dateKey: string): string {
  const [year, month, day] = calendarDateParts(dateKey);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

/** Returns the delay to the next host-device local midnight, bounded away from zero. */
export function millisecondsUntilNextDeviceCalendarDate(now: Date): number {
  if (Number.isNaN(now.getTime())) throw new RangeError("now must be a valid Date");
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 0, 0);
  return Math.max(MINUTE_MS, nextDay.getTime() - now.getTime());
}

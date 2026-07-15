export type MinuteOfDayContext = "start" | "end";

function assertMinuteOfDay(minuteOfDay: number, context: MinuteOfDayContext): void {
  const maximum = context === "end" ? 1440 : 1439;
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > maximum) {
    throw new RangeError(`${context} minute of day must be an integer from 0 to ${maximum}`);
  }
}

/** Converts a persisted minute-of-day value to the platform picker's strict HH:mm value. */
export function minuteOfDayToTimeInput(minuteOfDay: number, context: MinuteOfDayContext): string {
  assertMinuteOfDay(minuteOfDay, context);
  const pickerMinute = minuteOfDay === 1440 ? 0 : minuteOfDay;
  const hours = Math.floor(pickerMinute / 60);
  const minutes = pickerMinute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Converts strict platform HH:mm input to persisted minutes, preserving end-of-day midnight. */
export function timeInputToMinuteOfDay(value: string, context: MinuteOfDayContext): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new RangeError("Time input must use strict HH:mm format");
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new RangeError("Time input must be between 00:00 and 23:59");
  }

  const minuteOfDay = hours * 60 + minutes;
  return context === "end" && minuteOfDay === 0 ? 1440 : minuteOfDay;
}

/** Formats persisted minutes for summaries, where the end sentinel is clearer as 24:00. */
export function formatMinuteOfDaySummary(minuteOfDay: number, context: MinuteOfDayContext): string {
  assertMinuteOfDay(minuteOfDay, context);
  return context === "end" && minuteOfDay === 1440
    ? "24:00"
    : minuteOfDayToTimeInput(minuteOfDay, context);
}

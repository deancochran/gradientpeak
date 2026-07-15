import { getScheduledDateKey, scheduledDateTimeToIsoInstant } from "@repo/core";
import { format } from "date-fns";

export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function getFormatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat("en-US", options);
  }
}

function getParts(instant: Date, timeZone: string) {
  return Object.fromEntries(
    getFormatter(timeZone, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute", number>;
}

export function getEventScheduledDate(event: {
  all_day?: boolean | null;
  scheduled_date?: string | null;
  starts_at?: string | null;
  timezone?: string | null;
}): string | null {
  if (event.scheduled_date) return event.scheduled_date;
  if (!event.starts_at) return null;
  if (event.all_day) return event.starts_at.slice(0, 10);

  try {
    return getScheduledDateKey(event.starts_at, event.timezone);
  } catch {
    return event.starts_at.slice(0, 10);
  }
}

/** Represents event wall time as a device-local Date for native date/time inputs. */
export function eventDateForEditor(event: {
  all_day?: boolean | null;
  scheduled_date?: string | null;
  starts_at: string;
  timezone?: string | null;
}): Date {
  const dateKey = getEventScheduledDate(event);
  if (event.all_day && dateKey) return dateKeyToLocalDate(dateKey, 12, 0);

  const instant = new Date(event.starts_at);
  if (Number.isNaN(instant.getTime())) return new Date();
  if (!event.timezone) return instant;

  try {
    const parts = getParts(instant, event.timezone);
    return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
  } catch {
    return instant;
  }
}

export function dateKeyToLocalDate(dateKey: string, hour = 9, minute = 0): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour, minute, 0, 0);
}

export function buildScheduledInstant(dateKey: string, value: Date, timeZone: string): string {
  return scheduledDateTimeToIsoInstant({
    scheduledDate: dateKey,
    time: format(value, "HH:mm"),
    timeZone,
  });
}

export function formatEventTime(isoInstant: string, timeZone?: string | null): string {
  const instant = new Date(isoInstant);
  if (Number.isNaN(instant.getTime())) return "Scheduled";
  if (!timeZone) return format(instant, "h:mm a");

  return getFormatter(timeZone, { hour: "numeric", minute: "2-digit" }).format(instant);
}

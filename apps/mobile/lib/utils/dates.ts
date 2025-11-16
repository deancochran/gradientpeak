/**
 * Shared date formatting utilities
 * Centralized to avoid duplication and ensure consistent formatting
 */

/**
 * Format a date to a readable string
 * Examples: "Today", "Tomorrow", "Mon, Jan 15", "Monday"
 */
export function formatDate(
  date: Date | string,
  options?: {
    relative?: boolean;
    includeYear?: boolean;
    format?: "short" | "long";
  }
): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const activityDate = new Date(
    dateObj.getFullYear(),
    dateObj.getMonth(),
    dateObj.getDate()
  );

  // Relative dates if enabled
  if (options?.relative !== false) {
    if (activityDate.getTime() === today.getTime()) return "Today";
    if (activityDate.getTime() === tomorrow.getTime()) return "Tomorrow";
    if (activityDate.getTime() === yesterday.getTime()) return "Yesterday";

    // Check if it's this week
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000);

    if (activityDate >= startOfWeek && activityDate <= endOfWeek) {
      return dateObj.toLocaleDateString(undefined, { weekday: "long" });
    }

    // Check if it's next week
    const nextWeekStart = new Date(
      endOfWeek.getTime() + 1 * 24 * 60 * 60 * 1000
    );
    const nextWeekEnd = new Date(
      nextWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000
    );

    if (activityDate >= nextWeekStart && activityDate <= nextWeekEnd) {
      return `Next ${dateObj.toLocaleDateString(undefined, { weekday: "long" })}`;
    }
  }

  // Standard formatting
  const formatOptions: Intl.DateTimeFormatOptions =
    options?.format === "long"
      ? {
          weekday: "long",
          year: options?.includeYear ? "numeric" : undefined,
          month: "long",
          day: "numeric",
        }
      : {
          weekday: "short",
          year: options?.includeYear ? "numeric" : undefined,
          month: "short",
          day: "numeric",
        };

  return dateObj.toLocaleDateString(undefined, formatOptions);
}

/**
 * Format a time to a readable string
 * Example: "2:30 PM"
 */
export function formatTime(
  date: Date | string,
  options?: {
    includeSeconds?: boolean;
    use24Hour?: boolean;
  }
): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  return dateObj.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: options?.includeSeconds ? "2-digit" : undefined,
    hour12: !options?.use24Hour,
  });
}

/**
 * Format a date and time together
 * Example: "Today at 2:30 PM" or "Mon, Jan 15 at 2:30 PM"
 */
export function formatDateTime(
  date: Date | string,
  options?: {
    relative?: boolean;
    includeYear?: boolean;
    use24Hour?: boolean;
  }
): string {
  const dateStr = formatDate(date, {
    relative: options?.relative,
    includeYear: options?.includeYear,
  });
  const timeStr = formatTime(date, { use24Hour: options?.use24Hour });

  return `${dateStr} at ${timeStr}`;
}

/**
 * Format duration in minutes to readable string
 * Examples: "30min", "1h 30min", "2h"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}min`;
}

/**
 * Format duration in milliseconds to readable string
 * Examples: "30min", "1h 30min", "2h"
 */
export function formatDurationMs(ms: number): string {
  return formatDuration(Math.round(ms / 60000));
}

/**
 * Format duration in seconds to readable string
 * Examples: "30min", "1h 30min", "2h"
 */
export function formatDurationSec(seconds: number): string {
  return formatDuration(Math.round(seconds / 60));
}

/**
 * Get ISO date string (YYYY-MM-DD) from Date object
 */
export function toISODate(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toISOString().split("T")[0];
}

/**
 * Get date for tomorrow in ISO format
 */
export function getTomorrowISO(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return tomorrow.toISOString();
}

/**
 * Get date for today in ISO format (start of day)
 */
export function getTodayISO(): string {
  return new Date().toISOString();
}

/**
 * Parse ISO date string to Date object
 */
export function parseISODate(isoString: string): Date {
  return new Date(isoString);
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date | string, date2: Date | string): boolean {
  const d1 = typeof date1 === "string" ? new Date(date1) : date1;
  const d2 = typeof date2 === "string" ? new Date(date2) : date2;

  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string): boolean {
  return isSameDay(date, new Date());
}

/**
 * Check if a date is in the past
 */
export function isPast(date: Date | string): boolean {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj < new Date();
}

/**
 * Check if a date is in the future
 */
export function isFuture(date: Date | string): boolean {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj > new Date();
}

/**
 * Get start of week for a given date (Sunday)
 */
export function getStartOfWeek(date: Date = new Date()): Date {
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return startOfWeek;
}

/**
 * Get end of week for a given date (Saturday)
 */
export function getEndOfWeek(date: Date = new Date()): Date {
  const endOfWeek = new Date(date);
  endOfWeek.setDate(date.getDate() + (6 - date.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);
  return endOfWeek;
}

/**
 * Get all dates in a week
 */
export function getWeekDates(startDate?: Date): Date[] {
  const start = startDate ? getStartOfWeek(startDate) : getStartOfWeek();
  const dates: Date[] = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date);
  }

  return dates;
}

/**
 * Format a date range
 * Example: "Jan 15 - Jan 21, 2024"
 */
export function formatDateRange(
  startDate: Date | string,
  endDate: Date | string,
  options?: {
    includeYear?: boolean;
  }
): string {
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;

  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  if (sameMonth) {
    // Same month: "Jan 15 - 21, 2024"
    const startDay = start.getDate();
    const endDay = end.getDate();
    const month = start.toLocaleDateString(undefined, { month: "short" });
    const year = options?.includeYear ? `, ${start.getFullYear()}` : "";
    return `${month} ${startDay} - ${endDay}${year}`;
  }

  if (sameYear) {
    // Same year: "Jan 15 - Feb 4, 2024"
    const startStr = start.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const endStr = end.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const year = options?.includeYear ? `, ${start.getFullYear()}` : "";
    return `${startStr} - ${endStr}${year}`;
  }

  // Different years: "Dec 28, 2023 - Jan 4, 2024"
  const startStr = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const endStr = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startStr} - ${endStr}`;
}

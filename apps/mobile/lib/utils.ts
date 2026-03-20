import { format, isToday, isYesterday } from "date-fns";

/**
 * Format a date as relative time (e.g., "5m ago", "Yesterday", "3/4/26")
 * Best practice for messaging UIs - matches WhatsApp, iMessage, etc.
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;

  if (isToday(d)) {
    return format(d, "h:mm a");
  }

  if (isYesterday(d)) {
    return "Yesterday";
  }

  // For older dates, show date in format like "3/4/26"
  return format(d, "M/d/yy");
}

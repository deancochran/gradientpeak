import { format } from "date-fns";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";
import type { CalendarEvent } from "./normalizeEvents";

function readMetric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatEstimatedDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;

  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function isEditableEvent(event: CalendarEvent): boolean {
  return event.event_type !== "imported";
}

export function isRecurringEvent(event: CalendarEvent): boolean {
  return !!(event.series_id || event.recurrence_rule || event.recurrence?.rule);
}

export function getEventTitle(event: CalendarEvent): string {
  if (event.event_type === "planned") {
    return event.activity_plan?.name || event.title || "Planned activity";
  }

  if (event.event_type === "rest_day") return event.title || "Rest day";
  if (event.event_type === "race_target") return event.title || "Race target";
  if (event.event_type === "custom") return event.title || "Custom event";
  if (event.event_type === "imported") return event.title || "Imported event";
  return event.title || "Scheduled event";
}

export function getEventTimeLabel(event: CalendarEvent): string {
  if (event.all_day) return "All day";
  if (event.starts_at) return format(new Date(event.starts_at), "h:mm a");
  return "Scheduled";
}

export function getEventPrimaryMeta(event: CalendarEvent): string[] {
  if (event.event_type === "planned") {
    const duration = formatEstimatedDuration(readMetric(event.activity_plan?.estimated_duration));
    const tss = readMetric(event.activity_plan?.estimated_tss);
    return [
      event.activity_plan?.activity_category
        ?.split("_")
        .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
        .join(" ") ?? null,
      duration,
      typeof tss === "number" ? `${Math.round(tss)} TSS` : null,
    ].filter(Boolean) as string[];
  }

  return [event.notes?.trim() || event.description?.trim() || null].filter(Boolean) as string[];
}

export function getEventSupportingLine(event: CalendarEvent): string | null {
  if (event.event_type === "planned") {
    return (
      event.activity_plan?.description?.trim() ||
      event.notes?.trim() ||
      event.description?.trim() ||
      null
    );
  }

  if (event.all_day) return "All day";
  if (event.starts_at) return `Starts ${format(new Date(event.starts_at), "h:mm a")}`;
  return event.notes?.trim() || event.description?.trim() || null;
}

export function getEventBadges(event: CalendarEvent): string[] {
  const completed = event.event_type === "planned" ? isActivityCompleted(event) : false;
  return [
    completed ? "Completed" : null,
    isRecurringEvent(event) ? "Recurring" : null,
    event.event_type === "imported" ? "Read-only" : null,
    event.activity_plan?.id ? "From Plan" : null,
  ].filter(Boolean) as string[];
}

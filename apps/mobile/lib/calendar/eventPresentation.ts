import { format } from "date-fns";
import { getAuthoritativeActivityPlanMetrics } from "@/lib/activityPlanMetrics";
import { formatEstimatedDurationSeconds, formatEstimatedTss } from "@/lib/estimatedMetrics";
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

function formatCategoryLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value
    .split("_")
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
}

function trimText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hasActivityPlan(event: CalendarEvent): boolean {
  return Boolean(event.activity_plan?.id);
}

export function isEditableEvent(event: CalendarEvent): boolean {
  return event.event_type !== "imported" && event.event_type !== "rest_day";
}

export function isRecurringEvent(event: CalendarEvent): boolean {
  return !!(event.series_id || event.recurrence_rule || event.recurrence?.rule);
}

export function getEventTitle(event: CalendarEvent): string {
  if (event.event_type === "planned" && hasActivityPlan(event)) {
    return event.activity_plan?.name || event.title || "Planned activity";
  }

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
  if (event.event_type === "planned" && hasActivityPlan(event)) {
    const metrics = getAuthoritativeActivityPlanMetrics(event.activity_plan);
    const duration = formatEstimatedDurationSeconds(readMetric(metrics.estimated_duration));
    const tss = readMetric(metrics.estimated_tss);
    return [
      formatCategoryLabel(event.activity_plan?.activity_category),
      duration,
      duration ? null : formatEstimatedTss(tss),
    ].filter(Boolean) as string[];
  }

  return [];
}

export function getEventSupportingLine(event: CalendarEvent): string | null {
  if (event.event_type === "planned" && hasActivityPlan(event)) {
    return (
      trimText(event.activity_plan?.description) ||
      trimText(event.notes) ||
      trimText(event.description) ||
      null
    );
  }

  return trimText(event.notes) || trimText(event.description) || null;
}

export function getEventStatusLabel(event: CalendarEvent): string | null {
  const completed =
    event.event_type === "planned" && hasActivityPlan(event) ? isActivityCompleted(event) : false;

  if (completed) {
    return "Completed";
  }

  if (event.event_type === "imported") {
    return "Read-only";
  }

  if (isRecurringEvent(event)) {
    return "Recurring";
  }

  return null;
}

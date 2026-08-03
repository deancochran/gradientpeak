import { getActivityQuantificationPresentation } from "@repo/ui/lib/activity-quantification-presentation";
import { format } from "date-fns";
import { getActivityPlanQuantitySummary } from "@/lib/activityPlanMetrics";
import { formatEstimatedDurationSeconds } from "@/lib/estimatedMetrics";
import { formatEventTime } from "./eventSchedule";
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

type PlannedRecordingState =
  | "completed"
  | "unverified"
  | "planned"
  | "cancelled"
  | "skipped"
  | "rescheduled";

function getNonCompletionState(
  event: CalendarEvent,
): Exclude<PlannedRecordingState, "completed" | "unverified" | "planned"> | null {
  if (event.status === "cancelled") return "cancelled";
  if (event.status === "skipped") return "skipped";
  if (event.status === "rescheduled") return "rescheduled";
  return null;
}

/** Completion truth for calendar events requires a persisted activity identity. */
export function isAuthoritativeCompletedCalendarEvent(event: CalendarEvent): boolean {
  if (getNonCompletionState(event)) return false;
  return Boolean(event.linked_activity_id || event.event_type === "imported");
}

export function getPlannedRecordingState(event: CalendarEvent): PlannedRecordingState {
  const nonCompletionState = getNonCompletionState(event);
  if (nonCompletionState) return nonCompletionState;
  if (isAuthoritativeCompletedCalendarEvent(event)) return "completed";
  return event.status === "expired" || event.status === "completed" || event.completed
    ? "unverified"
    : "planned";
}

export function getEventCommonLoadMeta(event: CalendarEvent): string[] {
  const quantification =
    event.activity_plan?.prescriptionQuantification ?? event.prescriptionQuantification;
  if (quantification === undefined) return [];
  const presentation = getActivityQuantificationPresentation(quantification);
  if (
    presentation.kind === "unavailable" ||
    presentation.commonLoad.unavailableReason === "unsupported_modality"
  ) {
    return [];
  }
  if (presentation.commonLoad.status === "unavailable") {
    const value =
      presentation.commonLoad.unavailableReason === "private_data"
        ? "Private"
        : presentation.commonLoad.value;
    return [`${presentation.commonLoad.label} ${value}`];
  }
  const commonLoadSuffix = presentation.commonLoad.status === "partial" ? " · Incomplete" : "";
  const intensitySuffix =
    presentation.normalizedIntensity.status === "partial" ? " · Incomplete" : "";
  return [
    `${presentation.commonLoad.label} ${presentation.commonLoad.value}${commonLoadSuffix}`,
    `${presentation.normalizedIntensity.label} ${presentation.normalizedIntensity.value}${intensitySuffix}`,
  ];
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
  if (event.starts_at) {
    const preservesActivityInstant =
      event.event_type === "imported" ||
      (event.event_type === "planned" &&
        hasActivityPlan(event) &&
        isAuthoritativeCompletedCalendarEvent(event));
    return preservesActivityInstant
      ? format(new Date(event.starts_at), "h:mm a")
      : formatEventTime(event.starts_at, event.timezone);
  }
  return "Scheduled";
}

export function getEventPrimaryMeta(event: CalendarEvent): string[] {
  if (event.event_type === "planned" && hasActivityPlan(event)) {
    const quantitySummary = getActivityPlanQuantitySummary(event.activity_plan);
    const duration = formatEstimatedDurationSeconds(readMetric(quantitySummary.durationSeconds));
    return [
      formatCategoryLabel(event.activity_plan?.activity_category),
      duration,
      ...getEventCommonLoadMeta(event),
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
  const recordingState =
    event.event_type === "planned" && hasActivityPlan(event)
      ? getPlannedRecordingState(event)
      : null;

  if (recordingState === "cancelled") return "Cancelled";
  if (recordingState === "skipped") return "Skipped";
  if (recordingState === "rescheduled") return "Rescheduled";
  if (recordingState === "completed") return "Completed";

  if (recordingState === "unverified") {
    return "Unverified";
  }

  if (event.event_type === "imported") {
    return "Read-only";
  }

  if (isRecurringEvent(event)) {
    return "Recurring";
  }

  return null;
}

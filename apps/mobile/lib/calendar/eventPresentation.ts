import {
  type ActivityPlanMetric,
  type ActivityPlanMetricKey,
  createActivityPlanMetric,
  getPlannedEstimate,
} from "@repo/core";
import { formatActivityPlanHeadlineMetric } from "@repo/ui/lib/activity-plan-metric-presentation";
import { format } from "date-fns";
import { formatEventTime } from "./eventSchedule";
import type { CalendarEvent } from "./normalizeEvents";

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
  return Boolean(event.linked_activity_id);
}

export function getPlannedRecordingState(event: CalendarEvent): PlannedRecordingState {
  const nonCompletionState = getNonCompletionState(event);
  if (nonCompletionState) return nonCompletionState;
  if (isAuthoritativeCompletedCalendarEvent(event)) return "completed";
  return event.status === "expired" || event.status === "completed" || event.completed
    ? "unverified"
    : "planned";
}

function unavailablePlanMetric(
  key: ActivityPlanMetricKey,
  label: string,
  unit: string,
  reason: string,
): ActivityPlanMetric {
  return createActivityPlanMetric({
    key,
    label,
    status: "unavailable",
    value: null,
    unit,
    reason,
    provenance: null,
  });
}

function plannedQuantityUnavailableReason(
  quantity: ReturnType<typeof getPlannedEstimate>["durationSeconds"],
): string {
  if (quantity.status === "partial") return "incomplete_members";
  return quantity.status === "unavailable" ? quantity.reason : "not_available";
}

function getEventPlanMetric(event: CalendarEvent, key: ActivityPlanMetricKey): unknown {
  const projected = event.projectionMetrics?.find((metric) => metric.key === key);
  if (projected) return projected;

  const quantification =
    event.activity_plan?.prescriptionQuantification ?? event.prescriptionQuantification;
  if (!quantification) return undefined;
  const estimate = getPlannedEstimate(quantification);

  if (key === "elapsed_duration") {
    const duration = estimate.durationSeconds;
    if (duration.status === "known" || duration.status === "estimated") {
      return createActivityPlanMetric({
        key,
        label: "Duration",
        status: "available",
        value: duration.value,
        unit: "seconds",
        reason: null,
        provenance: duration.status === "known" ? "authored" : "estimated",
      });
    }
    return unavailablePlanMetric(
      key,
      "Duration",
      "seconds",
      plannedQuantityUnavailableReason(duration),
    );
  }

  if (key === "common_load") {
    const load = estimate.load;
    if (load.status === "estimated") {
      return createActivityPlanMetric({
        key,
        label: "Common Load",
        status: "available",
        value: load.value,
        unit: "score",
        reason: null,
        provenance: "estimated",
      });
    }
    return unavailablePlanMetric(
      key,
      "Common Load",
      "score",
      load.status === "partial" ? "incomplete_members" : load.reason,
    );
  }

  return undefined;
}

export function getEventCommonLoadMeta(event: CalendarEvent): string[] {
  const load = getEventPlanMetric(event, "common_load");
  const objectiveIntensity = getEventPlanMetric(event, "objective_intensity");
  return [
    load === undefined
      ? null
      : `Common Load ${formatActivityPlanHeadlineMetric(load, "common_load")}`,
    objectiveIntensity === undefined
      ? null
      : `Intensity ${formatActivityPlanHeadlineMetric(objectiveIntensity, "objective_intensity")}`,
  ].filter((value): value is string => value !== null);
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
  return event.title || "Scheduled event";
}

export function getEventTimeLabel(event: CalendarEvent): string {
  if (event.all_day) return "All day";
  if (event.starts_at) {
    const preservesActivityInstant =
      event.event_type === "planned" &&
      hasActivityPlan(event) &&
      isAuthoritativeCompletedCalendarEvent(event);
    return preservesActivityInstant
      ? format(new Date(event.starts_at), "h:mm a")
      : formatEventTime(event.starts_at, event.timezone);
  }
  return "Scheduled";
}

export function getEventPrimaryMeta(event: CalendarEvent): string[] {
  if (event.event_type === "planned" && hasActivityPlan(event)) {
    const durationMetric = getEventPlanMetric(event, "elapsed_duration");
    const duration =
      durationMetric === undefined
        ? null
        : formatActivityPlanHeadlineMetric(durationMetric, "elapsed_duration");
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

  if (isRecurringEvent(event)) {
    return "Recurring";
  }

  return null;
}

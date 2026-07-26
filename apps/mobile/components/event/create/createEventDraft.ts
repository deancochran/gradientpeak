import type { eventCreateSchema } from "@repo/core";
import { format } from "date-fns";
import type { z } from "zod";
import {
  buildCreateStartsAt,
  buildRecurrenceFromFrequency,
  type EventRecurrenceFrequency,
} from "@/components/event/EventEditorCard";
import { buildScheduledInstant, getDeviceTimeZone } from "@/lib/calendar/eventSchedule";

export type CreateEventMode = "custom" | "planned";

export type CreateEventDraft =
  | {
      mode: "custom";
      eventType: "custom" | "race_target";
      title: string;
      startsAt: Date;
      allDay: boolean;
      scheduledDate: string;
      timezone: string;
      recurrenceFrequency: EventRecurrenceFrequency;
      recurrenceEndDate: string | null;
      notes: string;
      routeId: string | null;
      routeName: string | null;
    }
  | {
      mode: "planned";
      activityPlanId: string | null;
      activityPlanName: string | null;
      routeId: string | null;
      routeName: string | null;
      scheduledDate: string;
      timezone: string;
      recurrenceFrequency: EventRecurrenceFrequency;
      recurrenceEndDate: string | null;
      title: string;
      notes: string;
    };

export function createDefaultEventDraft(input: {
  createDate?: string;
  mode: CreateEventMode;
  notes?: string;
  title?: string;
}): CreateEventDraft {
  const startsAt = buildCreateStartsAt(input.createDate);
  const title = input.title ?? "";
  const notes = input.notes ?? "";

  if (input.mode === "planned") {
    return {
      mode: "planned",
      activityPlanId: null,
      activityPlanName: null,
      routeId: null,
      routeName: null,
      scheduledDate: format(startsAt, "yyyy-MM-dd"),
      timezone: getDeviceTimeZone(),
      recurrenceFrequency: "none",
      recurrenceEndDate: null,
      title,
      notes,
    };
  }

  return {
    mode: "custom",
    eventType: "custom",
    title,
    startsAt,
    scheduledDate: format(startsAt, "yyyy-MM-dd"),
    timezone: getDeviceTimeZone(),
    allDay: false,
    recurrenceFrequency: "none",
    recurrenceEndDate: null,
    notes,
    routeId: null,
    routeName: null,
  };
}

export function buildCreateEventInput(
  draft: CreateEventDraft,
  input: { trainingPlanId?: string } = {},
): z.input<typeof eventCreateSchema> {
  const notes = draft.notes.trim() ? draft.notes.trim() : null;
  const base = {
    lifecycle: { status: "scheduled" as const },
    notes,
    read_only: false as const,
    timezone: draft.timezone,
  };
  const recurrence = buildRecurrenceFromFrequency(
    draft.recurrenceFrequency,
    draft.recurrenceEndDate,
    draft.timezone,
  );

  if (draft.mode === "planned") {
    if (!draft.activityPlanId && !draft.routeId) {
      throw new Error("Choose an activity plan, a route, or both before saving.");
    }

    return {
      ...base,
      event_type: "planned",
      activity_plan_id: draft.activityPlanId,
      route_id: draft.routeId,
      all_day: true,
      ...(recurrence ? { recurrence } : {}),
      scheduled_date: draft.scheduledDate,
      title:
        draft.title.trim() ||
        draft.activityPlanName?.trim() ||
        draft.routeName?.trim() ||
        "Planned Activity",
      training_plan_id: input.trainingPlanId,
    };
  }

  return {
    ...base,
    event_type: draft.eventType,
    route_id: draft.routeId,
    all_day: draft.allDay,
    scheduled_date: draft.scheduledDate,
    starts_at: draft.allDay
      ? `${draft.scheduledDate}T00:00:00.000Z`
      : buildScheduledInstant(draft.scheduledDate, draft.startsAt, draft.timezone),
    title: draft.title.trim(),
    ...(recurrence ? { recurrence } : {}),
  };
}

export function buildUpdatePatch(draft: CreateEventDraft) {
  const notes = draft.notes.trim() ? draft.notes.trim() : null;
  const recurrence = buildRecurrenceFromFrequency(
    draft.recurrenceFrequency,
    draft.recurrenceEndDate,
    draft.timezone,
  );

  if (draft.mode === "planned") {
    return {
      activity_plan_id: draft.activityPlanId,
      all_day: true,
      event_type: "planned" as const,
      notes,
      recurrence,
      route_id: draft.routeId,
      scheduled_date: draft.scheduledDate,
      starts_at: `${draft.scheduledDate}T00:00:00.000Z`,
      timezone: draft.timezone,
      title:
        draft.title.trim() ||
        draft.activityPlanName?.trim() ||
        draft.routeName?.trim() ||
        "Planned Activity",
    };
  }

  return {
    activity_plan_id: null,
    all_day: draft.allDay,
    event_type: draft.eventType,
    notes,
    recurrence,
    route_id: draft.routeId,
    scheduled_date: draft.scheduledDate,
    starts_at: draft.allDay
      ? `${draft.scheduledDate}T00:00:00.000Z`
      : buildScheduledInstant(draft.scheduledDate, draft.startsAt, draft.timezone),
    timezone: draft.timezone,
    title: draft.title.trim(),
  };
}

export function removeActivityPlanFromDraft(draft: CreateEventDraft): CreateEventDraft {
  if (draft.mode !== "planned") return draft;
  if (draft.routeId) {
    return { ...draft, activityPlanId: null, activityPlanName: null };
  }

  return {
    mode: "custom",
    eventType: "custom",
    title: draft.title,
    startsAt: new Date(`${draft.scheduledDate}T12:00:00`),
    scheduledDate: draft.scheduledDate,
    timezone: draft.timezone,
    allDay: true,
    recurrenceFrequency: draft.recurrenceFrequency,
    recurrenceEndDate: draft.recurrenceEndDate,
    notes: draft.notes,
    routeId: null,
    routeName: null,
  };
}

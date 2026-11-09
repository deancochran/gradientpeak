import type { eventCreateSchema } from "@repo/core";
import { format } from "date-fns";
import type { z } from "zod";
import {
  buildCreateStartsAt,
  buildRecurrenceFromFrequency,
  type EventRecurrenceFrequency,
} from "@/components/event/EventEditorCard";
import { buildScheduledInstant } from "@/lib/calendar/eventSchedule";

export type CreateEventMode = "custom" | "planned";

export type CreateEventDraft =
  | {
      mode: "custom";
      eventType: "custom" | "race_target";
      title: string;
      startsAt: Date;
      allDay: boolean;
      scheduledDate: string;
      timezone: string | null;
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
    timezone: null,
    allDay: false,
    recurrenceFrequency: "none",
    recurrenceEndDate: null,
    notes,
    routeId: null,
    routeName: null,
  };
}

export function buildCreateEventInput(draft: CreateEventDraft): z.input<typeof eventCreateSchema> {
  const notes = draft.notes.trim() ? draft.notes.trim() : null;

  if (draft.mode === "planned") {
    throw new Error("Executable sessions must be created through plannedSessions.create.");
  }
  if (!draft.timezone) {
    throw new Error("Choose the event time zone before saving.");
  }

  const recurrence = buildRecurrenceFromFrequency(
    draft.recurrenceFrequency,
    draft.recurrenceEndDate,
    draft.timezone,
  );

  return {
    notes,
    timezone: draft.timezone,
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

  if (draft.mode === "planned") {
    throw new Error("Executable sessions must be changed through plannedSessions mutations.");
  }
  if (!draft.timezone) {
    throw new Error("Choose the event time zone before saving.");
  }

  return {
    all_day: draft.allDay,
    notes,
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
  return draft;
}

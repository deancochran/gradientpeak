import { format } from "date-fns";
import {
  buildCreateStartsAt,
  buildRecurrenceFromFrequency,
  type EventRecurrenceFrequency,
} from "@/components/event/EventEditorCard";

export type CreateEventMode = "custom" | "planned";

export type CreateEventDraft =
  | {
      mode: "custom";
      title: string;
      startsAt: Date;
      allDay: boolean;
      recurrenceFrequency: EventRecurrenceFrequency;
      recurrenceEndDate: string | null;
      notes: string;
    }
  | {
      mode: "planned";
      activityPlanId: string | null;
      activityPlanName: string | null;
      scheduledDate: string;
      recurrenceFrequency: EventRecurrenceFrequency;
      recurrenceEndDate: string | null;
      title: string;
      notes: string;
    };

export type CreateEventInput = {
  activity_plan_id?: string;
  all_day: boolean;
  event_type: CreateEventMode;
  lifecycle: { status: "scheduled" };
  notes: string | null;
  read_only: false;
  recurrence?: NonNullable<ReturnType<typeof buildRecurrenceFromFrequency>>;
  scheduled_date?: string;
  starts_at?: string;
  timezone: string;
  title: string;
  training_plan_id?: string;
};

export function toDateOnly(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export function buildAllDayStartIso(value: Date) {
  return `${toDateOnly(value)}T00:00:00.000Z`;
}

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
      scheduledDate: format(startsAt, "yyyy-MM-dd"),
      recurrenceFrequency: "none",
      recurrenceEndDate: null,
      title,
      notes,
    };
  }

  return {
    mode: "custom",
    title,
    startsAt,
    allDay: false,
    recurrenceFrequency: "none",
    recurrenceEndDate: null,
    notes,
  };
}

export function buildCreateEventInput(
  draft: CreateEventDraft,
  input: { trainingPlanId?: string } = {},
): CreateEventInput {
  const notes = draft.notes.trim() ? draft.notes.trim() : null;
  const base = {
    lifecycle: { status: "scheduled" as const },
    notes,
    read_only: false as const,
    timezone: "UTC",
  };
  const recurrence = buildRecurrenceFromFrequency(
    draft.recurrenceFrequency,
    draft.recurrenceEndDate,
  );

  if (draft.mode === "planned") {
    return {
      ...base,
      event_type: "planned",
      activity_plan_id: draft.activityPlanId ?? undefined,
      all_day: true,
      ...(recurrence ? { recurrence } : {}),
      scheduled_date: draft.scheduledDate,
      title: draft.title.trim() || draft.activityPlanName?.trim() || "Planned Activity",
      training_plan_id: input.trainingPlanId,
    };
  }

  return {
    ...base,
    event_type: "custom",
    all_day: draft.allDay,
    starts_at: draft.allDay ? buildAllDayStartIso(draft.startsAt) : draft.startsAt.toISOString(),
    title: draft.title.trim(),
    ...(recurrence ? { recurrence } : {}),
  };
}

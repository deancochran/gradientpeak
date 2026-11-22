import { z } from "zod";
import {
  endOfScheduledDateToIsoInstant,
  formatIsoInstantInIanaZone,
  scheduledDateTimeToIsoInstant,
} from "../calendar";

export const groupEventRecurrenceFrequencySchema = z.enum(["none", "daily", "weekly", "monthly"]);

/**
 * A renderer-neutral draft for editing one scheduled group event.  It deliberately
 * excludes group/event identifiers and mutation variants, which belong to app
 * adapters at the transport boundary.
 */
export const groupEventEditorDraftSchema = z.object({
  date: z.string(),
  description: z.string(),
  endDate: z.string().nullable(),
  endsTime: z.string().nullable(),
  locationName: z.string(),
  recurrenceEndDate: z.string().nullable(),
  recurrenceFrequency: groupEventRecurrenceFrequencySchema,
  routeId: z.string().nullable(),
  startsTime: z.string(),
  title: z.string(),
  timezone: z.string().nullable(),
});
export type GroupEventEditorDraft = z.infer<typeof groupEventEditorDraftSchema> & {
  /** A persisted seed could not be rendered safely; do not submit it unchanged. */
  initializationError?: string;
};
export type GroupEventRecurrenceFrequency = z.infer<typeof groupEventRecurrenceFrequencySchema>;

export type GroupEventEditorSeed = {
  activityPlanId?: string | null;
  description?: string | null;
  endsAt?: string | null;
  locationName?: string | null;
  recurrenceRule?: string | null;
  routeId?: string | null;
  startsAt?: string | null;
  timezone?: string | null;
  title?: string | null;
};

export type PreparedGroupEventEditorPayload = {
  activityPlanId?: string | null;
  description: string | null;
  endsAt: string | null;
  locationName: string | null;
  recurrenceRule?: string;
  recurrenceTimezone?: string;
  routeId: string | null;
  startsAt: string;
  timezone: string;
  title: string;
};

export type GroupEventEditorPreparation =
  | { success: true; data: PreparedGroupEventEditorPayload }
  | { success: false; field: keyof GroupEventEditorDraft; message: string };

function recurrenceEndDate(rule: string | null | undefined, timezone: string): string | null {
  const match = rule
    ?.toUpperCase()
    .match(/(?:^|;)UNTIL=(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?(?:;|$)/);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  if (!match[4]) return date;
  return formatIsoInstantInIanaZone(`${date}T${match[4]}:${match[5]}:${match[6]}Z`, timezone).slice(
    0,
    10,
  );
}

function recurrenceFrequency(rule: string | null | undefined): GroupEventRecurrenceFrequency {
  const normalized = rule?.toUpperCase() ?? "";
  if (normalized.includes("FREQ=DAILY")) return "daily";
  if (normalized.includes("FREQ=WEEKLY")) return "weekly";
  if (normalized.includes("FREQ=MONTHLY")) return "monthly";
  return "none";
}

/** Converts a persisted event seed to an editable wall-time draft in its event zone. */
export function createGroupEventEditorDraft(
  seed: GroupEventEditorSeed | null | undefined,
  fallbackTimezone = "UTC",
): GroupEventEditorDraft {
  const timezone = seed?.timezone ?? fallbackTimezone;
  let startsAt = "";
  let endsAt: string | null = null;
  let initializationError: string | undefined;
  try {
    startsAt = seed?.startsAt ? formatIsoInstantInIanaZone(seed.startsAt, timezone) : "";
    endsAt = seed?.endsAt ? formatIsoInstantInIanaZone(seed.endsAt, timezone) : null;
  } catch (error) {
    initializationError =
      error instanceof Error ? error.message : "The saved event schedule could not be displayed.";
  }
  return {
    date: startsAt.slice(0, 10),
    description: seed?.description ?? "",
    endDate: endsAt?.slice(0, 10) ?? null,
    endsTime: endsAt?.slice(11, 16) ?? null,
    locationName: seed?.locationName ?? "",
    recurrenceEndDate: recurrenceEndDate(seed?.recurrenceRule, timezone),
    recurrenceFrequency: recurrenceFrequency(seed?.recurrenceRule),
    routeId: seed?.routeId ?? null,
    startsTime: startsAt.slice(11, 16),
    title: seed?.title ?? "",
    timezone: seed?.timezone ?? null,
    ...(initializationError ? { initializationError } : {}),
  };
}

/**
 * Performs deterministic wall-time resolution and editor invariants before an
 * app maps this domain payload to its specific create/update operation.
 */
export function prepareGroupEventEditorPayload(
  input: GroupEventEditorDraft,
  options: { isRecurringCreate: boolean; activityPlanId?: string | null } = {
    isRecurringCreate: false,
  },
): GroupEventEditorPreparation {
  const parsed = groupEventEditorDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, field: "date", message: "Enter valid event details." };
  }
  const draft = parsed.data;
  const title = draft.title.trim();
  if (!title) return { success: false, field: "title", message: "Add a title for this event." };
  if (!draft.date || !draft.startsTime) {
    return { success: false, field: "date", message: "Choose a start date and time." };
  }
  if (!draft.timezone) {
    return { success: false, field: "timezone", message: "Choose an event time zone." };
  }

  let startsAt: string;
  let endsAt: string | null;
  try {
    startsAt = scheduledDateTimeToIsoInstant({
      scheduledDate: draft.date,
      time: draft.startsTime,
      timeZone: draft.timezone,
    });
    endsAt = draft.endsTime
      ? scheduledDateTimeToIsoInstant({
          scheduledDate: draft.endDate ?? draft.date,
          time: draft.endsTime,
          timeZone: draft.timezone,
        })
      : null;
  } catch (error) {
    return {
      success: false,
      field: "date",
      message: error instanceof Error ? error.message : "Choose valid event times.",
    };
  }
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    return { success: false, field: "endsTime", message: "End time must be after start time." };
  }

  const commonPayload = {
    activityPlanId: options.activityPlanId,
    description: draft.description.trim() || null,
    endsAt,
    locationName: draft.locationName.trim() || null,
    routeId: draft.routeId,
    startsAt,
    timezone: draft.timezone,
    title,
  };

  if (options.isRecurringCreate) {
    if (!draft.recurrenceEndDate || draft.recurrenceEndDate < draft.date) {
      return {
        success: false,
        field: "recurrenceEndDate",
        message: "Repeat end date must be on or after the event start date.",
      };
    }
    if (draft.recurrenceFrequency === "none") {
      return {
        success: false,
        field: "recurrenceFrequency",
        message: "Choose how often this event repeats and when the series ends.",
      };
    }
    try {
      const until = endOfScheduledDateToIsoInstant({
        scheduledDate: draft.recurrenceEndDate,
        timeZone: draft.timezone,
      })
        .replaceAll("-", "")
        .replaceAll(":", "")
        .replace(".999Z", "Z");
      return {
        success: true,
        data: {
          ...commonPayload,
          recurrenceRule: `FREQ=${draft.recurrenceFrequency.toUpperCase()};UNTIL=${until}`,
          recurrenceTimezone: draft.timezone,
        },
      };
    } catch (error) {
      return {
        success: false,
        field: "recurrenceEndDate",
        message: error instanceof Error ? error.message : "Choose a valid recurrence end date.",
      };
    }
  }

  return {
    success: true,
    data: commonPayload,
  };
}

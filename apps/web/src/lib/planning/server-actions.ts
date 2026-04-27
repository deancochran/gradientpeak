import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { buildFlashHref } from "../flash";
import { createServerActionCaller } from "../server-action-api";

const goalActionSchema = z.object({
  activity_category: z.enum(["run", "bike", "swim", "other"]),
  priority: z.coerce.number().int().min(0).max(10),
  profile_id: z.string().uuid(),
  redirectTo: z.string().optional(),
  target_date: z.string().min(1),
  target_sessions_per_week: z.coerce.number().int().min(1),
  target_weeks: z.coerce.number().int().min(1),
  title: z.string().trim().min(1),
});

const deleteEventActionSchema = z.object({
  event_id: z.string().uuid(),
  redirectTo: z.string().optional(),
});

const updateEventActionSchema = z.object({
  all_day: z.enum(["true", "false"]).optional(),
  date: z.string().min(1),
  event_id: z.string().uuid(),
  notes: z.string().optional(),
  redirectTo: z.string().optional(),
  starts_at_iso: z.string().optional(),
  time: z.string().optional(),
  timezone: z.string().optional(),
  title: z.string().trim().min(1),
});

function fromFormData<T>(schema: z.ZodSchema<T>, data: unknown) {
  return schema.parse(data instanceof FormData ? Object.fromEntries(data.entries()) : data);
}

function getRedirectTarget(data: unknown, fallback: string) {
  if (!(data instanceof FormData)) {
    return fallback;
  }

  const redirectTo = data.get("redirectTo");
  return typeof redirectTo === "string" && redirectTo.length > 0 ? redirectTo : fallback;
}

function buildAllDayStartIso(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`).toISOString();
}

function buildTimedStartIso(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time}:00`).toISOString();
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  );

  const asUtc = Date.UTC(
    values.year ?? 1970,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    values.hour ?? 0,
    values.minute ?? 0,
    values.second ?? 0,
  );

  return asUtc - date.getTime();
}

function buildTimedStartIsoInTimeZone(dateKey: string, time: string, timeZone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const utcGuess = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0, 0),
  );
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  const adjusted = new Date(utcGuess.getTime() - offset);
  const adjustedOffset = getTimeZoneOffsetMs(adjusted, timeZone);
  return new Date(utcGuess.getTime() - adjustedOffset).toISOString();
}

function getEventDurationMs(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
) {
  if (!startsAt || !endsAt) {
    return null;
  }

  const duration = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export const createPlanGoalAction = createServerFn({ method: "POST" }).handler(async ({ data }) => {
  const redirectTo = getRedirectTarget(data, "/plan");
  let parsedData: z.infer<typeof goalActionSchema>;

  try {
    parsedData = fromFormData(goalActionSchema, data);
  } catch {
    throw redirect({
      href: buildFlashHref(redirectTo, "Check the goal form and try again.", "error"),
      statusCode: 303,
    });
  }

  try {
    const caller = await createServerActionCaller();

    await caller.goals.create({
      activity_category: parsedData.activity_category,
      priority: parsedData.priority,
      profile_id: parsedData.profile_id,
      target_date: parsedData.target_date,
      target_payload: {
        type: "consistency",
        target_sessions_per_week: parsedData.target_sessions_per_week,
        target_weeks: parsedData.target_weeks,
      },
      title: parsedData.title,
    });
  } catch (error) {
    throw redirect({
      href: buildFlashHref(
        parsedData.redirectTo ?? redirectTo,
        error instanceof Error ? error.message : "Unable to create goal.",
        "error",
      ),
      statusCode: 303,
    });
  }

  throw redirect({
    href: buildFlashHref(parsedData.redirectTo ?? "/plan", "Goal created", "success"),
    statusCode: 303,
  });
});

export const deleteCalendarEventAction = createServerFn({ method: "POST" }).handler(
  async ({ data }) => {
    const redirectTo = getRedirectTarget(data, "/calendar");
    let parsedData: z.infer<typeof deleteEventActionSchema>;

    try {
      parsedData = fromFormData(deleteEventActionSchema, data);
    } catch {
      throw redirect({
        href: buildFlashHref(redirectTo, "Unable to delete that event.", "error"),
        statusCode: 303,
      });
    }

    try {
      const caller = await createServerActionCaller();

      await caller.events.delete({
        id: parsedData.event_id,
        scope: "single",
      });
    } catch (error) {
      throw redirect({
        href: buildFlashHref(
          parsedData.redirectTo ?? redirectTo,
          error instanceof Error ? error.message : "Unable to delete that event.",
          "error",
        ),
        statusCode: 303,
      });
    }

    throw redirect({
      href: buildFlashHref(parsedData.redirectTo ?? "/calendar", "Event deleted", "success"),
      statusCode: 303,
    });
  },
);

export const updateCalendarEventAction = createServerFn({ method: "POST" }).handler(
  async ({ data }) => {
    const redirectTo = getRedirectTarget(data, "/calendar");
    let parsedData: z.infer<typeof updateEventActionSchema>;

    try {
      parsedData = fromFormData(updateEventActionSchema, data);
    } catch {
      throw redirect({
        href: buildFlashHref(redirectTo, "Check the event form and try again.", "error"),
        statusCode: 303,
      });
    }

    try {
      const caller = await createServerActionCaller();
      const existingEvent = await caller.events.getById({ id: parsedData.event_id });
      const allDay = parsedData.all_day === "true";
      const resolvedTimeZone = existingEvent.timezone ?? "UTC";
      const startsAt = allDay
        ? buildAllDayStartIso(parsedData.date)
        : buildTimedStartIsoInTimeZone(
            parsedData.date,
            parsedData.time ?? "09:00",
            resolvedTimeZone,
          );
      const durationMs = getEventDurationMs(existingEvent.starts_at, existingEvent.ends_at);

      await caller.events.update({
        id: parsedData.event_id,
        patch: {
          all_day: allDay,
          ends_at:
            allDay || durationMs === null
              ? undefined
              : new Date(new Date(startsAt).getTime() + durationMs).toISOString(),
          notes: parsedData.notes?.trim() ? parsedData.notes.trim() : null,
          starts_at: startsAt,
          timezone: resolvedTimeZone,
          title: parsedData.title,
        },
        scope: "single",
      });
    } catch (error) {
      throw redirect({
        href: buildFlashHref(
          parsedData.redirectTo ?? redirectTo,
          error instanceof Error ? error.message : "Unable to update that event.",
          "error",
        ),
        statusCode: 303,
      });
    }

    throw redirect({
      href: buildFlashHref(
        parsedData.redirectTo ?? `/calendar/events/${parsedData.event_id}`,
        "Event updated",
        "success",
      ),
      statusCode: 303,
    });
  },
);

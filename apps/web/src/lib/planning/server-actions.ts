import { canonicalSportSchema } from "@repo/core";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { buildFlashHref } from "../flash";
import { buildCalendarEventUpdatePatch, type PlanningEvent } from "../planning";
import { createServerActionCaller } from "../server-action-api";

const goalActionSchema = z.object({
  activity_category: canonicalSportSchema,
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
  scheduled_date: z.string().min(1),
  event_id: z.string().uuid(),
  notes: z.string().optional(),
  redirectTo: z.string().optional(),
  time: z.string().optional(),
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
      const patch = buildCalendarEventUpdatePatch({
        allDay: parsedData.all_day === "true",
        event: existingEvent as PlanningEvent,
        notes: parsedData.notes,
        scheduledDate: parsedData.scheduled_date,
        time: parsedData.time,
        title: parsedData.title,
      });

      await caller.events.update({
        id: parsedData.event_id,
        patch: {
          ...patch,
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

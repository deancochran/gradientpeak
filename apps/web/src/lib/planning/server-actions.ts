import {
  canonicalActivityCategorySchema,
  canonicalGoalObjectiveSchema,
  dateOnlySchema,
} from "@repo/core";
import { scheduledDateTimeToIsoInstant } from "@repo/core/calendar";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { buildFlashHref } from "../flash";
import {
  buildAllDayStartIso,
  buildCalendarEventUpdatePatch,
  buildWeeklyRecurrence,
  type PlanningEvent,
} from "../planning";
import { createServerActionCaller } from "../server-action-api";

export const goalActionSchema = z
  .object({
    activity_category: canonicalActivityCategorySchema,
    priority: z.number().int().min(0).max(10),
    profile_id: z.string().uuid(),
    redirectTo: z.string().optional(),
    target_date: dateOnlySchema,
    target_payload: canonicalGoalObjectiveSchema,
    title: z.string().trim().min(1).max(100),
  })
  .strict()
  .refine(
    (goal) =>
      !("activity_category" in goal.target_payload) ||
      goal.target_payload.activity_category === undefined ||
      goal.target_payload.activity_category === goal.activity_category,
    {
      message: "Goal target activity must match the selected activity.",
      path: ["target_payload", "activity_category"],
    },
  );

const deleteEventActionSchema = z.object({
  event_id: z.string().uuid(),
  redirectTo: z.string().optional(),
  scope: z.enum(["single", "future", "series"]).default("single"),
});

export const updateEventActionSchema = z
  .object({
    all_day: z.enum(["true", "false"]).optional(),
    scheduled_date: z.string().min(1).optional(),
    event_id: z.string().uuid(),
    notes: z.string().optional(),
    redirectTo: z.string().optional(),
    time: z.string().optional(),
    title: z.string().trim().min(1),
    scope: z.enum(["single", "future", "series"]).default("single"),
  })
  .superRefine((value, context) => {
    if (!value.scheduled_date?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A date is required when updating one event.",
        path: ["scheduled_date"],
      });
    }
  });

const createEventActionSchema = z
  .object({
    all_day: z.enum(["true", "false"]).optional(),
    event_type: z.enum(["custom", "race_target"]),
    notes: z.string().optional(),
    recurrence_count: z.coerce.number().int().min(1).max(52).default(1),
    redirectTo: z.string().optional(),
    scheduled_date: z.string().min(1),
    time: z.string().optional(),
    timezone: z.string().min(1),
    title: z.string().trim().min(1),
  })
  .superRefine((value, context) => {
    if (value.all_day !== "true" && !value.time?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a time or mark this event all day.",
        path: ["time"],
      });
    }
  });

const updateGoalActionSchema = goalActionSchema.safeExtend({ goal_id: z.string().uuid() });
const deleteGoalActionSchema = z.object({
  goal_id: z.string().uuid(),
  redirectTo: z.string().optional(),
});

function fromFormData<T>(schema: z.ZodSchema<T>, data: unknown) {
  return schema.parse(data instanceof FormData ? Object.fromEntries(data.entries()) : data);
}

function getRedirectTarget(data: unknown, fallback: string) {
  if (!(data instanceof FormData)) return fallback;
  const redirectTo = data.get("redirectTo");
  return typeof redirectTo === "string" && redirectTo.length > 0 ? redirectTo : fallback;
}

const goalActionResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), redirectTo: z.string() }),
  z.object({ status: z.literal("error"), message: z.string() }),
]);

type GoalActionResult = z.infer<typeof goalActionResultSchema>;

function goalActionError(message: string): GoalActionResult {
  return goalActionResultSchema.parse({ status: "error", message });
}

export function buildScopedCalendarEventUpdate(
  data: z.infer<typeof updateEventActionSchema>,
  existingEvent?: PlanningEvent,
) {
  if (!existingEvent || !data.scheduled_date) {
    throw new Error("A single event update requires its current event and scheduled date.");
  }

  return {
    id: data.event_id,
    patch:
      data.scope !== "single"
        ? { notes: data.notes, title: data.title }
        : existingEvent.event_type === "planned"
          ? { notes: data.notes, scheduled_date: data.scheduled_date, title: data.title }
          : buildCalendarEventUpdatePatch({
              allDay: data.all_day === "true",
              event: existingEvent,
              ...(data.notes === undefined ? {} : { notes: data.notes }),
              scheduledDate: data.scheduled_date,
              ...(data.time === undefined ? {} : { time: data.time }),
              title: data.title,
            }),
    scope: data.scope,
  };
}

export const createPlanGoalAction = createServerFn({ method: "POST" })
  .validator(goalActionSchema)
  .handler(async ({ data: parsedData }) => {
    try {
      const caller = await createServerActionCaller();

      await caller.goals.create({
        activity_category: parsedData.activity_category,
        priority: parsedData.priority,
        profile_id: parsedData.profile_id,
        target_date: parsedData.target_date,
        target_payload: parsedData.target_payload,
        title: parsedData.title,
      });
    } catch (error) {
      return goalActionError(error instanceof Error ? error.message : "Unable to create goal.");
    }

    return goalActionResultSchema.parse({
      status: "success",
      redirectTo: buildFlashHref(parsedData.redirectTo ?? "/plan", "Goal created", "success"),
    });
  });

export const updatePlanGoalAction = createServerFn({ method: "POST" })
  .validator(updateGoalActionSchema)
  .handler(async ({ data: parsedData }) => {
    try {
      const caller = await createServerActionCaller();
      await caller.goals.update({
        id: parsedData.goal_id,
        data: {
          activity_category: parsedData.activity_category,
          priority: parsedData.priority,
          target_date: parsedData.target_date,
          target_payload: parsedData.target_payload,
          title: parsedData.title,
        },
      });
    } catch (error) {
      return goalActionError(error instanceof Error ? error.message : "Unable to update goal.");
    }

    return goalActionResultSchema.parse({
      status: "success",
      redirectTo: buildFlashHref(
        parsedData.redirectTo ?? `/goals/${parsedData.goal_id}`,
        "Goal updated",
        "success",
      ),
    });
  });

export const deletePlanGoalAction = createServerFn({ method: "POST" }).handler(async ({ data }) => {
  let parsedData: z.infer<typeof deleteGoalActionSchema>;

  try {
    parsedData = fromFormData(deleteGoalActionSchema, data);
    const caller = await createServerActionCaller();
    await caller.goals.delete({ id: parsedData.goal_id });
  } catch (error) {
    return goalActionError(error instanceof Error ? error.message : "Unable to delete goal.");
  }

  return goalActionResultSchema.parse({
    status: "success",
    redirectTo: buildFlashHref(parsedData.redirectTo ?? "/goals", "Goal deleted", "success"),
  });
});

export const createCalendarEventAction = createServerFn({ method: "POST" }).handler(
  async ({ data }) => {
    const redirectTo = getRedirectTarget(data, "/calendar");
    let parsedData: z.infer<typeof createEventActionSchema>;

    try {
      parsedData = fromFormData(createEventActionSchema, data);
    } catch {
      throw redirect({
        href: buildFlashHref(redirectTo, "Check the event form and try again.", "error"),
        statusCode: 303,
      });
    }

    let createdEventId: string;
    try {
      const caller = await createServerActionCaller();
      const recurrence = buildWeeklyRecurrence({
        count: parsedData.recurrence_count,
        scheduledDate: parsedData.scheduled_date,
        timezone: parsedData.timezone,
      });
      const notes = parsedData.notes?.trim() || null;
      const scheduledTime = parsedData.time;
      const created = await caller.events.create({
        all_day: parsedData.all_day === "true",
        event_type: parsedData.event_type,
        notes,
        recurrence,
        scheduled_date: parsedData.scheduled_date,
        starts_at:
          parsedData.all_day === "true"
            ? buildAllDayStartIso(parsedData.scheduled_date)
            : scheduledDateTimeToIsoInstant({
                scheduledDate: parsedData.scheduled_date,
                time: scheduledTime ?? "",
                timeZone: parsedData.timezone,
              }),
        timezone: parsedData.timezone,
        title: parsedData.title,
      });

      createdEventId = created.id;
    } catch (error) {
      throw redirect({
        href: buildFlashHref(
          parsedData.redirectTo ?? redirectTo,
          error instanceof Error ? error.message : "Unable to create event.",
          "error",
        ),
        statusCode: 303,
      });
    }

    throw redirect({
      href: buildFlashHref(
        parsedData.redirectTo ?? `/calendar/events/${createdEventId}`,
        "Event created",
        "success",
      ),
      statusCode: 303,
    });
  },
);

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
        scope: parsedData.scope,
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
      const existingEvent = (await caller.events.getById({
        id: parsedData.event_id,
      })) as PlanningEvent;

      await caller.events.update(buildScopedCalendarEventUpdate(parsedData, existingEvent));
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

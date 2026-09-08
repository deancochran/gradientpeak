import { canonicalActivityCategorySchema, dateOnlySchema } from "@repo/core";
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

export const goalActionSchema = z.object({
  activity_category: canonicalActivityCategorySchema,
  priority: z.coerce.number().int().min(0).max(10),
  profile_id: z.string().uuid(),
  redirectTo: z.string().optional(),
  target_date: dateOnlySchema,
  target_sessions_per_week: z.coerce.number().int().min(1).max(21),
  target_weeks: z.coerce.number().int().min(1).max(104),
  title: z.string().trim().min(1).max(100),
});

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

const createEventActionSchema = z.object({
  activity_plan_id: z.string().uuid().optional(),
  all_day: z.enum(["true", "false"]).optional(),
  event_type: z.enum(["custom", "race_target", "planned"]),
  notes: z.string().optional(),
  recurrence_count: z.coerce.number().int().min(1).max(52).default(1),
  redirectTo: z.string().optional(),
  scheduled_date: z.string().min(1),
  time: z.string().default("09:00"),
  timezone: z.string().min(1).default("UTC"),
  title: z.string().trim().min(1),
});

const attachActivityPlanActionSchema = z.object({
  activity_plan_id: z.string().uuid().optional(),
  event_id: z.string().uuid(),
  operation: z.enum(["attach", "remove"]),
  redirectTo: z.string().optional(),
  title: z.string().trim().min(1),
});

const updateGoalActionSchema = goalActionSchema.extend({ goal_id: z.string().uuid() });
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
              notes: data.notes,
              scheduledDate: data.scheduled_date,
              time: data.time,
              title: data.title,
            }),
    scope: data.scope,
  };
}

export const createPlanGoalAction = createServerFn({ method: "POST" }).handler(async ({ data }) => {
  let parsedData: z.infer<typeof goalActionSchema>;

  try {
    parsedData = fromFormData(goalActionSchema, data);
  } catch {
    return goalActionError("Check the goal form and try again.");
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
    return goalActionError(error instanceof Error ? error.message : "Unable to create goal.");
  }

  return goalActionResultSchema.parse({
    status: "success",
    redirectTo: buildFlashHref(parsedData.redirectTo ?? "/plan", "Goal created", "success"),
  });
});

export const updatePlanGoalAction = createServerFn({ method: "POST" }).handler(async ({ data }) => {
  let parsedData: z.infer<typeof updateGoalActionSchema>;

  try {
    parsedData = fromFormData(updateGoalActionSchema, data);
  } catch {
    return goalActionError("Check the goal form and try again.");
  }

  try {
    const caller = await createServerActionCaller();
    await caller.goals.update({
      id: parsedData.goal_id,
      data: {
        activity_category: parsedData.activity_category,
        priority: parsedData.priority,
        target_date: parsedData.target_date,
        target_payload: {
          type: "consistency",
          target_sessions_per_week: parsedData.target_sessions_per_week,
          target_weeks: parsedData.target_weeks,
        },
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
      const created =
        parsedData.event_type === "planned"
          ? await caller.events.create({
              activity_plan_id: parsedData.activity_plan_id ?? "",
              event_type: "planned",
              notes,
              scheduled_date: parsedData.scheduled_date,
              title: parsedData.title,
            })
          : await caller.events.create({
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
                      time: parsedData.time,
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

export const attachCalendarActivityPlanAction = createServerFn({ method: "POST" }).handler(
  async ({ data }) => {
    const redirectTo = getRedirectTarget(data, "/calendar?view=agenda&scheduled=true");
    let parsedData: z.infer<typeof attachActivityPlanActionSchema>;

    try {
      parsedData = fromFormData(attachActivityPlanActionSchema, data);
    } catch {
      throw redirect({
        href: buildFlashHref(redirectTo, "Choose an activity plan and try again.", "error"),
        statusCode: 303,
      });
    }

    try {
      const caller = await createServerActionCaller();
      await caller.events.update({
        id: parsedData.event_id,
        scope: "single",
        patch:
          parsedData.operation === "remove"
            ? { activity_plan_id: null, title: parsedData.title }
            : {
                activity_plan_id: parsedData.activity_plan_id,
                title: parsedData.title,
              },
      });
    } catch (error) {
      throw redirect({
        href: buildFlashHref(
          parsedData.redirectTo ?? redirectTo,
          error instanceof Error ? error.message : "Unable to update the activity plan.",
          "error",
        ),
        statusCode: 303,
      });
    }

    throw redirect({
      href: buildFlashHref(
        parsedData.redirectTo ?? `/calendar/events/${parsedData.event_id}`,
        parsedData.operation === "remove" ? "Activity plan removed" : "Activity plan attached",
        "success",
      ),
      statusCode: 303,
    });
  },
);

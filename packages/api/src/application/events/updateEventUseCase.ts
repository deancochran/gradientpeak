import { activityPlanStructureSchema } from "@repo/core";
import { getCalendarDateInIanaZone } from "@repo/core/calendar";
import { TRPCError } from "@trpc/server";
import type { Context } from "../../context";
import type {
  createEventCompletionRepository,
  createEventWriteRepository,
} from "../../infrastructure/repositories";
import {
  EventCurrentPlanUpdateConflict,
  EventPlanReplacementCompletionConflict,
} from "../../infrastructure/repositories/drizzle-event-write-repository";
import type { WahooPlannedActivityQueueResult } from "../../lib/provider-sync/planned-activities";
import type { createContentAccessPermissions } from "../../permissions/content-access";
import type { EventWriteEventRecord } from "../../repositories";

type ProtectedContext = Context & {
  session: NonNullable<Context["session"]> & {
    user: NonNullable<NonNullable<Context["session"]>["user"]>;
  };
};

type CoreEventType = "planned" | "race_target" | "custom";
type DbEventType = "planned" | "race_target" | "custom";

type NormalizedEventUpdatePatch = {
  activity_plan_id?: string | null;
  route_id?: string | null;
  notes?: string | null;
  title?: string;
  description?: string | null;
  all_day?: boolean;
  timezone?: string;
  starts_at?: string;
  ends_at?: string | null;
  scheduled_date?: string;
};

type MappedEvent = {
  activity_plan_id: string | null;
  event_type: CoreEventType;
  id: string;
  linked_activity_id: string | null;
  route_id: string | null;
  scheduled_date: string;
  status: "scheduled" | "completed" | "cancelled";
  training_plan_id: string | null;
  updated_at: string;
};

type ContentPermissions = ReturnType<typeof createContentAccessPermissions> | null;

type UpdateEventUseCaseDependencies<TInput, TMappedEvent extends MappedEvent> = {
  assertRestDayWritesBlocked: (eventType: CoreEventType, action: "update") => void;
  buildInsightRefreshHint: (params: {
    trainingPlanId?: string | null;
    changedDate?: string | null;
    changeAt?: string;
  }) => unknown;
  enqueueWahooPlannedActivityJobs: (
    ctx: ProtectedContext,
    input: { eventIds: string[]; operation: "publish" | "unsync"; profileId?: string },
  ) => Promise<WahooPlannedActivityQueueResult | null>;
  getContentPermissions: (ctx: Context) => ContentPermissions;
  getEventCompletionRepository: (
    ctx: Context,
  ) => ReturnType<typeof createEventCompletionRepository>;
  getEventWriteRepository: (ctx: Context) => ReturnType<typeof createEventWriteRepository>;
  hasInstantChanged: (nextValue: string | null | undefined, currentValue: string | null) => boolean;
  mapEvent: (event: EventWriteEventRecord) => TMappedEvent;
  normalizeEventUpdatePatch: (input: TInput) => {
    patch: NormalizedEventUpdatePatch;
    scheduledDate: string | undefined;
  };
  toCoreEventType: (eventType: DbEventType) => CoreEventType;
  toDateKey: (value: string) => string;
  toDayStartIso: (dateValue: string) => string;
  toNextDayStartIso: (dateValue: string) => string;
};

export async function updateEventUseCase<
  TInput extends { id: string; scope?: "single" | "future" | "series" },
  TMappedEvent extends MappedEvent,
>(input: {
  ctx: ProtectedContext;
  input: TInput;
  dependencies: UpdateEventUseCaseDependencies<TInput, TMappedEvent>;
}) {
  const { ctx, dependencies } = input;
  const id = input.input.id;
  const scope = input.input.scope ?? "single";
  const eventWriteRepository = dependencies.getEventWriteRepository(ctx);
  const completionRepository = dependencies.getEventCompletionRepository(ctx);
  const permissions = dependencies.getContentPermissions(ctx);

  const existing = await completionRepository.getOwnedEventForCompletion({
    eventId: id,
    profileId: ctx.session.user.id,
  });

  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Event not found",
    });
  }

  const existingEvent = existing;
  const existingEventType = dependencies.toCoreEventType(existingEvent.event_type);

  dependencies.assertRestDayWritesBlocked(existingEventType, "update");

  const { patch, scheduledDate } = dependencies.normalizeEventUpdatePatch(input.input);
  const targetEventType = existingEventType;

  if (
    scope !== "single" &&
    (patch.activity_plan_id !== undefined ||
      patch.route_id !== undefined ||
      patch.all_day !== undefined ||
      patch.timezone !== undefined ||
      patch.starts_at !== undefined ||
      patch.ends_at !== undefined ||
      scheduledDate !== undefined)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Future and series updates may only change event details",
    });
  }

  if (
    existingEventType === "planned" &&
    (patch.starts_at !== undefined ||
      patch.ends_at !== undefined ||
      patch.timezone !== undefined ||
      patch.all_day !== undefined)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Planned sessions accept calendar-date schedule updates only",
    });
  }

  const hasScheduledDateMove =
    scheduledDate !== undefined && scheduledDate !== existingEvent.scheduled_date;
  const hasStartsAtMove = dependencies.hasInstantChanged(patch.starts_at, existingEvent.starts_at);
  const hasEndsAtMove = dependencies.hasInstantChanged(patch.ends_at, existingEvent.ends_at);
  const isMoveRescheduleUpdate = hasScheduledDateMove || hasStartsAtMove || hasEndsAtMove;
  const isPlannedLikeEvent = existingEventType === "planned" || targetEventType === "planned";
  const hasCompletionLinkage =
    existingEvent.linked_activity_id !== null || existingEvent.status === "completed";

  const nextActivityPlanId =
    patch.activity_plan_id !== undefined ? patch.activity_plan_id : existingEvent.activity_plan_id;
  const nextRouteId =
    patch.route_id !== undefined ? patch.route_id : (existingEvent.route_id ?? null);

  if (targetEventType === "planned" && !nextActivityPlanId && !nextRouteId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A planned event requires activity_plan_id or route_id",
    });
  }

  if (typeof patch.activity_plan_id === "string") {
    if (permissions) {
      await permissions.requireRead(
        ctx.session.user.id,
        { type: "activity_plan", id: patch.activity_plan_id },
        "Activity plan not found or not accessible",
      );
    }
    const activityPlan = permissions
      ? await eventWriteRepository.getActivityPlanById({ activityPlanId: patch.activity_plan_id })
      : await eventWriteRepository.getAccessibleActivityPlan({
          activityPlanId: patch.activity_plan_id,
          profileId: ctx.session.user.id,
        });

    if (!activityPlan) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Activity plan not found or not accessible",
      });
    }
    if (!activityPlanStructureSchema.safeParse(activityPlan.structure).success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Only executable single-category activity plans can be scheduled",
      });
    }
  }

  if (
    patch.activity_plan_id !== undefined &&
    patch.activity_plan_id !== existingEvent.activity_plan_id &&
    (existingEvent.linked_activity_id !== null || existingEvent.status === "completed")
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Unlink the completed activity before replacing an activity plan",
    });
  }

  if (typeof patch.route_id === "string") {
    if (permissions) {
      await permissions.requireRead(
        ctx.session.user.id,
        { type: "activity_route", id: patch.route_id },
        "Route not found or not accessible",
      );
    } else {
      const route = await eventWriteRepository.getAccessibleActivityRoute({
        profileId: ctx.session.user.id,
        routeId: patch.route_id,
      });

      if (!route) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Route not found or not accessible",
        });
      }
    }
  }

  const nextAllDay = patch.all_day !== undefined ? Boolean(patch.all_day) : existingEvent.all_day;
  if (scheduledDate !== undefined && !nextAllDay && patch.starts_at === undefined) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Timed event schedule updates must include starts_at",
    });
  }
  const eventUpdates: Record<string, unknown> = {
    ...(patch.activity_plan_id !== undefined ? { activity_plan_id: patch.activity_plan_id } : {}),
    ...(patch.route_id !== undefined ? { route_id: patch.route_id } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.all_day !== undefined ? { all_day: patch.all_day } : {}),
    ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
    ...(patch.starts_at !== undefined ? { starts_at: patch.starts_at } : {}),
    ...(patch.ends_at !== undefined ? { ends_at: patch.ends_at } : {}),
    ...(scheduledDate !== undefined
      ? { scheduled_date: scheduledDate }
      : patch.starts_at !== undefined
        ? {
            scheduled_date: getCalendarDateInIanaZone(
              patch.starts_at,
              patch.timezone ?? existingEvent.timezone,
            ),
          }
        : {}),
  };

  if (scheduledDate !== undefined && nextAllDay) {
    eventUpdates.starts_at = dependencies.toDayStartIso(scheduledDate);
    eventUpdates.ends_at = dependencies.toNextDayStartIso(scheduledDate);
    eventUpdates.scheduled_date = scheduledDate;
  }

  if (
    nextAllDay &&
    patch.starts_at !== undefined &&
    patch.ends_at === undefined &&
    scheduledDate === undefined
  ) {
    eventUpdates.ends_at = dependencies.toNextDayStartIso(String(eventUpdates.scheduled_date));
  }

  if (isMoveRescheduleUpdate && isPlannedLikeEvent && hasCompletionLinkage) {
    eventUpdates.linked_activity_id = null;

    if (existingEvent.status === "completed") {
      eventUpdates.status = "scheduled";
    }
  }

  let updatedRows: EventWriteEventRecord[];
  try {
    updatedRows = await eventWriteRepository.updateOwnedEventsForScope({
      anchorEvent: existingEvent,
      eventUpdates,
      profileId: ctx.session.user.id,
      rejectPlanReplacementWithCompletion: patch.activity_plan_id !== undefined,
      scope,
    });
  } catch (error) {
    if (error instanceof EventCurrentPlanUpdateConflict) {
      throw new TRPCError({ code: "CONFLICT", message: error.message });
    }
    if (error instanceof EventPlanReplacementCompletionConflict) {
      throw new TRPCError({ code: "CONFLICT", message: error.message });
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Failed to update event",
    });
  }

  if (updatedRows.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No matching events found for update scope",
    });
  }

  const representative = updatedRows.find((row) => row.id === id) ?? updatedRows[0];
  if (!representative) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No matching events found for update scope",
    });
  }

  const event = dependencies.mapEvent(representative);

  if (permissions) {
    await Promise.all(
      updatedRows.map(async (row) => {
        await permissions.revokeEventGrants(row.id);
        await permissions.grantEventContentAccess({
          actorProfileId: ctx.session.user.id,
          granteeProfileId: row.profile_id,
          eventId: row.id,
          activityPlanId: row.activity_plan_id,
          trainingPlanId: row.training_plan_id,
        });
      }),
    );
  }

  let plannedActivitySyncResult: WahooPlannedActivityQueueResult | null = null;
  const updatedPlannedEventIds = updatedRows
    .filter((row) => row.event_type === "planned" && row.activity_plan_id && row.route_id === null)
    .map((row) => row.id);
  const removedPlannedEventIds =
    existingEvent.event_type === "planned" &&
    existingEvent.activity_plan_id &&
    (event.event_type !== "planned" ||
      event.activity_plan_id === null ||
      (existingEvent.route_id === null && event.route_id !== null))
      ? updatedRows.map((row) => row.id)
      : [];

  if (updatedPlannedEventIds.length > 0 || removedPlannedEventIds.length > 0) {
    try {
      plannedActivitySyncResult =
        updatedPlannedEventIds.length > 0
          ? await dependencies.enqueueWahooPlannedActivityJobs(ctx, {
              eventIds: updatedPlannedEventIds,
              operation: "publish",
            })
          : await dependencies.enqueueWahooPlannedActivityJobs(ctx, {
              eventIds: removedPlannedEventIds,
              operation: "unsync",
            });
    } catch (error) {
      console.error("Failed to enqueue planned activity update jobs:", error);
      plannedActivitySyncResult = {
        affectedCount: updatedPlannedEventIds.length || removedPlannedEventIds.length,
        operation: updatedPlannedEventIds.length > 0 ? "publish" : "unsync",
        queued: false,
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error during planned activity sync queueing",
      };
    }
  }

  return {
    ...event,
    plannedActivitySync: plannedActivitySyncResult,
    mutation_scope: scope,
    affected_count: updatedRows.length,
    affected_event_ids: updatedRows.map((row) => row.id),
    insight_refresh_hint: dependencies.buildInsightRefreshHint({
      trainingPlanId: event.training_plan_id,
      changedDate: event.scheduled_date,
      changeAt: event.updated_at,
    }),
  };
}

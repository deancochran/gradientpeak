import { type EventLifecycle, type EventRecurrence, getScheduledDateKey } from "@repo/core";
import type { PublicEventStatus } from "@repo/db";
import { TRPCError } from "@trpc/server";
import type { Context } from "../../context";
import type {
  createEventCompletionRepository,
  createEventWriteRepository,
} from "../../infrastructure/repositories";
import type { PlannedWorkoutQueueResult } from "../../lib/provider-sync/planned-workouts";
import type { createContentAccessPermissions } from "../../permissions/content-access";

type ProtectedContext = Context & {
  session: NonNullable<Context["session"]> & {
    user: NonNullable<NonNullable<Context["session"]>["user"]>;
  };
};

type CoreEventType = "planned" | "race_target" | "custom" | "imported";
type DbEventType = "planned" | "race_target" | "custom" | "imported";
type EventMutationScope = "single" | "future" | "series";

type NormalizedEventUpdatePatch = {
  activity_plan_id?: string | null;
  training_plan_id?: string | null;
  notes?: string | null;
  event_type?: CoreEventType;
  recurrence?: EventRecurrence | null;
  lifecycle?: EventLifecycle;
  title?: string;
  description?: string | null;
  all_day?: boolean;
  timezone?: string;
  starts_at?: string;
  ends_at?: string | null;
  scheduled_date?: string;
};

type MaterializedOccurrence = {
  startsAt: string;
  endsAt: string | null;
  occurrenceKey: string;
};

type EventRecord = {
  activity_plan_id: string | null;
  all_day: boolean;
  description: string | null;
  ends_at: string | null;
  event_type: DbEventType;
  id: string;
  linked_activity_id: string | null;
  notes: string | null;
  profile_id: string;
  recurrence_rule: string | null;
  recurrence_timezone: string | null;
  series_id: string | null;
  source_provider: string | null;
  scheduled_date: string | null;
  starts_at: string;
  status: PublicEventStatus;
  title: string;
  timezone: string;
  training_plan_id: string | null;
  updated_at: string;
};

type MappedEvent = {
  activity_plan_id: string | null;
  id: string;
  legacy_event_type: DbEventType;
  scheduled_date: string;
  training_plan_id: string | null;
  updated_at: string;
};

type ContentPermissions = ReturnType<typeof createContentAccessPermissions> | null;

type UpdateEventUseCaseDependencies<
  TInput,
  TEventRecord extends EventRecord,
  TMappedEvent extends MappedEvent,
> = {
  assertRestDayWritesBlocked: (eventType: CoreEventType, action: "update") => void;
  buildInsightRefreshHint: (params: {
    trainingPlanId?: string | null;
    changedDate?: string | null;
    changeAt?: string;
  }) => unknown;
  buildMaterializedRecurrenceOccurrences: (input: {
    startsAt: string;
    endsAt: string | null;
    recurrence: EventRecurrence;
  }) => MaterializedOccurrence[];
  enqueueProviderPlannedActivityJobs: (
    ctx: ProtectedContext,
    input: { eventIds: string[]; operation: "publish" | "unsync"; profileId?: string },
  ) => Promise<PlannedWorkoutQueueResult | null>;
  ensurePersistableRecurrence: (recurrence: EventRecurrence | null | undefined) => void;
  getContentPermissions: (ctx: Context) => ContentPermissions;
  getEventCompletionRepository: (
    ctx: Context,
  ) => ReturnType<typeof createEventCompletionRepository>;
  getEventWriteRepository: (ctx: Context) => ReturnType<typeof createEventWriteRepository>;
  hasInstantChanged: (nextValue: string | null | undefined, currentValue: string | null) => boolean;
  mapEvent: (event: TEventRecord) => TMappedEvent;
  normalizeEventUpdatePatch: (input: TInput) => {
    patch: NormalizedEventUpdatePatch;
    scheduledDate: string | undefined;
  };
  plannedEventType: DbEventType;
  toCoreEventType: (eventType: DbEventType) => CoreEventType;
  toDateKey: (value: string) => string;
  toDayStartIso: (dateValue: string) => string;
  toDbEventType: (eventType: CoreEventType) => DbEventType;
  toNextDayStartIso: (dateValue: string) => string;
  toPersistableEventStatus: (lifecycle: EventLifecycle | undefined) => PublicEventStatus;
};

export async function updateEventUseCase<
  TInput extends { id: string; scope?: EventMutationScope },
  TEventRecord extends EventRecord,
  TMappedEvent extends MappedEvent,
>(input: {
  ctx: ProtectedContext;
  input: TInput;
  dependencies: UpdateEventUseCaseDependencies<TInput, TEventRecord, TMappedEvent>;
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

  const existingEvent = existing as unknown as TEventRecord;
  const existingEventType = dependencies.toCoreEventType(existingEvent.event_type);

  dependencies.assertRestDayWritesBlocked(existingEventType, "update");

  if (existingEventType === "imported") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Imported events are read-only",
    });
  }

  const { patch, scheduledDate } = dependencies.normalizeEventUpdatePatch(input.input);
  const targetEventType = patch.event_type ?? existingEventType;

  dependencies.assertRestDayWritesBlocked(targetEventType, "update");

  const hasScheduledDateMove =
    scheduledDate !== undefined &&
    scheduledDate !==
      (existingEvent.scheduled_date ?? dependencies.toDateKey(existingEvent.starts_at));
  const hasStartsAtMove = dependencies.hasInstantChanged(patch.starts_at, existingEvent.starts_at);
  const hasEndsAtMove = dependencies.hasInstantChanged(patch.ends_at, existingEvent.ends_at);
  const isMoveRescheduleUpdate = hasScheduledDateMove || hasStartsAtMove || hasEndsAtMove;
  const isPlannedLikeEvent = existingEventType === "planned" || targetEventType === "planned";
  const hasCompletionLinkage =
    existingEvent.linked_activity_id !== null || existingEvent.status === "completed";

  dependencies.ensurePersistableRecurrence(patch.recurrence);

  if (patch.recurrence !== undefined && scope === "single") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Recurrence updates require future or series scope",
    });
  }

  if (scope !== "single") {
    if (!existingEvent.series_id) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Mutation scope "${scope}" requires an event series`,
      });
    }

    if (
      scheduledDate !== undefined ||
      patch.starts_at !== undefined ||
      patch.ends_at !== undefined
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Date/time updates are only supported with single scope",
      });
    }
  }

  const nextActivityPlanId =
    patch.activity_plan_id !== undefined ? patch.activity_plan_id : existingEvent.activity_plan_id;

  if (targetEventType === "planned" && !nextActivityPlanId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: 'activity_plan_id is required when event_type is "planned"',
    });
  }

  if (typeof patch.activity_plan_id === "string") {
    if (permissions) {
      await permissions.requireRead(
        ctx.session.user.id,
        { type: "activity_plan", id: patch.activity_plan_id },
        "Activity plan not found or not accessible",
      );
    } else {
      const activityPlan = await eventWriteRepository.getAccessibleActivityPlan({
        activityPlanId: patch.activity_plan_id,
        profileId: ctx.session.user.id,
      });

      if (!activityPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Activity plan not found or not accessible",
        });
      }
    }
  }

  if (typeof patch.training_plan_id === "string") {
    if (permissions) {
      await permissions.requireRead(
        ctx.session.user.id,
        { type: "training_plan", id: patch.training_plan_id },
        "Training plan not found or not accessible",
      );
    } else {
      const trainingPlan = await eventWriteRepository.getOwnedTrainingPlan({
        profileId: ctx.session.user.id,
        trainingPlanId: patch.training_plan_id,
      });

      if (!trainingPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Training plan not found or not accessible",
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
    ...(patch.event_type !== undefined
      ? { event_type: dependencies.toDbEventType(patch.event_type) }
      : {}),
    ...(patch.activity_plan_id !== undefined ? { activity_plan_id: patch.activity_plan_id } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.lifecycle !== undefined
      ? { status: dependencies.toPersistableEventStatus(patch.lifecycle) }
      : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.all_day !== undefined ? { all_day: patch.all_day } : {}),
    ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
    ...(patch.training_plan_id !== undefined ? { training_plan_id: patch.training_plan_id } : {}),
    ...(patch.starts_at !== undefined ? { starts_at: patch.starts_at } : {}),
    ...(patch.ends_at !== undefined ? { ends_at: patch.ends_at } : {}),
    scheduled_date:
      scheduledDate ??
      getScheduledDateKey(
        patch.starts_at ?? existingEvent.starts_at,
        patch.timezone ?? existingEvent.timezone,
      ),
    ...(patch.recurrence !== undefined
      ? {
          recurrence_rule: patch.recurrence?.rule ?? null,
          recurrence_timezone: patch.recurrence?.timezone ?? null,
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
    eventUpdates.ends_at = dependencies.toNextDayStartIso(dependencies.toDateKey(patch.starts_at));
  }

  if (isMoveRescheduleUpdate && isPlannedLikeEvent && hasCompletionLinkage) {
    eventUpdates.linked_activity_id = null;

    if (existingEvent.status === "completed") {
      eventUpdates.status = "scheduled";
    }
  }

  let updatedRows: TEventRecord[];
  try {
    updatedRows = (await eventWriteRepository.updateOwnedEventsForScope({
      anchorEvent: existingEvent,
      eventUpdates,
      profileId: ctx.session.user.id,
      scope,
    })) as unknown as TEventRecord[];
  } catch (error) {
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

  if (patch.recurrence) {
    try {
      const existingSeriesRows = await eventWriteRepository.listOwnedEventsForSeries({
        anchorEvent: representative,
        profileId: ctx.session.user.id,
      });

      if (existingSeriesRows.length <= 1) {
        const occurrences = dependencies.buildMaterializedRecurrenceOccurrences({
          startsAt: representative.starts_at,
          endsAt: representative.ends_at,
          recurrence: patch.recurrence,
        });

        for (const occurrence of occurrences.slice(1)) {
          const occurrenceData = await eventWriteRepository.createOwnedEvent({
            profileId: ctx.session.user.id,
            eventType: representative.event_type,
            title: representative.title,
            allDay: representative.all_day,
            timezone: representative.timezone,
            scheduledDate:
              representative.event_type === "planned"
                ? occurrence.startsAt.slice(0, 10)
                : getScheduledDateKey(occurrence.startsAt, representative.timezone),
            startsAt: occurrence.startsAt,
            endsAt: occurrence.endsAt,
            status: representative.status,
            activityPlanId: representative.activity_plan_id,
            trainingPlanId: representative.training_plan_id,
            notes: representative.notes,
            description: representative.description,
            recurrenceRule: representative.recurrence_rule,
            recurrenceTimezone: representative.recurrence_timezone,
            seriesId: representative.series_id ?? representative.id,
            occurrenceKey: occurrence.occurrenceKey,
            originalStartsAt: occurrence.startsAt,
            sourceProvider: representative.source_provider,
          });
          updatedRows.push(occurrenceData as unknown as TEventRecord);
        }
      }
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Failed to materialize recurring events",
      });
    }
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

  let plannedWorkoutSyncResult: PlannedWorkoutQueueResult | null = null;
  const updatedPlannedEventIds = updatedRows
    .filter((row) => row.event_type === dependencies.plannedEventType && row.activity_plan_id)
    .map((row) => row.id);
  const removedPlannedEventIds =
    existingEvent.event_type === dependencies.plannedEventType &&
    existingEvent.activity_plan_id &&
    (event.legacy_event_type !== dependencies.plannedEventType || event.activity_plan_id === null)
      ? updatedRows.map((row) => row.id)
      : [];

  if (updatedPlannedEventIds.length > 0 || removedPlannedEventIds.length > 0) {
    try {
      plannedWorkoutSyncResult =
        updatedPlannedEventIds.length > 0
          ? await dependencies.enqueueProviderPlannedActivityJobs(ctx, {
              eventIds: updatedPlannedEventIds,
              operation: "publish",
            })
          : await dependencies.enqueueProviderPlannedActivityJobs(ctx, {
              eventIds: removedPlannedEventIds,
              operation: "unsync",
            });
    } catch (error) {
      console.error("Failed to enqueue planned workout update jobs:", error);
      plannedWorkoutSyncResult = {
        affectedCount: updatedPlannedEventIds.length || removedPlannedEventIds.length,
        operation: updatedPlannedEventIds.length > 0 ? "publish" : "unsync",
        queued: false,
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error during planned workout sync queueing",
      };
    }
  }

  return {
    ...event,
    plannedWorkoutSync: plannedWorkoutSyncResult,
    wahooSync: plannedWorkoutSyncResult,
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

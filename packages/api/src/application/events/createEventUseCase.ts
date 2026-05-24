import type { PublicEventStatus } from "@repo/db";
import { TRPCError } from "@trpc/server";
import type { Context } from "../../context";
import type { createEventWriteRepository } from "../../infrastructure/repositories";
import { logger } from "../../lib/logger";
import type { PlannedWorkoutQueueResult } from "../../lib/provider-sync/planned-workouts";
import type { createContentAccessPermissions } from "../../permissions/content-access";

type ProtectedContext = Context & {
  session: NonNullable<Context["session"]> & {
    user: NonNullable<NonNullable<Context["session"]>["user"]>;
  };
};

type CoreEventType = "planned" | "rest_day" | "race_target" | "custom" | "imported";
type DbEventType = "planned_activity" | "rest_day" | "race" | "custom" | "imported";

type NormalizedCreateInput = {
  activityPlanId: string | null;
  allDay: boolean;
  description: string | null;
  endsAt: string | null;
  eventType: CoreEventType;
  notes: string | null;
  recurrence?: {
    rule: string;
    timezone: string;
    exdates?: string[];
    exceptions?: unknown[];
  } | null;
  sourceProvider: string | null;
  startsAt: string;
  status: PublicEventStatus;
  timezone: string;
  title: string;
  trainingPlanId: string | null;
};

type MaterializedOccurrence = {
  startsAt: string;
  endsAt: string | null;
  occurrenceKey: string;
};

type CreatedEventRecord = {
  activity_plan_id: string | null;
  id: string;
  profile_id: string;
  training_plan_id: string | null;
};

type MappedCreatedEvent = CreatedEventRecord & {
  event_type: CoreEventType;
  training_plan_id: string | null;
  legacy_event_type: DbEventType;
  scheduled_date: string;
  updated_at: string;
};

type ContentPermissions = ReturnType<typeof createContentAccessPermissions> | null;

type CreateEventUseCaseDependencies<
  TInput,
  TNormalized extends NormalizedCreateInput,
  TMappedEvent extends MappedCreatedEvent,
> = {
  assertRestDayWritesBlocked: (eventType: CoreEventType, action: "create") => void;
  buildInsightRefreshHint: (params: {
    trainingPlanId?: string | null;
    changedDate?: string | null;
    changeAt?: string;
  }) => unknown;
  buildMaterializedRecurrenceOccurrences: (input: {
    startsAt: string;
    endsAt: string | null;
    recurrence: NonNullable<TNormalized["recurrence"]>;
  }) => MaterializedOccurrence[];
  enqueueProviderPlannedActivityJobs: (
    ctx: ProtectedContext,
    input: { eventIds: string[]; operation: "publish" | "unsync"; profileId?: string },
  ) => Promise<PlannedWorkoutQueueResult | null>;
  ensurePersistableRecurrence: (recurrence: TNormalized["recurrence"]) => void;
  getContentPermissions: (ctx: Context) => ContentPermissions;
  getEventWriteRepository: (ctx: Context) => ReturnType<typeof createEventWriteRepository>;
  mapEvent: (event: unknown) => TMappedEvent;
  normalizeEventCreateInput: (input: TInput) => TNormalized;
  plannedEventType: DbEventType;
  toDbEventType: (eventType: CoreEventType) => DbEventType;
};

export async function createEventUseCase<
  TInput,
  TNormalized extends NormalizedCreateInput,
  TMappedEvent extends MappedCreatedEvent,
>(input: {
  ctx: ProtectedContext;
  input: TInput;
  dependencies: CreateEventUseCaseDependencies<TInput, TNormalized, TMappedEvent>;
}) {
  const { ctx, dependencies } = input;
  const eventWriteRepository = dependencies.getEventWriteRepository(ctx);
  const permissions = dependencies.getContentPermissions(ctx);
  const normalizedCreate = dependencies.normalizeEventCreateInput(input.input);
  const normalizedEventType = normalizedCreate.eventType;

  dependencies.assertRestDayWritesBlocked(normalizedEventType, "create");

  if (normalizedEventType === "imported") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Imported events are managed by integrations",
    });
  }

  const recurrence = normalizedCreate.recurrence;
  dependencies.ensurePersistableRecurrence(recurrence as TNormalized["recurrence"]);

  if (normalizedEventType === "planned" && !normalizedCreate.activityPlanId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: 'activity_plan_id is required when event_type is "planned"',
    });
  }

  if (normalizedCreate.activityPlanId) {
    if (permissions) {
      await permissions.requireRead(
        ctx.session.user.id,
        { type: "activity_plan", id: normalizedCreate.activityPlanId },
        "Activity plan not found or not accessible",
      );
    } else {
      const activityPlan = await eventWriteRepository.getAccessibleActivityPlan({
        activityPlanId: normalizedCreate.activityPlanId,
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

  const trainingPlanId = normalizedCreate.trainingPlanId;

  if (trainingPlanId) {
    if (permissions) {
      await permissions.requireRead(
        ctx.session.user.id,
        { type: "training_plan", id: trainingPlanId },
        "Training plan not found or not accessible",
      );
    } else {
      const trainingPlan = await eventWriteRepository.getOwnedTrainingPlan({
        profileId: ctx.session.user.id,
        trainingPlanId,
      });

      if (!trainingPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Training plan not found or not accessible",
        });
      }
    }
  }

  let data;
  let createdEvents: CreatedEventRecord[] = [];
  try {
    const occurrences = recurrence
      ? dependencies.buildMaterializedRecurrenceOccurrences({
          startsAt: normalizedCreate.startsAt,
          endsAt: normalizedCreate.endsAt,
          recurrence,
        })
      : [
          {
            startsAt: normalizedCreate.startsAt,
            endsAt: normalizedCreate.endsAt,
            occurrenceKey: "",
          },
        ];

    data = await eventWriteRepository.createOwnedEvent({
      profileId: ctx.session.user.id,
      eventType: dependencies.toDbEventType(normalizedEventType),
      title: normalizedCreate.title,
      allDay: normalizedCreate.allDay,
      timezone: normalizedCreate.timezone,
      startsAt: occurrences[0]?.startsAt ?? normalizedCreate.startsAt,
      endsAt: occurrences[0]?.endsAt ?? normalizedCreate.endsAt,
      status: normalizedCreate.status,
      activityPlanId: normalizedCreate.activityPlanId,
      trainingPlanId,
      notes: normalizedCreate.notes,
      description: normalizedCreate.description,
      recurrenceRule: recurrence?.rule ?? null,
      recurrenceTimezone: recurrence?.timezone ?? null,
      seriesId: null,
      occurrenceKey: recurrence ? (occurrences[0]?.occurrenceKey ?? null) : null,
      originalStartsAt: recurrence ? (occurrences[0]?.startsAt ?? null) : null,
      sourceProvider: normalizedCreate.sourceProvider,
    });
    createdEvents = [data as CreatedEventRecord];

    for (const occurrence of occurrences.slice(1)) {
      const occurrenceData = await eventWriteRepository.createOwnedEvent({
        profileId: ctx.session.user.id,
        eventType: dependencies.toDbEventType(normalizedEventType),
        title: normalizedCreate.title,
        allDay: normalizedCreate.allDay,
        timezone: normalizedCreate.timezone,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        status: normalizedCreate.status,
        activityPlanId: normalizedCreate.activityPlanId,
        trainingPlanId,
        notes: normalizedCreate.notes,
        description: normalizedCreate.description,
        recurrenceRule: recurrence?.rule ?? null,
        recurrenceTimezone: recurrence?.timezone ?? null,
        seriesId: data.id,
        occurrenceKey: occurrence.occurrenceKey,
        originalStartsAt: occurrence.startsAt,
        sourceProvider: normalizedCreate.sourceProvider,
      });
      createdEvents.push(occurrenceData as CreatedEventRecord);
    }
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Failed to create event",
    });
  }

  const event = dependencies.mapEvent(data);

  if (permissions) {
    for (const createdEvent of createdEvents) {
      await permissions.grantEventContentAccess({
        actorProfileId: ctx.session.user.id,
        granteeProfileId: createdEvent.profile_id,
        eventId: createdEvent.id,
        activityPlanId: createdEvent.activity_plan_id,
        trainingPlanId: createdEvent.training_plan_id,
      });
    }
  }

  let plannedWorkoutSyncResult: PlannedWorkoutQueueResult | null = null;
  if (event.legacy_event_type === dependencies.plannedEventType) {
    try {
      plannedWorkoutSyncResult = await dependencies.enqueueProviderPlannedActivityJobs(ctx, {
        eventIds: createdEvents.map((createdEvent) => createdEvent.id),
        operation: "publish",
      });
    } catch (error) {
      logger.error("Failed to enqueue planned workout sync", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      plannedWorkoutSyncResult = {
        affectedCount: 1,
        operation: "publish",
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
    insight_refresh_hint: dependencies.buildInsightRefreshHint({
      trainingPlanId: event.training_plan_id,
      changedDate: event.scheduled_date,
      changeAt: event.updated_at,
    }),
  };
}

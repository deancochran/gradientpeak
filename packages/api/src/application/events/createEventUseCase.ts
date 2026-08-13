import { activityPlanStructureSchema } from "@repo/core";
import type { PublicEventStatus } from "@repo/db";
import { TRPCError } from "@trpc/server";
import type { Context } from "../../context";
import type { createEventWriteRepository } from "../../infrastructure/repositories";
import { logger } from "../../lib/logger";
import type { WahooPlannedActivityQueueResult } from "../../lib/provider-sync/planned-activities";
import type { createContentAccessPermissions } from "../../permissions/content-access";

type ProtectedContext = Context & {
  session: NonNullable<Context["session"]> & {
    user: NonNullable<NonNullable<Context["session"]>["user"]>;
  };
};

type CoreEventType = "planned" | "race_target" | "custom";

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
  } | null;
  routeId: string | null;
  scheduledDate: string;
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
  enqueueWahooPlannedActivityJobs: (
    ctx: ProtectedContext,
    input: { eventIds: string[]; operation: "publish" | "unsync"; profileId?: string },
  ) => Promise<WahooPlannedActivityQueueResult | null>;
  getContentPermissions: (ctx: Context) => ContentPermissions;
  getEventWriteRepository: (ctx: Context) => ReturnType<typeof createEventWriteRepository>;
  mapEvent: (event: unknown) => TMappedEvent;
  normalizeEventCreateInput: (input: TInput) => TNormalized;
  toDbEventType: (eventType: CoreEventType) => CoreEventType;
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

  const recurrence = normalizedCreate.recurrence;
  if (
    normalizedEventType === "planned" &&
    !normalizedCreate.activityPlanId &&
    !normalizedCreate.routeId
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A planned event requires activity_plan_id or route_id",
    });
  }

  if (normalizedCreate.activityPlanId) {
    if (permissions) {
      await permissions.requireRead(
        ctx.session.user.id,
        { type: "activity_plan", id: normalizedCreate.activityPlanId },
        "Activity plan not found or not accessible",
      );
    }
    const activityPlan = permissions
      ? await eventWriteRepository.getActivityPlanById({
          activityPlanId: normalizedCreate.activityPlanId,
        })
      : await eventWriteRepository.getAccessibleActivityPlan({
          activityPlanId: normalizedCreate.activityPlanId,
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

  if (normalizedCreate.routeId) {
    if (permissions) {
      await permissions.requireRead(
        ctx.session.user.id,
        { type: "activity_route", id: normalizedCreate.routeId },
        "Route not found or not accessible",
      );
    } else {
      const route = await eventWriteRepository.getAccessibleActivityRoute({
        profileId: ctx.session.user.id,
        routeId: normalizedCreate.routeId,
      });

      if (!route) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Route not found or not accessible",
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

  let data: CreatedEventRecord | undefined;
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

    const sharedEventInput = {
      profileId: ctx.session.user.id,
      eventType: dependencies.toDbEventType(normalizedEventType),
      title: normalizedCreate.title,
      allDay: normalizedCreate.allDay,
      timezone: normalizedCreate.timezone,
      scheduledDate: normalizedCreate.scheduledDate,
      startsAt: occurrences[0]?.startsAt ?? normalizedCreate.startsAt,
      endsAt: occurrences[0]?.endsAt ?? normalizedCreate.endsAt,
      status: normalizedCreate.status,
      activityPlanId: normalizedCreate.activityPlanId,
      trainingPlanId,
      notes: normalizedCreate.notes,
      description: normalizedCreate.description,
      recurrenceRule: recurrence?.rule ?? null,
      recurrenceTimezone: recurrence?.timezone ?? null,
      routeId: normalizedCreate.routeId,
    };

    createdEvents = (await eventWriteRepository.createOwnedEvents({
      anchor: {
        ...sharedEventInput,
        scheduledDate: recurrence
          ? (occurrences[0]?.occurrenceKey ?? normalizedCreate.scheduledDate)
          : normalizedCreate.scheduledDate,
        seriesId: null,
        occurrenceKey: recurrence ? (occurrences[0]?.occurrenceKey ?? null) : null,
        originalStartsAt: recurrence ? (occurrences[0]?.startsAt ?? null) : null,
      },
      occurrences: occurrences.slice(1).map((occurrence) => ({
        ...sharedEventInput,
        scheduledDate: occurrence.occurrenceKey,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        occurrenceKey: occurrence.occurrenceKey,
        originalStartsAt: occurrence.startsAt,
      })),
    })) as CreatedEventRecord[];
    data = createdEvents[0];

    if (!data) {
      throw new Error("Failed to create event");
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

  let plannedActivitySyncResult: WahooPlannedActivityQueueResult | null = null;
  // Route-only Wahoo targets are terminally unsupported; avoid a no-op publish job.
  if (event.event_type === "planned" && normalizedCreate.activityPlanId) {
    try {
      plannedActivitySyncResult = await dependencies.enqueueWahooPlannedActivityJobs(ctx, {
        eventIds: createdEvents.map((createdEvent) => createdEvent.id),
        operation: "publish",
      });
    } catch (error) {
      logger.error("Failed to enqueue planned activity sync", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      plannedActivitySyncResult = {
        affectedCount: 1,
        operation: "publish",
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
    insight_refresh_hint: dependencies.buildInsightRefreshHint({
      trainingPlanId: event.training_plan_id,
      changedDate: event.scheduled_date,
      changeAt: event.updated_at,
    }),
  };
}

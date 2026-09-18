import type { PublicEventStatus } from "@repo/db";
import { TRPCError } from "@trpc/server";
import type { Context } from "../../context";
import type { createEventWriteRepository } from "../../infrastructure/repositories";
import type { WahooPlannedActivityQueueResult } from "../../lib/provider-sync/planned-activities";
import type { createContentAccessPermissions } from "../../permissions/content-access";

type ProtectedContext = Context & {
  session: NonNullable<Context["session"]> & {
    user: NonNullable<NonNullable<Context["session"]>["user"]>;
  };
};

type CoreEventType = "race_target" | "custom";

type NormalizedCreateInput = {
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
};

type MaterializedOccurrence = {
  startsAt: string;
  endsAt: string | null;
  occurrenceKey: string;
};

type CreatedEventRecord = {
  id: string;
  profile_id: string;
};

type MappedCreatedEvent = CreatedEventRecord & {
  event_type: CoreEventType;
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
  enqueueWahooPlannedActivityJobs?: (
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
      });
    }
  }

  return {
    ...event,
    insight_refresh_hint: dependencies.buildInsightRefreshHint({
      changedDate: event.scheduled_date,
      changeAt: event.updated_at,
    }),
  };
}
